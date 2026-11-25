# Supabase 边缘函数：墨墨 / 有道的浏览器中转

浏览器不能直接调墨墨开放 API：请求带 `Origin` 头时服务端一律返回 `403 common_permission_denied`（不带就 200）。有道词典接口则没有 CORS 头。所以测验页里「绑定墨墨账号」要靠一个服务端中转，这里用的是你自己 Supabase 项目上的免费 Edge Function。

函数在 [`functions/memo/index.ts`](functions/memo/index.ts)，两个动作：

| 请求 | 作用 |
| --- | --- |
| `POST /functions/v1/memo?act=api`（头 `x-memo-token: <Token>`，体 `{"path":"/open/api/v1/...","body":{...}}`） | 原样转发到 `https://open.maimemo.com`，只放行 `/open/api/v1/` 前缀 |
| `GET /functions/v1/memo?act=dict&w=word` | 取有道的中文释义 |
| `GET /functions/v1/memo?act=ping` | 自检，返回 `{"ok":true}` |

## 部署（网页上点几下就行）

1. 打开 Supabase 项目 → 左侧 **Edge Functions** → **Deploy a new function**
2. 名字填 **`memo`**（必须是这个名字，`app/config.js` 里的地址要对上）
3. 把 `functions/memo/index.ts` 的内容整个粘进编辑框，点 **Deploy**
4. 部署完在函数详情里确认 **Verify JWT / Enforce JWT Verification** 是**关**的

第 4 步不能省：页面用的是 publishable key（不是 JWT），网关校验 JWT 会直接 401。关掉之后这个函数对任何知道地址的人开放，但它只做转发、不保存任何东西，Token 由调用方自己带，风险仅限于别人蹭你的免费额度。

## 部署完自检

```powershell
curl.exe "https://<项目编号>.supabase.co/functions/v1/memo?act=ping"
# 期望：{"ok":true,"act":"ping","v":1}
```

再打开测验页 → 登录 → 绑定墨墨账号，能拉到词就是通了。

## 用命令行部署（可选）

装了 [Supabase CLI](https://supabase.com/docs/guides/cli) 的话：

```bash
supabase functions deploy memo --no-verify-jwt --project-ref <项目编号>
```