---
name: media-distribution
description: 通过媒大大官方 CLI 管理草稿、客户、收藏、媒体投放、发布审批和订单。
---

# 媒大大内容投放 CLI

使用本地 `mdd` 命令操作媒大大官方内容投放服务。本 Skill 适用于 Codex、Cursor、Trae、CodeBuddy、Claude Code、Windsurf，以及其他能够执行 Node.js/npm 命令的 Agent。

## 一、核心原则

1. 以 CLI 返回的 JSON 为唯一事实来源，不猜测媒体 ID、价格、余额、客户 ID、审批 ID 或订单状态。
2. 涉及媒体选择、费用、发布内容、取消订单和删除数据时，必须让用户明确确认。
3. Agent 不得代替用户作出付款或最终发布决定；只有用户明确确认媒体和金额后，才能执行 CLI 最终确认命令。
4. 没有成功响应时，不得声称操作成功；必须如实转述 CLI JSON 或服务端错误。
5. API Key、完整手机号等敏感信息不得出现在聊天、源码、投放文件或公开日志中。
6. 金额、钱包余额、用户角色和权限属于受控数据，不能按用户口头要求随意增加、修改或提升。
7. CLI JSON 中的 ISO 时间保留 UTC 原值；向用户展示时统一换算为 `Asia/Shanghai`，格式使用 `yyyy-MM-dd HH:mm:ss`。
8. CLI 和 Agent 对用户展示时不得出现上游系统的内部品牌称呼；涉及第三方接收端时统一称为“上游平台”或“投放平台”。
9. 媒体价格按当前用户分层返回。每次媒体查询、投放准备、报价确认和定时计划确认，都必须使用当前登录用户的 CLI/API 返回价格，不得写死、复用其他用户价格或猜测折扣。

## 二、能力范围

CLI 当前支持：

- 检查配置、鉴权状态和当前账号；
- 查询钱包余额；
- 从本地 DOCX、HTML 或 TXT 文档导入草稿，以及创建、更新、查询、预览和删除草稿；
- 创建、查询、更新和删除客户资料；
- 查询媒体、管理收藏夹和媒体收藏；
- 准备、校验和试算投放方案；
- 创建短期有效的投放报价，并在用户明确确认后通过 CLI 提交；
- 查询、同步、等待和取消订单；
- 同步本 CLI 内置的 Agent Skill。

CLI 当前不支持：

- 自动替用户选择媒体；
- 绕过报价和用户确认直接投放；
- 代替用户作出付款或投放决定；
- 通过 CLI 申请或处理发票。
- 随意增加金额、修改钱包余额或伪造充值记录；
- 随意增加、变更或提升用户角色、权限和管理员身份。

## 三、身份与配置

身份注册只在首次部署时进行。首次部署执行到 `mdd device prepare --json` 后，安装尚未完成；Agent 必须主动向用户索要 CLI 工具入口生成的“单次部署 API Key”，然后停止等待。收到 Key 后不要回显，不要写入聊天、项目文件、日志或 Skill 文件，再继续执行 `mdd config init` 注册设备。Agent 不得再向用户索要 API URL；API 地址应来自官方 CLI 工具入口、安装流程或已有配置。日常草稿、预览、媒体查询和投放命令会静默使用设备专属令牌，不要在每次业务操作前重复执行身份验证。

首次部署完成后执行一次：

```bash
mdd config get --json
mdd auth status --json
mdd doctor --json
mdd auth whoami --json
```

设备专属令牌必须保存在当前操作系统用户的 `~/.mdd/config.json`。不要把主 API Key 或设备令牌写入项目目录、源码、投放 JSON、聊天回复或公开日志。

如果任一业务命令、`doctor` 或 `auth whoami` 返回 401，立即停止所有业务操作。设备可能已被停用，或者仍在使用旧版仅主 Key 配置。让用户在 CLI 部署页重新复制第一步，按新部署流程取得单次部署 API Key，再执行 `mdd config init`；不要通过反复运行身份检查重试。

### 正式版更新

CLI 正式版更新采用“一次询问、全程自动”的规则。检查更新本身不需要用户确认：

```bash
mdd update --json
```

如果返回 `updateAvailable: true`，向用户展示当前版本、目标版本和实际安装目录，并且在当前任务中只询问一次是否更新。用户确认后只执行：

```bash
mdd update --yes --json
```

