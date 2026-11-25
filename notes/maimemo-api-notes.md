# 墨墨开放 API 速查（memo-api CLI 1.3.x）

基于官方 CLI `@maimemo/memo-api` 实测整理，2026-11 验证。

## 安装与鉴权

```powershell
npm install -g @maimemo/memo-api
```

Token 按优先级取：

1. `-T/--token`
2. 环境变量 `MAIMEMO_API_TOKEN`
3. `%USERPROFILE%\.config\memo-api.json` → `{"apiToken":"..."}`
4. `memo-api auth login` 的 OIDC 凭证

**坑**：配置文件必须是**不带 BOM** 的 UTF-8。PowerShell 5.1 的 `Set-Content -Encoding utf8` 会写 BOM，Node 端 `JSON.parse` 直接失败，而 CLI 只会报「缺少 API Token」，排查起来很费时间。用：

```powershell
[System.IO.File]::WriteAllText($p, $json, (New-Object System.Text.UTF8Encoding($false)))
```

另外 `memo-api auth whoami` 只认 OIDC 登录，用 apiToken 时会报「whoami 仅支持 OIDC 登录」——这不代表 token 有问题，换成 `memo-api voc get -s apple` 验证。

## 资源与命令

| 资源 | 命令 |
| --- | --- |
| auth | `login` `whoami` |
| vocabulary | `voc get` `voc query` |
| note（助记） | `note list/create/update/delete` |
| interpretation（释义） | `interp list/create/update/delete` |
| phrase（例句） | `phrase list/create/update/delete` |
| notepad（云词本） | `notepad list/get/create/update/delete` |
| study | `study progress/today/records/add/advance` |

全局选项：`-O json|column`、`--no-color`、`-H/--no-header`、`--fields`、`-T/--token`、`--verbose`、`-f`（跳过确认）。支持 stdin 传 JSON 请求体。

## JSON 信封键

| 命令 | 顶层键 |
| --- | --- |
| `voc get` | `voc` |
| `voc query` | `vocs` |
| `note list` | `notes` |
| `interp list` | `interpretations` |
| `phrase list` | `phrases` |
| `notepad list` / `get` | `notepads` / `notepad` |
| `study records -c` | `{"records":[],"count":N}`，计数在 `count` |
| `study add` / `advance` | `added_count` / `advanced_count` |

## study_records 实际字段

```
voc_id, voc_spelling, add_date, first_study_date, last_study_date,
next_study_date, last_response, study_count, tags
```

- `last_response` 枚举：`FAMILIAR` `VAGUE` `FORGET` `WELL_FAMILIAR` `STUDY_RESPONSE_UNSPECIFIED`
- `tags` 枚举：`STICKING`（顽固） `WELL_FAMILIAR`
- **没有逐次回答历史**，`study_count` 只是累计次数，所以「模糊过几次」必须自己快照差分。

`voc get` 只返回 `id` + `spelling`，它是词库解析器不是词典；释义要查 `interp list`，例句查 `phrase list`。

## 分页

`study records` 没有 offset，只能按 `next_study_date` 的时间窗切，单次 `-l` 最多 1000。窗口内条数打满就按日期二分，直到每窗不足 1000 为止。

## 报错对照

| 现象 | 说明 |
| --- | --- |
| 缺少 API Token | 先查配置文件有没有 BOM |
| `whoami 仅支持 OIDC 登录` | 用 apiToken 时正常现象 |
| `common_too_many_request` | 限流，等 30–60 秒；脚本里要重试而不是当成空结果 |
| `common_internal_error` + 503 | 服务端临时故障，重试即可，别急着改 token |

## 调用 CLI 的坑（Node 侧）

用 `child_process.spawn` 调 `memo-api` 时，如果 stdin 是没关闭的管道，CLI 可能会一直等输入导致卡死。要显式传：

```js
spawn('powershell', ['-NoProfile', '-Command', cmd], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

同时先设 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`，否则中文日志会变成乱码。