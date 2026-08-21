# 媒大大 CLI

媒大大官方内容投放 CLI。日常使用按一条线路理解：

1. 生成或准备文章
2. 按需存放草稿箱
3. 选择媒体并投放文章
4. 按需创建定时投放
5. 查看投后订单和结果

CLI 面向 Agent 使用时，必须以 `--json` 返回作为唯一事实来源。媒体价格按当前用户分层返回，不能写死、复用他人报价或绕过服务端报价。

## 安装

推荐直接使用可审计的 npm 命令安装。主包和当前平台的原生二进制包都会通过 npm registry 获取；国内用户可使用 npmmirror，不需要访问 GitHub。npmmirror 偶尔会比 npm 官方源晚同步几分钟，新版本未找到时请改用官方源。安装命令只对当前命令生效，不会修改用户的 npm registry 配置。

```bash
# 固定到当前已验证版本，避免 registry latest 落后时安装旧版
npm install --global @meidada-cn/cli@0.5.3 --registry https://registry.npmmirror.com --no-audit --no-fund
# 官方源：npm install --global @meidada-cn/cli@0.5.3 --registry https://registry.npmjs.org --no-audit --no-fund
```

安装脚本是便利入口，会先展示包版本、registry、安装目录和下载域名，再调用同一条 npm 安装命令：

Windows PowerShell：

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/yixiaoer888/meidada-cli/main/install.ps1 -OutFile install.ps1
PowerShell -ExecutionPolicy RemoteSigned -File .\install.ps1
```

Linux/macOS：

```bash
curl -fsSL https://raw.githubusercontent.com/yixiaoer888/meidada-cli/main/install.sh -o install.sh
sh install.sh
```

切换官方源：Windows 使用 `PowerShell -File .\install.ps1 -Official`；macOS/Linux 使用 `sh install.sh --official`。也可用 `MDD_NPM_REGISTRY` 或脚本参数指定企业 registry。

安装完成后继续初始化设备：

```bash
mdd skill sync --json
mdd device prepare --json
```

上面默认只同步当前项目的 `.agents/skills`。需要用户级 Skill 时，明确指定当前 Agent 并先预览，例如：

```bash
mdd skill sync --global --agent codex --dry-run --json
mdd skill sync --global --agent codex --force --json
```

支持 `codex`、`cursor`、`claude`、`trae`、`workbuddy`、`codebuddy`、`openclaw`、`windsurf` 和 `gemini`。不指定 `--agent` 时不会批量写入多个 Agent 的用户目录。

执行 `mdd device prepare --json` 后，安装尚未完成。请用户在自己的本地终端执行 `mdd config init`，在隐藏提示中输入 CLI 工具入口生成的“单次部署 API Key”。不要要求用户把 Key 粘贴到聊天中；Agent 也不得回显、记录或写入 Key。Agent 不得再向用户索要 API URL；API 地址应来自官方 CLI 工具入口、安装流程或已有配置。

```bash
mdd config init
mdd doctor --json
mdd auth whoami --json
```

CLI 内置媒大大正式 API 地址 `https://www.meidada.cn`，通常只需提供一次性部署 API Key。企业私有部署可用 `--api-url "https://your-private-host"` 或环境变量 `MDD_API_URL` 覆盖默认地址；地址解析优先级为命令行参数、本地配置、环境变量、官方默认地址。

人工安装推荐直接执行 `mdd config init`，在隐藏提示中输入一次性部署 API Key。Agent 非交互安装应通过安全读取后经标准输入传递：

```powershell
& {
  $secure = Read-Host -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
} | mdd config init --api-key-stdin
```

不要使用 `mdd config init --api-key "真实Key"` 作为推荐方式；该参数仅为兼容旧脚本保留，可能暴露在终端历史和进程参数中。

单次部署 API Key 只能使用一次、15 分钟后过期，注册成功后立即失效。设备专属令牌会持久化到当前操作系统用户的 `~/.mdd/config.json`，切换项目或重新打开 Agent 后无需再次输入。不要把单次部署 Key 设置为 `MDD_API_KEY`；日常临时令牌如需通过环境变量提供，使用 `MDD_DEVICE_TOKEN`。

正式版更新默认使用你当前 npm registry；可通过 `--registry` 临时指定 npmmirror 或官方源，不会修改全局 npm 配置：

```bash
mdd update --json
mdd update --yes --json
mdd update --check --json
mdd update --yes --registry https://registry.npmmirror.com --json
```