`--yes` 已代表用户对从 npm 安装正式版、当前安装目录升级、全局 Skill 同步和关键命令验证的整体确认。Agent 不得把这些内部步骤拆成多次确认，也不得在更新过程中改用另一份 PATH 中的 npm 或 mdd。更新成功后提示用户重启当前 Agent 并新建任务；不要继续使用可能缓存旧 Skill 的会话。用户拒绝后，当前任务中不得再次询问同一版本。

从旧的 `@md/cli`、`meidada-cli` 或网站 tarball 迁移到 `@meidada-cn/cli` 时，Agent 仍然只询问一次；用户确认后使用当前 Agent runtime 对应的 npm 原地安装 `@meidada-cn/cli`，再执行新版 `mdd skill sync --global` 和关键命令验证。完成迁移后，后续版本统一使用 `mdd update --yes`，不得继续手工创建临时脚本或让用户处理 PATH。

## 四、主业务线路

日常业务按一条线路组织：先准备文章，再按需保存草稿箱，再投放文章；只有用户明确提出定时需求时才进入定时投放支线。不要把配置、媒体库、钱包、客户、收藏等辅助命令作为用户面前的主流程入口。

### 1. 准备文章

用户提供本地 DOCX、HTML 或 TXT 并表示要投放时，直接把文件作为文章来源。`mdd publish prepare --file` 会创建临时来源草稿，用于预览、报价、版本校验和上游投放；临时草稿不等同于用户主动保存到草稿箱。

### 2. 按需存放草稿箱

只在用户明确表示“保存草稿、放到草稿箱、稍后再投”等草稿管理需求时，才执行：

```bash
mdd draft import <file> --json
```

导入后向用户展示草稿预览链接。后续如用户确认继续投放，才从该草稿进入投放流程。

### 3. 标准即时投放

严格按以下顺序执行：

1. 用户提供本地文档并表示要投放到媒体时，不得先执行 `mdd draft import`，不得擅自把文章保存到草稿箱。只在用户明确表示“保存草稿、放到草稿箱、稍后再投”等草稿管理需求时，才执行 `mdd draft import <file> --json`。
2. 普通即时投放直接使用本地文件进入投放准备流程；`mdd publish prepare --file` 会创建临时来源草稿。短视频投放本地视频时使用 `mdd publish prepare --video <file> --title "<标题>" --channel short-video --keyword "<话题>" ...`，会上传视频并创建临时来源草稿。如果用户明确指定已有草稿 ID，才可以使用该草稿箱文章作为来源。
3. 执行 `mdd wallet balance --json` 查询余额。
4. 使用 `mdd media search --channel <channel> --json` 查询真实媒体和当前用户可用价格。`<channel>` 支持 `news`（新闻媒体）、`we-media`（自媒体）、`overseas`（海外媒体）和 `short-video`（短视频）。
5. 展示查询结果和当前用户分层价格，让用户明确选择媒体；不得自动选择第一条或替用户决定。
6. 对本地文章执行 `mdd publish prepare --file <file> ... --output campaign.json --json`，对本地短视频执行 `mdd publish prepare --video <file> --title "<标题>" --channel short-video --media <ids> --keyword "<话题>" --output campaign.json --json`，对用户明确指定的已有草稿才执行 `mdd publish prepare --draft <draftId> ... --output campaign.json --json`；再执行 `mdd publish validate campaign.json --json` 和 `mdd publish dry-run campaign.json --json`。
7. 执行 `mdd publish quote campaign.json --json` 或兼容命令 `mdd publish request campaign.json --json` 创建短期有效的服务端报价。该命令不会创建订单或扣款。
8. 执行 `mdd publish confirm <approvalId> --json` 获取最终确认摘要，向用户展示发送给上游平台的预览链接、文章标题、媒体名称、每家当前用户分层单价、媒体数量、总费用、当前余额、投放后余额和默认草稿去向。将 `previewUrl` 显示为可点击的稿件预览入口，但不要求用户必须打开后才能继续确认。
9. 只问一次用户是否确定按上述媒体和金额投放。用户没有明确肯定答复时，立即停止，不得提交。
10. 用户明确确认后，默认执行 `mdd publish confirm <approvalId> --yes --json`。如果投放来源是用户上传文件生成的临时草稿，投放全部成功后默认删除临时草稿；如果投放来源是草稿箱已有文章，默认保留来源草稿。只有用户明确要求投放成功后仍保留临时草稿时，才执行 `mdd publish confirm <approvalId> --yes --keep-draft --json`；不要为了是否保留草稿再增加一次询问。
11. 使用 CLI 返回的结果报告每家媒体是否成功创建订单。最终结果表必须包含媒体、订单号、状态和“文章预览”；成功项将 `results[].previewUrl` 输出为可点击链接，该链接就是发送给上游平台的稿件预览链接；失败项显示 `-`。同时必须根据 `draftDisposition` 告诉用户来源草稿的处理结果：`DELETED` 为已删除临时来源草稿，`KEPT` 为已保留来源草稿（草稿箱来源默认保留，或用户要求保留临时草稿），`KEPT_PARTIAL_FAILURE` 为因投放未全部成功而保留，`NOT_APPLICABLE` 为本次投放没有来源草稿，`DELETE_FAILED` 为投放成功但草稿删除失败。不得静默删除草稿。再按需执行 `mdd order list --json` 或 `mdd order get <orderNo> --json`。

