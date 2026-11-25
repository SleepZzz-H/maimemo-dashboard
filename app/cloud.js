// 极简 Supabase 客户端：只用 REST，不引 CDN 依赖（国内访问 CDN 经常不稳）。
// 需要先在 Supabase 项目里关掉「Confirm email」，注册后可以直接拿 session。
//
// 对外：window.Cloud
//   configured()           是否填了 config.js 里的 URL / anon key
//   user()                 当前登录用户 {id, email} 或 null
//   signIn/signUp/signOut
//   pull()                 拉当前用户的学习进度
//   push(progress)         存当前用户的学习进度（存在 auth user 的 metadata 里，不用建表）
//   onChange(cb)           登录状态变化时回调

(function () {
  const CFG = window.MEMO_QUIZ_CLOUD || {};
  const URL = (CFG.url || '').replace(/\/+$/, '');
  const KEY = CFG.anonKey || '';
  const SK = 'maimemo-auth-v1';
  const listeners = [];

  function configured() {
    return !!(URL && KEY);
  }

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(SK) || 'null');
    } catch {
      return null;
    }
  }

  function writeSession(s) {
    try {
      if (s) localStorage.setItem(SK, JSON.stringify(s));
      else localStorage.removeItem(SK);
    } catch {}
  }

  function sessionUser(s) {
    if (!s || !s.user) return null;
    return { id: s.user.id, email: s.user.email || '', meta: s.user.user_metadata || {} };
  }

  function user() {
    return sessionUser(readSession());
  }

  function notify() {
    const u = user();
    for (const cb of listeners) {
      try { cb(u); } catch {}
    }
  }

  function onChange(cb) {
    listeners.push(cb);
    cb(user());
  }

  function headers(token) {
    const h = { apikey: KEY, 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  async function call(path, opts = {}) {
    const res = await fetch(URL + path, opts);
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!res.ok) {
      const msg = (body && (body.msg || body.error_description || body.message || body.error)) || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  function expiresAt(body) {
    return Date.now() + (Number(body.expires_in || 3600) - 60) * 1000;
  }

  function saveAuth(body) {
    const s = {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: expiresAt(body),
      user: body.user,
    };
    writeSession(s);
    notify();
    return s;
  }

  async function signIn(email, password) {
    const body = await call('/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password }),
    });
    return saveAuth(body);
  }

  async function signUp(email, password) {
    const body = await call('/auth/v1/signup', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password, data: { quiz: null } }),
    });
    if (body && body.access_token) return saveAuth(body);
    // 没开「关闭邮箱确认」时走到这里：账号建了，但要先点邮件里的确认链接
    return { needConfirm: true, user: body && body.user };
  }

  async function refresh() {
    const s = readSession();
    if (!s || !s.refresh_token) return null;
    const body = await call('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    return saveAuth(body);
  }

  async function token() {
    const s = readSession();
    if (!s) throw new Error('没有登录');
    if (s.expires_at && Date.now() > s.expires_at) {
      const fresh = await refresh();
      if (!fresh) throw new Error('登录已过期，请重新登录');
      return fresh.access_token;
    }
    return s.access_token;
  }

  function signOut() {
    writeSession(null);
    notify();
  }

  async function pull() {
    const t = await token();
    const body = await call('/auth/v1/user', { headers: headers(t) });
    const meta = (body && body.user_metadata) || {};
    return { quiz: meta.quiz || null, meta };
  }

  async function push(quiz, extra) {
    const t = await token();
    const body = await call('/auth/v1/user', {
      method: 'PUT',
      headers: headers(t),
      body: JSON.stringify({ data: Object.assign({ quiz }, extra || {}) }),
    });
    const s = readSession();
    if (s && body) {
      s.user = body;
      writeSession(s);
    }
    return true;
  }

  window.Cloud = { configured, user, signIn, signUp, signOut, pull, push, onChange, refresh };
})();