`mdd update` 默认执行 CLI 更新并同步当前项目的内置 Skill，`--yes` 作为兼容参数保留；`--check` 只检查，不安装、不下载二进制、不同步 Skill。需要同步到 Agent 用户目录时使用 `mdd update --global --agent codex --force --json`。普通命令默认不访问 npm，若需要后台版本检查，显式设置 `MDD_AUTO_UPDATE=1` 或 `MDD_VERSION_CHECK=1`。

## 安装与更新常见问题

- 需要 Node.js 20+ 和 npm；使用 `node --version` 检查。全局安装权限不足时，按 npm 官方文档配置用户级 prefix，不要以管理员身份长期运行终端。
- npmmirror 报 `@meidada-cn/cli@0.5.3` 不存在时，不要降级安装 `latest` 或旧版；应先等待同步或切换官方源。
- 平台二进制包名称为 `@meidada-cn/cli-<platform>-<arch>`，由主包通过 `optionalDependencies` 自动选择当前系统版本；正常安装不访问 GitHub。平台包暂未同步时，稍后重试或临时使用 npm 官方源。
- 安装后找不到 `mdd` 时，重新打开终端；确认 npm 全局 bin 目录已在 PATH。
- 更新失败时先执行 `mdd update --check --json`，再复制返回的 registry 和安装命令排查网络、权限或镜像同步情况。
- 已保留独立二进制发行能力：发布资产命名为 `mdd-cli-<version>-<platform>-<arch>.<zip|tar.gz>`，包含 `checksums.txt`。它适合没有 Node.js 或企业网络限制场景；下载后必须先核验 SHA-256，再解压执行。当前构建命令为 `bun run build:native-assets`，发布目录包含 Windows x64/ARM64、Linux x64/ARM64、macOS x64/ARM64。

## 1. 准备文章

用户已经有 DOCX、HTML 或 TXT 时，直接把文件作为文章来源。投放文章不需要先保存草稿：

```bash
mdd publish prepare --file article.docx --channel news --media 12345 --output campaign.json --json
mdd publish article --draft draft-123 --media 12345 --output campaign.json --json
mdd publish note --draft draft-123 --media 12345 --account-rule 1 --output campaign.json --json
mdd publish video --video demo.mp4 --title "短视频标题" --media 12345 --keyword "#品牌" --output campaign.json --json
mdd publish detect --file article.docx --media 12345 --json
mdd publish auto --file article.docx --media 12345 --output campaign.json --json
```

DOCX 最大 20 MB，可保留标题层级、粗体、斜体、列表、表格、段落对齐和常用字号；内嵌的 PNG、JPEG、GIF、WebP 图片会自动上传并替换为线上地址。EMF、WMF 等浏览器无法显示的图片会明确报错，不会静默创建缺图稿件。

## 2. 存放草稿箱

只有用户明确要求“保存草稿、放到草稿箱、稍后再投”时，才使用草稿箱：

```bash
mdd draft import article.docx --json
mdd draft import article.html --title "文章标题" --json
mdd draft update <draftId> --content-file article.html --json
mdd draft update <draftId> --content-file article.html --yes --json
mdd draft preview <draftId> --json
```

`draft import` 会保存草稿并返回预览链接，结果里同时提供 `preview.url` 和 `previewUrl`。`draft update` 默认只返回修改预览，不写入；用户确认后才加 `--yes`。

## 3. 投放文章

标准即时投放流程：

```bash
mdd wallet balance --json
mdd media search --channel news --keyword "关键词" --json
mdd publish prepare --file article.docx --channel news --media 12345 --customer <customerId> --output campaign.json --json
mdd publish prepare --video demo.mp4 --title "短视频标题" --channel short-video --media 12345 --keyword "#品牌" --output campaign.json --json
mdd publish validate campaign.json --json
mdd publish dry-run campaign.json --json
mdd publish quote campaign.json --json
mdd publish confirm <approvalId> --json
mdd publish confirm <approvalId> --keep-draft --json
```

`publish prepare --file` 直接使用本地文件生成投放 payload，不会保存到草稿箱。`publish prepare --video` 会上传本地视频并直接生成短视频投放 payload。`publish prepare --draft` 才使用草稿箱已有文章作为来源，投放后默认保留；如果来源是草稿，结果里会带上 `previewUrl`。`publish quote` 是 `publish request` 的易读别名，用于创建短期有效的待确认报价，不会创建订单或扣款。`publish confirm <approvalId>` 会直接创建订单并返回结果，`results[].previewUrl` 就是发送给上游平台的预览链接；如果你需要查看审批信息，可改用 `publish approval get <approvalId>`。
`publish article`、`publish note` 和 `publish video` 是面向三类投放内容的快捷入口，分别默认对应新闻文章、自媒体图文笔记和短视频流程；它们仍然复用同一套报价和草稿处理逻辑。
`publish detect` 只识别素材应走哪条线路，不创建草稿、不报价；`publish auto` 会先识别，只有识别置信度高且必填信息齐全时才生成投放文件。不确定时会返回 `confirmationRequired`、`nextQuestions` 和 `missingFields`，Agent 必须先向用户确认，可用 `--content-type article|note|video` 或对应快捷命令继续。

