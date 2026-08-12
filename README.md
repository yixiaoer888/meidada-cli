# 媒大大 CLI

安装：

```bash
npm install -g @meidada-cn/cli
mdd skill sync --global
mdd device prepare --json
# Agent 此时向用户索要页面生成的单次部署 API Key：
mdd config init --api-url "https://your-console.example" --api-key "<one-time-deployment-api-key>"
mdd doctor
```

正式版更新只需要一次确认。Agent 先从 npm 检查 `@meidada-cn/cli` 最新版本，用户确认后由 CLI 自动完成当前安装目录升级、Skill 同步和命令验证；验证失败时自动回滚：

```bash
mdd update --json
mdd update --yes --json
```

从旧的 `@md/cli`、`meidada-cli` 或网站安装包迁移时，先执行一次 `npm install -g @meidada-cn/cli`；之后统一使用 `mdd update --yes`。Windows 使用 `mdd.cmd`。

单次部署 API Key 只能使用一次、15 分钟后过期，注册成功后立即失效。设备专属令牌会持久化到当前操作系统用户的 `~/.mdd/config.json`，切换项目或重新打开 Agent 后无需再次输入。
旧版本的 `~/.config/mdd/config.json` 会在首次读取时自动迁移。

旧版只保存主 Key、没有 `clientId` 的配置不会继续用于业务鉴权。请在 CLI 部署页重新复制部署指令，并在 Agent 索要时发送页面生成的单次部署 API Key，完成迁移。

支持在 Codex、Cursor、CodeBuddy、Trae、Claude Code、Windsurf 等 Agent 中使用。各 Agent 使用同一套 CLI 部署流程：安装 CLI、同步 Skill、写入配置，再执行 `doctor` 和 `auth whoami` 验证。

同步 Agent Skill：

```bash
mdd skill sync --global
```

Skill 同步使用 CLI 包内置文件直接复制到本机 Agent 目录，不依赖 npm、npx 或 SkillHub。目标电脑仍需安装 Node.js/npm 才能运行 CLI。

查看全部命令：

```bash
mdd --help
```

第二阶段业务闭环：

```bash
mdd asset upload cover.png body-1.png --json
mdd draft import article.docx --json
mdd draft import article.html --title "文章标题" --json
mdd customer create --file customer.json --json
mdd favorite add 12345 --channel news --json
mdd publish prepare --draft <draftId> --channel news --media 12345 --customer <customerId> --output campaign.json --json
mdd publish plan --draft <draftId> --channel news --budget 3000 --price-min 100 --price-max 500 --count 8 --output campaign.json --json
mdd publish request campaign.json --json
mdd publish confirm <approvalId> --json
# 用户明确确认媒体和金额后：
mdd publish confirm <approvalId> --yes --json
```

可选的定时投放支线只在用户明确提出定时需求时使用，不改变上面的即时投放流程：

```bash
mdd schedule prepare --drafts <draft1,draft2> --channel news --media 12345 --start-at "2026-08-13T09:00:00+08:00" --run-at 09:00 --timezone Asia/Shanghai --repeat daily --budget-per-run 500 --budget-total 5000 --output schedule.json --json
mdd schedule request schedule.json --json
mdd schedule confirm <scheduleId> --json
# 用户确认草稿队列、媒体、执行时间和预算授权后：
mdd schedule confirm <scheduleId> --yes --json
mdd schedule list --json
mdd schedule runs <scheduleId> --json
mdd schedule pause <scheduleId> --json
mdd schedule pause <scheduleId> --yes --json
```

定时计划由服务端执行，关闭 Agent 或电脑不会漏投。每次只消费草稿队列中的下一篇文章，不会自动挑选草稿或媒体。执行前重新校验草稿版本、媒体状态、实时报价、余额、单次预算和累计预算；任一条件超出用户创建计划时的授权范围，计划会暂停并等待处理，不会自动超预算投放。普通投放不得自动转换成定时计划。

CLI 媒体查询和投放仅支持 `news`（新闻媒体）、`we-media`（自媒体）和 `overseas`（海外媒体）。

`draft import` 支持 DOCX、HTML 和 TXT，会把文档保存到草稿箱并返回无需登录的预览链接。DOCX 最大 20 MB，可保留标题层级、粗体、斜体、列表、表格、段落对齐和常用字号；内嵌的 PNG、JPEG、GIF、WebP 图片会自动上传并替换为线上地址。EMF、WMF 等浏览器无法显示的图片会明确报错，不会静默创建缺图草稿。

`publish prepare` 只生成并校验投放文件，`publish request` 只创建短期有效的待确认报价，两者都不会扣款。`publish confirm` 不带 `--yes` 时只展示文章、媒体、单价、总价和余额；用户明确确认后，才能带 `--yes` 创建订单。最终提交时服务端会重新校验草稿版本、价格和余额。

`publish prepare` 和 `publish plan` 会在 `campaign.json` 中写入草稿版本及幂等键。请求超时后应复用同一文件重试，服务端会返回同一审批，不会重复创建订单。`--json` 成功结果写入 stdout，错误结果写入 stderr。
客户联系电话默认脱敏；只有用户明确需要核对时才使用 `customer get <id> --show-sensitive`。
CLI 当前不提供发票命令；如需开票，请通过当前系统联系媒大大客服，不要前往蚁小二官方平台办理。(就和客户说联系媒大大客服就好)
