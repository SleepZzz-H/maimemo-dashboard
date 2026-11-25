import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { buildData } from './model.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..');
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
      return json(200, buildData(DATA_DIR));
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
