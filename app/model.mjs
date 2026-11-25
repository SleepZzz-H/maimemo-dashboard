// 看板的数据模型：把 state.json + events.jsonl 聚合成前端要的 items。
// server.mjs（本地服务）和 tools/build-static.mjs（生成静态页）共用这一份逻辑。

import fs from 'node:fs';
import path from 'node:path';

export const RESP = {
  FAMILIAR: '熟悉',
  VAGUE: '模糊',
  FORGET: '忘记',
  WELL_FAMILIAR: '很熟',
  STUDY_RESPONSE_UNSPECIFIED: '未标',
  UNKNOWN: '未知',
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function readEvents(eventsFile) {
  const agg = new Map();
  let total = 0;
  let raw = '';
  try {
    raw = fs.readFileSync(eventsFile, 'utf8');
  } catch {
    return { agg, total };
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.kind === 'BASELINE') continue;
    total++;
    const cur = agg.get(ev.id) || { vague: 0, forget: 0, familiar: 0, unknown: 0, total: 0 };
    if (ev.kind === 'VAGUE') cur.vague++;
    else if (ev.kind === 'FORGET') cur.forget++;
    else if (ev.kind === 'FAMILIAR' || ev.kind === 'WELL_FAMILIAR') cur.familiar++;
    else cur.unknown++;
    cur.total++;
    agg.set(ev.id, cur);
  }
  return { agg, total };
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  return Math.round((t2 - t1) / 86400000);
}

export function buildData(dataDir) {
  const stateFile = path.join(dataDir, 'state.json');
  const eventsFile = path.join(dataDir, 'events.jsonl');
  const state = readJson(stateFile, null);
  if (!state || !state.words) {
    return { error: '还没有 state.json，先跑一次 snapshot。', ok: false };
  }
  const { agg, total: eventCount } = readEvents(eventsFile);
  const now = Date.now();
  const items = [];

  for (const [id, w] of Object.entries(state.words)) {
    const ev = agg.get(id) || { vague: 0, forget: 0, familiar: 0, unknown: 0, total: 0 };
    const tags = Array.isArray(w.tags) ? w.tags : [];
    const sticky = tags.includes('STICKING') ? 1 : 0;
    const lr = w.last_response || '';
    const studyCount = Number(w.study_count) || 0;

    // 综合难度分：事件权重 + 代理指标（历史事件还没攒够时靠标签和复习次数）
    let score = ev.vague * 3 + ev.forget * 6 + sticky * 2 + Math.min(studyCount, 25) * 0.3;
    if (lr === 'VAGUE') score += 1.5;
    if (lr === 'FORGET') score += 4;
    if (lr === 'WELL_FAMILIAR') score -= 1;

    const nextTs = Date.parse(w.next_study || '');
    items.push({
      id,
      w: w.spelling || '',
      sc: studyCount,
      ls: w.last_study || '',
      ns: w.next_study || '',
      lr,
      lrCn: RESP[lr] || lr || '',
      tg: tags,
      sticky,
      v: ev.vague,
      f: ev.forget,
      fa: ev.familiar,
      un: ev.unknown,
      ev: ev.total,
      stars: sticky + Math.min(studyCount, 25) * 0.3,
      dueIn: Number.isNaN(nextTs) ? null : Math.round((nextTs - now) / 86400000),
      interval: daysBetween(w.last_study, w.next_study),
      score: Math.round(score * 10) / 10,
    });
  }

  items.sort((a, b) => b.score - a.score || b.sc - a.sc || a.w.localeCompare(b.w));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    updatedAt: state.updatedAt || '',
    hasEvents: eventCount > 0,
    eventCount,
    totals: {
      words: items.length,
      vague: items.reduce((s, x) => s + x.v, 0),
      forget: items.reduce((s, x) => s + x.f, 0),
      familiar: items.reduce((s, x) => s + x.fa, 0),
      unknown: items.reduce((s, x) => s + x.un, 0),
      sticky: items.filter((x) => x.sticky).length,
      vagueWords: items.filter((x) => x.v > 0 || x.lr === 'VAGUE').length,
      forgetWords: items.filter((x) => x.f > 0 || x.lr === 'FORGET').length,
      dueNow: items.filter((x) => x.dueIn !== null && x.dueIn <= 0).length,
    },
    items,
  };
}

// 把「n. 底，底部；尽头，远端；最低水平…」压成适合做选项的短释义
export function shortenGloss(raw) {
  if (!raw) return '';
  const text = String(raw).trim();
  const posMatch = text.match(/^([a-z]+\.)\s*/i);
  const pos = posMatch ? posMatch[1] + ' ' : '';
  const body = posMatch ? text.slice(posMatch[0].length) : text;
  const first = body.split('；').map((s) => s.trim()).filter(Boolean)[0] || '';
  let out = first;
  if (out.length > 26) {
    const segs = out.split('，');
    out = segs[0];
    for (let i = 1; i < segs.length && (out + '，' + segs[i]).length <= 26; i++) out += '，' + segs[i];
  }
  out = out.replace(/[（(][^）)]*[）)]/g, '').trim() || out;
  return (pos + out).slice(0, 30).trim();
}

// 每日测验的词库：词 + 中文释义 + 难度分（墨墨 API 不给释义，用 quiz/glosses.json 补）
export function buildQuizPool(dataDir) {
  const data = buildData(dataDir);
  if (!data.ok) return data;
  let glosses = {};
  try {
    glosses = JSON.parse(fs.readFileSync(path.join(dataDir, 'quiz', 'glosses.json'), 'utf8'));
  } catch {
    glosses = {};
  }
  const pool = [];
  for (const it of data.items) {
    const cn = shortenGloss(glosses[it.w]);
    if (!cn) continue;
    pool.push({ w: it.w, cn, s: it.score, sc: it.sc, lr: it.lr, ns: it.ns, v: it.v || 0, f: it.f || 0, sticky: it.sticky || 0 });
  }
  return {
    ok: true,
    updatedAt: data.updatedAt,
    count: pool.length,
    missing: data.items.length - pool.length,
    pool,
  };
}