投放完成后，结果中仍应展示发送给上游平台的预览链接，方便用户回看每个订单对应的稿件。失败项显示失败原因，不得声称成功。

CLI 媒体查询和投放支持 `news`（新闻媒体）、`we-media`（自媒体）、`overseas`（海外媒体）和 `short-video`（短视频）。

## 4. 定时投放

只有用户明确提出“定时、每天、按计划投放”等需求时，才进入定时投放。普通投放不得自动转换成定时计划。

```bash
mdd schedule prepare --drafts <draft1,draft2> --channel news --media 12345 --start-at "2026-08-13T09:00:00+08:00" --run-at 09:00 --timezone Asia/Shanghai --repeat daily --budget-per-run 500 --budget-total 5000 --output schedule.json --json
mdd schedule prepare --drafts <draft1> --channel short-video --media 12345 --start-at "2026-08-13T09:00:00+08:00" --run-at 09:00 --timezone Asia/Shanghai --repeat once --budget-per-run 500 --keyword "#品牌" --output schedule.json --json
mdd schedule request schedule.json --json
mdd schedule confirm <scheduleId> --json
# 用户确认哪几篇文章、什么时候发布、发几次、涉及多少钱和预览信息后：
mdd schedule confirm <scheduleId> --yes --json
```

如果用户在确认摘要后说撤销，不执行 `--yes`；如服务端已创建待确认计划，可执行取消流程：

```bash
mdd schedule cancel <scheduleId> --json
mdd schedule cancel <scheduleId> --yes --json
```

定时计划由服务端执行，关闭 Agent 或电脑不会漏投。每次只消费草稿队列中的下一篇文章，不会自动挑选草稿或媒体。执行前会重新校验草稿版本、媒体状态、当前用户分层报价、余额、单次预算和累计预算；任一条件超出授权范围，计划会暂停等待处理。

## 5. 投后管理

```bash
mdd order list --json
mdd order get <orderNo> --json
mdd order wait <orderNo> --json
mdd order cancel <orderNo> --json
mdd order cancel <orderNo> --yes --json
```

取消订单必须先预览，再让用户确认订单号、媒体和退款金额后执行 `--yes`。

## 辅助能力

```bash
mdd asset upload cover.png body-1.png --json
mdd customer create --file customer.json --json
mdd customer get <customerId> --json
mdd favorite add 12345 --channel news --json
mdd config get --json
mdd auth status --json
mdd doctor --json
```

客户联系电话默认脱敏；只有用户明确需要核对时才使用 `customer get <id> --show-sensitive`。

CLI 当前不提供发票命令；如需开票，请通过当前系统联系媒大大客服。

## 渠道补充提醒

`publish detect` 和 `publish auto` 用于自动识别用户发来的素材属于文章、图文/笔记还是短视频。CLI 会按素材来源、视频标签、图片数量和已确认的 `--content-type` 判断发布板块；如果只有少量图片、文章和图文笔记都可能适用，JSON 会返回 `confirmationRequired: true`，Agent 必须先询问用户确认板块。

三条线路都至少需要用户提供素材来源（`--file`、`--draft` 或 `--video`）和媒体 ID（`--media`）。短视频还必须有标题；图文/笔记默认走自媒体图文发布（`--article-type 2`、`--allow-video 0`），但 Agent 应确认发布形式和换号/截图规则。多媒体投放时，CLI 会在 `titlePlan` 中提示是否需要针对不同媒体拟定标题；Agent 在自动拟标题前必须先问用户是否需要。

`publish prepare`、`publish validate`、`publish dry-run` 和 `publish quote` 的 JSON 结果会包含 `guidance`，用于提示当前渠道还可以补充的针对性内容。短视频会提示 `--keyword`、素材和封面/描述建议；自媒体可通过 `--account-rule`、`--article-type`、`--allow-video` 补充账号规则、内容类型和视频处理方式；新闻和海外媒体会提示可在 `--remark` 中补充发布要求、地区语种、来源等信息。这些提醒不代表最终确认，仍需按报价和 `publish confirm --yes` 流程执行。
