// 云同步配置：Supabase 项目的 URL 与 publishable key。
// anon / publishable key 本来就是要给浏览器的公开 key，真正的权限靠 Supabase 的鉴权：
// 进度只存在各人自己的 auth user_metadata 里，只有本人 token 能读写。
// 留空 = 只用浏览器本地进度。
window.MEMO_QUIZ_CLOUD = {
  url: 'https://hmycbzlnvojnsulrwhba.supabase.co',
  anonKey: 'sb_publishable_0BlIURgutEj4Wjrpi5Yk4w_hpVFGIqI',

  // 绑定墨墨账号用的中转（Supabase Edge Function）。
  // 墨墨开放 API 见到 Origin 头就 403，浏览器不能直连，所以由这个函数代发；
  // 需要先按 supabase/functions/memo/index.ts 部署，函数名 memo。
  // 留空 = 只能用「每天 50 个词」通用题库，不能绑定自己的墨墨账号。
  memoProxy: 'https://hmycbzlnvojnsulrwhba.supabase.co/functions/v1/memo',
};