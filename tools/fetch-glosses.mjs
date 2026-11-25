// 抓中文释义：墨墨开放 API 不给词典释义（interp 只返回「用户自己加的释义」，基本为空），
// 所以这里用有道词典的公开 jsonapi 补一份，结果缓存成 quiz/glosses.json，可断点续跑。
//
// 用法：node tools/fetch-glosses.mjs [--limit 500] [--force]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATE = path.join(ROOT, 'state.json');
const OUT_DIR = path.join(ROOT, 'quiz');
const OUT = path.join(OUT_DIR, 'glosses.json');

const limit = (() => {
  const i = process.argv.indexOf('--limit');
  return i > -1 ? Number(process.argv[i + 1]) : Infinity;
})();
const force = process.argv.includes('--force');

const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
const words = Object.values(state.words || {}).map((w) => w.spelling).filter(Boolean);
fs.mkdirSync(OUT_DIR, { recursive: true });
const cache = force || !fs.existsSync(OUT) ? {} : JSON.parse(fs.readFileSync(OUT, 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clean(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/^[a-z]+\.\s*/i, (m) => m) // 保留词性前缀
    .trim();
}

async function glossOf(word) {
  const url = 'https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(word);
  const ctl = AbortSignal.timeout(9000);
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: ctl });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const ec = j.ec && j.ec.word && j.ec.word[0];
  const senses = [];
  for (const trs of (ec && ec.trs) || []) {
    for (const tr of trs.tr || []) {
      const text = clean(tr.l && tr.l.i && tr.l.i[0]);
      if (text && !senses.includes(text)) senses.push(text);
    }
  }
  if (!senses.length) {
    // 词组/未收录：退回网页释义
    const wt = j.web_trans && j.web_trans['web-translation'];
    for (const item of (Array.isArray(wt) ? wt : []) || []) {
      for (const tr of item.trs || []) {
        const text = clean(tr.trans && tr.trans[0] && tr.trans[0].value);
        if (text && !senses.includes(text)) senses.push(text);
      }
    }
  }
  if (!senses.length) return null;
  return senses.slice(0, 2).join('；').slice(0, 60);
}

const todo = words.filter((w) => force || !cache[w]).slice(0, limit === Infinity ? undefined : limit);
console.log(`共 ${words.length} 个词，待抓 ${todo.length} 个（已有 ${Object.keys(cache).length}）`);

let done = 0;
let failed = 0;
const CONCURRENCY = 3;

async function worker(queue) {
  while (queue.length) {
    const w = queue.shift();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const cn = await glossOf(w);
        cache[w] = cn || '';
        break;
      } catch (e) {
        if (attempt === 2) {
          failed++;
          cache[w] = cache[w] || '';
          console.error(`失败 ${w}: ${e.message}`);
        } else {
          await sleep(600 * (attempt + 1));
        }
      }
    }
    done++;
    if (done % 50 === 0) {
      fs.writeFileSync(OUT, JSON.stringify(cache, null, 0), 'utf8');
      console.log(`  ${done}/${todo.length} …`);
    }
    await sleep(120);
  }
}

// 三个 worker 共用同一个队列（别各自 slice 一份，否则每个词会被抓三遍）
const queue = todo.slice();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
fs.writeFileSync(OUT, JSON.stringify(cache, null, 0), 'utf8');

const ok = Object.values(cache).filter(Boolean).length;
console.log(`完成：${ok} 个词有中文释义，${Object.keys(cache).length - ok} 个没抓到（失败 ${failed}）`);
console.log('缓存：' + OUT);