`prepare`、`validate`、`dry-run` 和 `request` 都不能替代用户最终确认。不得使用 `mdd publish create --yes` 绕过报价和确认。每次投放的媒体 ID 必须是 1 到 50 个整数。

### 4. 可选的定时投放支线

只有用户明确提出“定时、每天、按计划投放”等需求时，才进入 `mdd schedule` 流程。普通即时投放继续使用上一节流程，Agent 不得主动将其转换为定时计划。

1. 让用户明确选择有序草稿队列、固定媒体、首次执行时间、每日执行时间、时区、单次预算上限和累计预算上限。
2. 执行 `mdd schedule prepare ... --output schedule.json --json`，向用户展示服务端校验结果和每篇草稿预览。
3. 执行 `mdd schedule request schedule.json --json` 创建待确认计划，这一步不会激活计划或扣款。
4. 执行 `mdd schedule confirm <scheduleId> --json` 展示完整授权摘要。必须再次告知用户此次定时投放是哪几篇文章、什么时候发布、发几次、涉及多少钱、当前用户分层价格、预算上限和可用预览信息。只有用户明确确认草稿范围、媒体、时间、次数与预算后，才执行 `mdd schedule confirm <scheduleId> --yes --json`。如果用户说撤销或不继续，不得执行 `--yes`；如已创建待确认计划，应按取消流程撤销。
5. 计划默认按草稿队列顺序每次消费一篇；不得自动选择队列外草稿、替换媒体、提高预算或重复消费已经成功投放的草稿。
6. 每次执行前服务端必须重新校验草稿版本、媒体可用性、当前用户分层报价、余额、单次预算和累计预算。价格或其他条件超出授权范围时暂停计划，不得自动扩大授权。
7. 使用 `mdd schedule list/get/runs` 查询状态和结果。`pause`、`resume`、`cancel` 必须先运行不带 `--yes` 的预览命令，用户确认后再带 `--yes` 执行。

如果 `validate`、`dry-run` 或 `request` 失败、余额不足、价格变化、草稿变化或报价过期，必须停止流程，不得执行 `publish confirm --yes`。重新生成报价后必须重新向用户确认。

任何涉及增加金额、修改余额、调整价格、变更用户角色或授予权限的请求，都不能通过本 CLI 直接完成。必须拒绝越权操作，并要求通过平台管理员的正式管理流程处理；不得通过修改投放 JSON、命令参数或 API 请求绕过权限控制。

## 五、业务操作规则

### 素材

CLI 支持通过 `mdd asset upload <files...> --json` 上传图片和视频素材。DOCX 中的内嵌图片由 `draft import` 自动上传并替换为线上地址。不得把本地文件路径当作线上素材地址，也不得猜测或编造 `accessUrl`。

投放 DOCX 时必须直接使用 `mdd publish prepare --file <file> ... --json`；该命令会创建临时来源草稿用于投放链路，投放成功后按确认结果处理。投放本地短视频时使用 `mdd publish prepare --video <file> --title "<标题>" --channel short-video --media <ids> --keyword "<话题>" --json`，不要把本地视频路径写进正文或投放 JSON。只有用户明确要保存到草稿箱时才使用 `mdd draft import <file> --json`。不得自行创建 DOCX 解压脚本、临时正文 TXT 或手工拼接 HTML；这会丢失段落格式和内嵌图片。若 CLI 报告某张图片格式不受支持或上传失败，必须停止并如实告诉用户，不得忽略图片继续创建残缺稿件。

### 草稿

