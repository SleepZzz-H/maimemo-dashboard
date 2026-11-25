// Supabase Edge Function：给浏览器当「中转」
//
// 为什么需要它：墨墨开放 API 只要看到请求带 Origin 头（浏览器发起的跨域请求）
// 就返回 403 common_permission_denied；有道词典接口没有 CORS 头。两者都得由服务端代发。
//
// 两个动作：
//   POST /functions/v1/memo?act=api   头 x-memo-token: <墨墨 API token>
//        body: {"path": "/open/api/v1/memo/study/query_study_records", "body": {...}}
//        → 原样转发到墨墨，返回它自己的 JSON
//   GET  /functions/v1/memo?act=dict&w=word
//        → 取有道的中文释义，返回 {"ok":true,"w":"word","gloss":"n. ..."}
//
// 只允许 /open/api/v1/ 前缀，防止被当成任意代理使用。

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-memo-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const MEMO_HOST = 'https://open.maimemo.com';
const API_PREFIX = '/open/api/v1/';

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const act = url.searchParams.get('act') || 'api';

  try {
    if (act === 'ping') return json({ ok: true, act: 'ping', v: 1 });
    if (act === 'dict') return await dict(url.searchParams.get('w') || '');
    return await proxyMemo(req);
  } catch (e) {
    return json({ ok: false, err: String((e as Error)?.message || e) }, 500);
  }
});

async function proxyMemo(req: Request): Promise<Response> {
  const token = (req.headers.get('x-memo-token') || '').trim();
  if (!token) return json({ ok: false, err: '缺少墨墨 token' }, 400);

  let payload: { path?: string; body?: unknown } = {};
  try {
    payload = JSON.parse((await req.text()) || '{}');
  } catch {
    return json({ ok: false, err: '请求体不是合法 JSON' }, 400);
  }

  const path = String(payload.path || '');
  if (!path.startsWith(API_PREFIX)) return json({ ok: false, err: '只允许转发 /open/api/v1/ 下的接口' }, 400);

  const res = await fetch(MEMO_HOST + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(payload.body ?? {}),
    signal: AbortSignal.timeout(20000),
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { ...CORS, 'content-type': res.headers.get('content-type') || 'application/json; charset=utf-8' },
  });
}

async function dict(word: string): Promise<Response> {
  const w = word.trim();
  if (!w) return json({ ok: false, err: '缺少单词' }, 400);

  const res = await fetch('https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(w), {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return json({ ok: false, err: '有道返回 HTTP ' + res.status }, 502);

  const data = await res.json();
  const gloss = pickGloss(data) || pickWebTrans(data) || '';
  return json({ ok: true, w, gloss });
}

function pickGloss(data: any): string {
  const ec = data && data.ec && data.ec.word;
  const first = Array.isArray(ec) ? ec[0] : null;
  const trs = first && first.trs;
  if (!Array.isArray(trs)) return '';
  const parts: string[] = [];
  for (const t of trs) {
    const tr = t && t.tr;
    if (!Array.isArray(tr)) continue;
    for (const one of tr) {
      const v = one && one.l && one.l.i && one.l.i[0];
      if (typeof v === 'string' && v.trim()) parts.push(v.trim());
      if (parts.length >= 3) break;
    }
    if (parts.length >= 3) break;
  }
  return parts.join('；');
}

function pickWebTrans(data: any): string {
  const wt = data && data.web_trans;
  const list = wt && (wt['web-translation'] || wt.translation);
  const first = Array.isArray(list) ? list[0] : null;
  const v = first && first.trans && first.trans[0] && first.trans[0].value;
  return typeof v === 'string' ? v : '';
}