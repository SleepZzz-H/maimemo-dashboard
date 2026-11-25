import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const SCRIPT = path.join(DATA_DIR, 'memo-history.ps1');
const PORT = Number(process.env.PORT || 8787);

const STATIC = {
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  '/favicon.ico': ['icons/favicon.ico', 'image/x-icon'],
  '/apple-touch-icon.png': ['icons/apple-touch-icon.png', 'image/png'],
};

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue;
      out.push({ iface: name, address: a.address });
    }
  }
  return out;
}

const RESP = {
  FAMILIAR: '熟悉',
  VAGUE: '模糊',
  FORGET: '忘记',
  WELL_FAMILIAR: '很熟',
  STUDY_RESPONSE_UNSPECIFIED: '未标',
  UNKNOWN: '未知',
};

const syncState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  ok: null,
  message: '',
  log: [],
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function readEvents() {
  const agg = new Map();
  let total = 0;
  let raw = '';
  try {
    raw = fs.readFileSync(EVENTS_FILE, 'utf8');
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

function buildData() {
  const state = readJson(STATE_FILE, null);
  if (!state || !state.words) {
    return { error: '还没有 state.json，先跑一次 snapshot。', ok: false };
  }
  const { agg, total: eventCount } = readEvents();
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

function startSync() {
  if (syncState.running) return false;
  syncState.running = true;
  syncState.startedAt = new Date().toISOString();
  syncState.finishedAt = null;
  syncState.ok = null;
  syncState.message = '正在拉取墨墨学习记录…';
  syncState.log = [];

  const psCommand = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; & '${SCRIPT}' snapshot`;
  const child = spawn(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const killTimer = setTimeout(() => {
    push('超过 6 分钟仍未完成，已强制结束。');
    try { child.kill(); } catch {}
  }, 360000);
  const push = (s) => {
    const text = String(s).trim();
    if (!text) return;
    syncState.log.push(text);
    if (syncState.log.length > 40) syncState.log.shift();
  };
  child.stdout.on('data', (d) => push(d.toString('utf8')));
  child.stderr.on('data', (d) => push(d.toString('utf8')));
  child.on('error', (e) => {
    syncState.running = false;
    syncState.ok = false;
    syncState.finishedAt = new Date().toISOString();
    syncState.message = '启动失败：' + e.message;
  });
  child.on('close', (code) => {
    clearTimeout(killTimer);
    syncState.running = false;
    syncState.ok = code === 0;
    syncState.finishedAt = new Date().toISOString();
    const last = syncState.log[syncState.log.length - 1] || '';
    syncState.message = code === 0 ? last || '同步完成' : last || `失败（退出码 ${code}）`;
  });
  return true;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (code, type, body) => {
    res.writeHead(code, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(body);
  };
  const json = (code, obj) => send(code, 'application/json; charset=utf-8', JSON.stringify(obj));

  try {
    if (url.pathname === '/api/health') {
      return json(200, { ok: true, port: PORT, dataDir: DATA_DIR });
    }
    if (url.pathname === '/api/data') {
      return json(200, buildData());
    }
    if (url.pathname === '/api/sync' && req.method === 'POST') {
      const started = startSync();
      return json(started ? 202 : 409, { started, ...syncState });
    }
    if (url.pathname === '/api/sync') {
      return json(200, syncState);
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      return send(200, 'text/html; charset=utf-8', html);
    }
    if (url.pathname === '/api/lan') {
      return json(200, { port: PORT, addresses: lanAddresses() });
    }
    let staticHit = STATIC[url.pathname];
    if (!staticHit && url.pathname.startsWith('/icons/') && url.pathname.endsWith('.png')) {
      staticHit = ['icons/' + path.basename(url.pathname), 'image/png'];
    }
    if (staticHit) {
      const file = path.join(__dirname, staticHit[0]);
      if (!fs.existsSync(file)) return json(404, { error: 'not found' });
      return send(200, staticHit[1], fs.readFileSync(file));
    }
    return json(404, { error: 'not found' });
  } catch (err) {
    return json(500, { error: String(err && err.message ? err.message : err) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`墨墨难词看板已启动: http://localhost:${PORT}`);
  console.log(`数据目录: ${DATA_DIR}`);
});