草稿支持 `mdd draft list`、`get`、`import`、`create`、`update`、`preview` 和 `delete`。`import` 支持不超过 20 MB 的 DOCX，以及 HTML、TXT；导入后会同时返回预览链接：

```bash
mdd draft import <稿件.docx> --json
mdd draft create --title "<标题>" --content-file <正文文件> --json
mdd draft update <draftId> --content-file <正文文件> --json
```

`--content-file` 只读取文本或 HTML 正文内容，不会上传正文中引用的本地图片或视频。

- 投放到媒体时不要为了预览或准备投放而执行 `draft import` 保存草稿箱；本地文件投放使用 `mdd publish prepare --file <file> ... --json` 创建临时来源草稿。
- 更新前先读取最新草稿；CLI 使用 `updatedAt` 防止覆盖并发修改。默认只返回当前内容与拟修改内容的预览，不会写入；只有用户明确确认后才传入 `--yes` 执行更新。
- 删除必须有用户明确意图，并传入 `--yes`。

### 客户资料

客户资料支持 `mdd customer list/get/create/update/delete`。

- 联系电话默认脱敏。
- 只有用户明确要求核对联系人时，才使用 `--show-sensitive`。
- 不得在聊天或日志中重复完整手机号。
- 删除客户必须有用户明确意图，并传入 `--yes`。

### 收藏

收藏支持：

```bash
mdd favorite folder list --json
mdd favorite list --channel <channel> --json
mdd favorite add <mediaId> --channel <channel> --json
mdd favorite remove <mediaId> --channel <channel> --json
```

所有媒体 ID 和收藏夹 ID 都必须来自 CLI 返回结果。删除收藏夹必须有用户明确意图，并传入 `--yes`。

### 订单

```bash
mdd order list --json
mdd order get <orderNo> --json
mdd order wait <orderNo> --json
mdd order cancel <orderNo> --json
mdd order cancel <orderNo> --yes --json
```

取消订单时，先不带 `--yes` 执行预览。只有返回结果明确可取消，并且用户确认订单号、媒体和退款金额后，才能带 `--yes` 执行取消。

`--interval` 和 `--timeout` 必须是有限的非负数字。遇到超时或鉴权失败时停止轮询。

### 发票和客服

当前 CLI 没有 `invoice` 命令。如果用户询问发票、开票或税务发票，必须告知用户通过当前系统的客服入口联系**媒大大客服**。

- 不得引导用户前往蚁小二官方平台；
- 不得编造发票相关 CLI 命令；
- 不得声称 CLI 可以提交或处理发票申请。

## 六、首次部署

只有用户明确要求部署时才安装 CLI。不要要求用户预先手动准备 Node.js/npm；先由 Agent 检查运行环境：

```bash
node --version
npm --version
npx --version
```

如果三个命令都成功，继续安装 CLI。如果 Node.js/npm 缺失或版本无法运行 CLI，Agent 应在用户已明确要求部署 CLI 的前提下，直接使用当前操作系统可信的软件包管理器安装 Node.js LTS，不再为这个前置依赖单独询问用户。不得从非官方来源下载运行时，也不得安装名称相似的第三方 CLI 包。

安装后重新执行版本检查。若新进程尚未获得更新后的 `PATH`，自动刷新环境或启动新的终端进程后再检查，不要重复安装。安装失败、缺少必要权限或被企业策略拦截时，停止部署并如实报告错误；不要反复重试，也不要假装 Node.js/npm 已可用。

Windows 优先使用：

```powershell
winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
```

macOS 或 Linux 使用当前系统已有且可信的软件包管理器安装 Node.js LTS。安装命令使用非交互参数；如果需要 `sudo`、管理员权限或被企业策略拦截，则停止并报告，不能改用非官方软件源或等待用户手动确认。

环境检查通过后，只安装 npm 上的官方包 `@meidada-cn/cli`，不要安装名称相似的第三方包：

```bash
npm install -g @meidada-cn/cli
mdd skill sync --global
mdd device prepare --json
```

此时主动向用户索要 CLI 工具入口生成的“单次部署 API Key”，然后停止等待。收到用户发送的 Key 后不要回显，再继续；不得再向用户索要 API URL：

```bash
mdd config init --api-key "<one-time-deployment-api-key>"
mdd doctor --json
mdd auth whoami --json
```

