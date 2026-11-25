// 云同步配置：Supabase 项目的 URL 与 publishable key。
// anon / publishable key 本来就是要给浏览器的公开 key，真正的权限靠 Supabase 的鉴权：
// 进度只存在各人自己的 auth user_metadata 里，只有本人 token 能读写。
// 留空 = 只用浏览器本地进度。
window.MEMO_QUIZ_CLOUD = {
  url: 'https://hmycbzlnvojnsulrwhba.supabase.co',
  anonKey: 'sb_publishable_0BlIURgutEj4Wjrpi5Yk4w_hpVFGIqI',
};