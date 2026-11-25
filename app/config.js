// 云同步配置：在 Supabase 项目里 Project Settings → API 拿这两个值填进来。
// anon key 本来就是要给浏览器的公开 key，真正的权限靠 Supabase 的行级策略（这里用 auth 的 user_metadata，只有本人能读写）。
// 留空 = 只用浏览器本地进度。
window.MEMO_QUIZ_CLOUD = {
  url: '',
  anonKey: '',
};