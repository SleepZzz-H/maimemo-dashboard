// 把看板生成成一个纯静态页面：数据直接内联进 HTML，不需要 node 服务。
// 产物在 docs/，推上去就能用 GitHub Pages 打开，或者把 index.html 单独发给别人。
//
// 用法：node tools/build-static.mjs [--data-dir <目录>] [--out <目录>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildData, buildQuizPool } from '../app/model.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function argOf(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const DATA_DIR = path.resolve(argOf('--data-dir', ROOT));
const OUT = path.resolve(argOf('--out', path.join(ROOT, 'docs')));
const APP = path.join(ROOT, 'app');

const data = buildData(DATA_DIR);
if (!data.ok) {
  console.error('生成失败：' + (data.error || '未知错误'));
  process.exit(1);
}

// 静态版不需要这些字段，去掉能省一点体积
const slim = { ...data, items: data.items.map((x) => ({ ...x, tg: undefined, stars: undefined })) };

const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const marker = '<script>\nconst $ = (id)';
if (!html.includes(marker)) {
  console.error('app/index.html 的结构变了：找不到主脚本开头。');
  process.exit(1);
}

const payload = JSON.stringify(slim).replace(/</g, '\\u003c');
const withData = html
  .replace(marker, `<script>window.__STATIC_DATA__ = ${payload};</script>\n${marker}`)
  .replace('<meta name="viewport"', '<meta name="robots" content="noindex, nofollow" />\n<meta name="viewport"');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), withData, 'utf8');

// 每日测验页：词库（词 + 中文释义 + 难度分）内联进去，离线也能做题
const quizPool = buildQuizPool(DATA_DIR);
if (!quizPool.ok) {
  console.error('测验页生成失败：' + (quizPool.error || '未知错误'));
  process.exit(1);
}
const quizHtml = fs.readFileSync(path.join(APP, 'quiz.html'), 'utf8');
const quizMarker = '<script>\nconst $ = (id)';
if (!quizHtml.includes(quizMarker)) {
  console.error('app/quiz.html 的结构变了：找不到主脚本开头。');
  process.exit(1);
}
const poolPayload = JSON.stringify({ updatedAt: quizPool.updatedAt, count: quizPool.count, pool: quizPool.pool })
  .replace(/</g, '\\u003c');
fs.writeFileSync(
  path.join(OUT, 'quiz.html'),
  quizHtml
    .replace(quizMarker, `<script>window.__QUIZ_POOL__ = ${poolPayload};</script>\n${quizMarker}`)
    .replace('<meta name="viewport"', '<meta name="robots" content="noindex, nofollow" />\n<meta name="viewport"'),
  'utf8'
);

// 图标与清单：所有路径改成相对路径，放在 /<repo>/ 子路径下也能用
fs.cpSync(path.join(APP, 'icons'), path.join(OUT, 'icons'), { recursive: true });
fs.copyFileSync(path.join(APP, 'favicon.ico'), path.join(OUT, 'favicon.ico'));
fs.copyFileSync(path.join(APP, 'icons', 'apple-touch-icon.png'), path.join(OUT, 'apple-touch-icon.png'));

const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.webmanifest'), 'utf8'));
manifest.start_url = './';
manifest.scope = './';
manifest.icons = manifest.icons.map((i) => ({ ...i, src: i.src.replace(/^\//, '') }));
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
const size = fs.statSync(path.join(OUT, 'index.html')).size;
console.log(`静态版已生成：${path.join(OUT, 'index.html')}（${kb(size)}）`);
console.log(`收录 ${data.totals.words} 个词 · 更新于 ${data.updatedAt || data.generatedAt}`);
console.log(`事件 ${data.eventCount} 条（模糊 ${data.totals.vague} / 忘记 ${data.totals.forget}）`);
console.log(
  `测验页：${path.join(OUT, 'quiz.html')}（${kb(fs.statSync(path.join(OUT, 'quiz.html')).size)}，` +
    `词库 ${quizPool.count} 个词${quizPool.missing ? `，缺释义 ${quizPool.missing}` : ''}）`
);