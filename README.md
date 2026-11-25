# 墨墨难词看板 · maimemo-dashboard

用[墨墨背单词开放 API](https://open.maimemo.com)的本地快照，统计「哪些词最容易忘」，网页版手机电脑都能看。

![看板截图](screenshot.png)

## 在线版（不开电脑也能看）

**https://sleepzzz-h.github.io/maimemo-dashboard/**

托管在 GitHub Pages 上，手机流量、公司电脑、发给同学，打开就能看，不需要家里这台机器开着。

页面由 `docs/index.html` 提供，数据是**生成那一刻的快照**（不是实时）。想更新：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\publish.ps1
```

它会依次：抓一次墨墨记录 → 重新生成 `docs/` → 提交并推送（直连不通时自动走本机 7890 代理）。推送后约 30 秒 GitHub Pages 自动刷新。只改了样式、数据没变时加 `-SkipSnapshot`。

**隐私**：Pages 是公开的，任何人拿到链接都能看到这份词表和复习次数（页面加了 `noindex`，搜索引擎不会收录，但不算访问控制）。不想公开就只自己留着 `index.html`，见下面「发给别人」。

### 发给别人

`docs/index.html` 是**单文件**：数据全内联在 HTML 里，500 KB 左右，没有任何外部依赖。可以直接微信发过去，对方双击就能看（图标会缺，不影响内容）。
## 它解决什么问题

墨墨开放 API 的 `study records` 对每个词只返回两个信息：

- `study_count`：累计复习了多少次
- `last_response`：**最近一次**的回答（`FAMILIAR` / `VAGUE` / `FORGET` / `WELL_FAMILIAR`）

**没有逐次历史接口**，也就是说 API 不会告诉你「这个词你模糊过几次」。所以「遗忘次数」只能自己攒：

1. 每天抓一次全量学习记录，存成 `state.json`；
2. 和上一次对比，`study_count` 变大了就说明学过，把当时的 `last_response` 记成一条事件；
3. 事件越攒越多，就得到了每个词的模糊/忘记次数。

看板读的就是这两份本地数据。

## 功能

- **难度分排行**：模糊、忘记、顽固标记、复习次数综合打分
- **搜索 / 筛选 / 排序**：顽固、模糊过、忘记过、今天该复习、复习少；按难度分 / 模糊 / 忘记 / 复习次数 / 到期时间 / 字母
- **一键同步**：点按钮后台跑一次快照，完成后自动刷新
- **手机适配**：响应式布局，同一 Wi-Fi 下手机直接开
- **每日 50 词测验**：四选一，英→中或中→英；错词单独列出，可以只练错词

## 快速开始

需要：Windows + PowerShell 5.1 以上 + Node.js 18+。

```powershell
# 1. 安装墨墨官方 CLI
npm install -g @maimemo/memo-api

# 2. 配置 Token（二选一）
#    环境变量：MAIMEMO_API_TOKEN=你的token
#    或写进 %USERPROFILE%\.config\memo-api.json：{"apiToken":"你的token"}
#    注意：这个文件不能带 UTF-8 BOM，否则 Node 解析失败、CLI 会一直报「缺少 API Token」

# 3. 建基线（第一次只记录当前状态，不产生事件）
powershell -NoProfile -ExecutionPolicy Bypass -File .\memo-history.ps1 snapshot

# 4. 双击 install.cmd —— 装图标、装开机自启、顺手把服务跑起来
```

`install.cmd` 会做四件事：

1. 生成图标（`app\icons\favicon.ico`，多尺寸，桌面和任务栏都清楚）
2. 在**桌面**和**开始菜单**放「墨墨难词看板」图标，双击即开（服务没启动会在后台自动拉起，不弹命令行窗口）
3. 在**启动**文件夹放一个后台自启项，开机后服务自动在后台待命
4. 立刻启动服务并自检，告诉你本机访问地址

卸载：双击 `uninstall.cmd`（删图标、停服务，数据留着）。
临时停一下服务：`app\stop.cmd`。

## 手机上也有图标

1. 手机和电脑连同一个 Wi-Fi
2. 浏览器打开 `http://<电脑局域网IP>:8787`（装完 `install.cmd` 会直接打印地址）
3. Android Chrome：右上角 **⋮** →「添加到主屏幕」；iPhone Safari：分享 →「添加到主屏幕」

加完之后就多一张图标，点开即用。iPhone 上会全屏独立显示；Android Chrome 走的是 http，通常只提供「创建快捷方式」，点开会带一条浏览器地址栏——功能一样，不影响用。
手机打不开，多半是防火墙或校园网隔离：右键「以管理员身份运行」`app\allow-lan.cmd` 放行 8787 端口。

## 每日 50 词测验

点看板右上角的 **测验**，或者直接开 `/quiz.html`。

- **每天 50 个词**，0 点自动换新的一组；同一天刷新还是同一组，进度先存浏览器本地，登录后同步到云端
- **两种方向**：英→中、中→英，也可以选「混合方向」随机穿插
- **选词规则**：40% 按「遗忘程度」加权挑（模糊 ×3 + 忘记 ×6 + 顽固 ×2，就是你在这份看板上被标记过的词）+ 难度分前 11% 里随机补 + 剩余从全库随机补。**不看「今天该不该复习」**——要练的是记不牢的，不是日程表上排到的
- **答错立刻给答案**：正确项标绿、错误项标红，下面直接显示「单词 = 释义」
- **结束页**：正确率、用时、错词清单；错词 ≥ 4 个时可以「只练错词」
- 键盘 `1`–`4` 选答案，`Enter` 下一题

### 账号与云同步（可选）

不登录 = 进度只存在这台设备的浏览器里。点右上角 **登录同步** 可以用邮箱注册/登录，进度存到 Supabase（免费额度够用）：

1. 在 [supabase.com](https://supabase.com) 建一个项目（用 GitHub 账号登录最快）
2. `Authentication → Providers → Email` 里把 **Confirm email** 关掉（否则注册后要先去邮箱点链接）
3. `Project Settings → API` 里复制 **Project URL** 和 **anon public key**
4. 填进 `app/config.js`，重新构建发布：`node tools/build-static.mjs`

anon key 本来就是给浏览器用的公开 key；进度写在当前登录用户自己的 `user_metadata` 里，别的用户读不到，所以**不需要建表、不用写 SQL**。

一个先说清楚的地方：**墨墨开放 API 不返回词典释义**。`interpretation` 接口给的是「你自己添加的释义」，实测 1839 个词全是空的。所以中文释义是构建时用有道词典的公开接口（`dict.youdao.com/jsonapi`）抓下来缓存到 `quiz/glosses.json` 的，脚本在 `tools/fetch-glosses.mjs`，抓完 1839 个词约 10 分钟。要刷新释义重新跑一遍就行，已抓过的会跳过。

## 目录结构

```
.
├── install.cmd           # 一键安装：图标 + 开机自启 + 启动服务
├── uninstall.cmd         # 卸载图标和自启（数据保留）
├── memo-history.ps1      # 抓取 + 差分 + 统计（snapshot / report / status）
├── app/
│   ├── server.mjs        # 零依赖 Node 服务：/api/data、/api/sync、/api/health、/api/lan
│   ├── index.html        # 单页界面（内联 CSS/JS，无外部依赖）
│   ├── quiz.html         # 每日 50 词测验页
│   ├── config.js         # Supabase 的 URL / anon key（留空 = 只用本地进度）
│   ├── cloud.js          # 极简 Supabase 客户端（纯 fetch，不引 CDN）
│   ├── model.mjs         # 数据聚合 + 难度分 + 测验词库（服务端和静态版共用）
│   ├── manifest.webmanifest
│   ├── icons/            # 16–256 px 的 ico + 各尺寸 png（PWA / 桌面图标共用）
│   ├── open-dashboard.ps1# 起服务 + 开浏览器（无窗口）
│   ├── launch.vbs        # 桌面图标指向它
│   ├── autostart.vbs     # 开机自启指向它（只起服务，不开浏览器）
│   ├── start.cmd         # 前台带日志启动（排查问题用）
│   ├── stop.cmd          # 停掉后台服务
│   └── allow-lan.cmd     # 需要时放行 8787 端口（要管理员）
├── tools/
│   ├── make-icons.ps1    # 重新生成图标
│   ├── fetch-glosses.mjs # 抓中文释义到 quiz/glosses.json（有道公开接口）
│   ├── build-static.mjs  # 生成静态版（docs/，给 GitHub Pages 用）
│   └── publish.ps1       # 快照 → 生成静态版 → 提交推送
├── docs/                 # 静态版产物，GitHub Pages 从这里发布
│   ├── index.html        # 数据内联的单页，可以单独发给别人
│   ├── quiz.html         # 测验页，词库也内联，打开就能做题
│   ├── config.js         # 从 app/ 复制过来（云同步配置）
│   └── cloud.js          # 从 app/ 复制过来
├── notes/
│   └── maimemo-api-notes.md
├── state.json            # 运行时生成，不进仓库
└── events.jsonl          # 运行时生成，不进仓库
```

## 常用命令

```powershell
$s = '.\memo-history.ps1'
powershell -NoProfile -ExecutionPolicy Bypass -File $s snapshot        # 抓一次并记事件
powershell -NoProfile -ExecutionPolicy Bypass -File $s report -Top 30  # 命令行看排行
powershell -NoProfile -ExecutionPolicy Bypass -File $s status          # 看攒了多少
```

数据默认写在脚本同目录，可用 `-DataDir` 或环境变量 `MAIMEMO_HISTORY_DIR` 改到别处。

## 每天自动快照

```bat
schtasks /Create /SC DAILY /ST 22:00 /TN "MaimemoSnapshot" ^
  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\path\to\memo-history.ps1\" snapshot"
```

## 难度分怎么算

```
难度分 = 模糊×3 + 忘记×6 + 顽固标记×2 + min(复习次数, 25)×0.3
       + 最近一次为「模糊」+1.5 / 为「忘记」+4 / 为「很熟」-1
```

事件还没攒够时（刚建完基线），分数主要靠「顽固标记 + 复习次数 + 最近一次回答」估算，看板顶部会给出提示。

## 已知局限

- **两次快照之间的多轮复习只保留最后一轮的回答**：如果一天复习了 5 次，脚本只能知道第 5 次的结果，中间几轮记为 `UNKNOWN`。想更细就提高快照频率。
- **历史不可回溯**：从这个工具开始运行那天起才有数据，之前的模糊/忘记次数补不回来。
- **依赖墨墨 API 的限流**：脚本遇到 `common_too_many_request` 会退避重试；拉到的词数低于上次 90% 时直接中止，不覆盖已有数据。

## 数据与隐私

所有数据都留在本地，不上传任何地方。`state.json`、`events.jsonl` 已在 `.gitignore` 中排除——里面有你的完整词表和复习记录，别提交。

## License

MIT