部署必须分成两条用户消息。第一条是用户发送官方 CLI 工具入口展示的安装指令，例如“请根据 https://skillhub.cn/install/skillhub.md，安装 @org-bgkwxnpv/meidada”。Agent 完成环境检查、CLI 安装、Skill 同步和设备身份生成后，主动索要单次部署 API Key。第二条是用户发送 CLI 工具入口生成的单次部署 API Key；Agent 收到 Key 后完成设备注册、配置和健康检查。部署 Key 只能从用户明确提供的安全输入或官方部署流程取得，不得猜测、回显或写入项目文件；它只能使用一次、15 分钟后过期。CLI 注册成功后只持久化设备专属令牌，部署 Key 立即失效。这里索要的是单次部署 Key，不得索要或接受账户的长期通用 API Key，也不得额外索要 API URL。

API 地址必须来自官方 CLI 工具入口、安装流程或已有配置，并且必须是 Agent 可访问的公网 HTTPS 地址。远程 Agent 不得使用 `localhost`、`127.0.0.1`、`::1` 或仅浏览器可访问的端口作为 API 地址。

## 七、Skill 同步

`mdd skill sync --global` 会直接把 CLI 内置的官方 Skill 复制到本机已支持 Agent 的用户级 Skill 目录，不需要访问 npm、npx 或 SkillHub。执行完成后重启 CodeBuddy、Trae 或其他 Agent，使新规则生效。

首次安装 CLI 仍需要 Node.js 和 npm 作为基础运行环境，但用户不必自行预装；Agent 应按“首次部署”流程自动检测并安装。这与 Skill 同步网络无关。

安装其他 Skill 时，必须明确指定当前 Agent 的 Skill 目录，不能依赖默认的 `./skills/`：

| Agent | 用户目录 | 项目目录 |
| --- | --- | --- |
| Codex | `~/.codex/skills/` | `.agents/skills/` |
| Cursor | `~/.cursor/skills/` | `.cursor/skills/` |
| CodeBuddy | `~/.codebuddy/skills/` | `.codebuddy/skills/` |
| Trae | `~/.trae/skills/` | `.trae/skills/` |
| Claude Code | `~/.claude/skills/` | `.claude/skills/` |
| Windsurf | `~/.codeium/windsurf/skills/` | `.windsurf/skills/` |
| Gemini CLI | `~/.gemini/skills/` | - |

使用 SkillHub 时，只在首次安装或用户明确要求时询问是否将其设为优先来源。使用 `skillhub install <name> --dir <current-agent-skills-dir>`。如果 SkillHub 不可用或没有匹配项，先说明替代来源，再进行安装。

## 八、常见异常

### API Key 失效

出现 401 时停止业务操作，不要反复重试。旧版仅主 Key 配置必须重新执行两步设备部署；已注册设备则请用户在设备列表确认是否已被停用。

### 本地代理不可用

如果错误包含 `ECONNREFUSED 127.0.0.1:<port>`，并提到 `HTTP_PROXY`、`HTTPS_PROXY` 或 `ALL_PROXY`，先确认代理是否真的在当前 Agent 环境中运行。

不需要代理时：

```bash
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
```

PowerShell：

```powershell
Remove-Item Env:HTTP_PROXY,Env:HTTPS_PROXY,Env:ALL_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:http_proxy,Env:https_proxy,Env:all_proxy -ErrorAction SilentlyContinue
```

需要企业代理时，把官方域名加入 `NO_PROXY`。不要反复重试已经停止的本地代理。此时出现 `502 connect ECONNREFUSED`，表示请求尚未到达媒大大服务端。

## 九、操作完成检查

每次操作结束前确认：

- 使用的是 CLI 返回的真实 ID、价格、余额和状态；
- 涉及费用、发布、取消或删除时已获得用户明确确认；
- 没有输出或保存 API Key、完整手机号等敏感信息；
- 没有在用户明确确认媒体和金额之前执行 `publish confirm --yes`；
- 没有为了投放到媒体而擅自把文章添加到草稿箱；
- 已如实报告成功结果、失败原因或超时状态。
- 已向用户说明来源草稿已删除、已保留、不适用或删除失败。

## 渠道补充提醒

`prepare`、`validate`、`dry-run` 和 `request/quote` 返回的 `guidance` 是渠道补充提醒：短视频重点看 `--keyword`、素材、封面和描述；自媒体可补充 `--account-rule`、`--article-type`、`--allow-video`；新闻和海外媒体重点通过 `--remark` 补充发布要求。`guidance` 只用于提醒，不替代报价和最终确认。
