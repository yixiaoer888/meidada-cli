# 媒大大 CLI

媒大大官方内容投放 CLI。日常使用按一条线路理解：

1. 生成或准备文章
2. 按需存放草稿箱
3. 选择媒体并投放文章
4. 按需创建定时投放
5. 查看投后订单和结果

CLI 面向 Agent 使用时，必须以 `--json` 返回作为唯一事实来源。媒体价格按当前用户分层返回，不能写死、复用他人报价或绕过服务端报价。

## 安装

```bash
npm install -g @meidada-cn/cli
mdd skill sync --global
mdd device prepare --json
# Agent 此时向用户索要页面生成的单次部署 API Key：
mdd config init --api-url "https://your-console.example" --api-key "<one-time-deployment-api-key>"
mdd doctor --json
mdd auth whoami --json
```

单次部署 API Key 只能使用一次、15 分钟后过期，注册成功后立即失效。设备专属令牌会持久化到当前操作系统用户的 `~/.mdd/config.json`，切换项目或重新打开 Agent 后无需再次输入。

正式版更新只需要一次确认：

```bash
mdd update --json
mdd update --yes --json
```

正式版 CLI 默认自动更新。普通命令启动时每天最多检查一次 npm `latest`，发现新版本后自动安装，下一次命令使用新版本。设置 `MDD_AUTO_UPDATE=0` 可关闭自动更新。

测试环境使用 npm 的 `pre-production` 标签：

```bash
npm install -g @meidada-cn/cli@pre-production
mdd version --json
mdd skill sync --global
```

## 1. 准备文章

用户已经有 DOCX、HTML 或 TXT 时，直接把文件作为文章来源。投放文章不需要先保存草稿：

```bash
mdd publish prepare --file article.docx --channel news --media 12345 --output campaign.json --json
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

`draft import` 会保存草稿并返回预览链接。`draft update` 默认只返回修改预览，不写入；用户确认后才加 `--yes`。

## 3. 投放文章

标准即时投放流程：

```bash
mdd wallet balance --json
mdd media search --channel news --keyword "关键词" --json
mdd publish prepare --file article.docx --channel news --media 12345 --customer <customerId> --output campaign.json --json
mdd publish validate campaign.json --json
mdd publish dry-run campaign.json --json
mdd publish quote campaign.json --json
mdd publish confirm <approvalId> --json
# 用户确认文章、媒体、用户分层价格、总金额、余额和上游平台预览链接后：
mdd publish confirm <approvalId> --yes --json
```

`publish prepare --file` 会为用户上传稿创建临时来源草稿，用于预览、报价和上游投放；投放全部成功后默认删除该临时草稿。`publish prepare --draft` 使用草稿箱已有文章作为来源，投放后默认保留。`publish quote` 是 `publish request` 的易读别名，用于创建短期有效的待确认报价，不会创建订单或扣款。`publish confirm <approvalId>` 不带 `--yes` 时只展示确认摘要，包括文章标题、媒体、当前用户可用的分层价格、总价、余额、投放后余额、草稿去向和发送给上游平台的预览链接。用户明确确认后，才可以带 `--yes` 创建订单。

投放完成后，结果中仍应展示发送给上游平台的预览链接，方便用户回看每个订单对应的稿件。失败项显示失败原因，不得声称成功。

CLI 媒体查询和投放仅支持 `news`（新闻媒体）、`we-media`（自媒体）和 `overseas`（海外媒体）。

## 4. 定时投放

只有用户明确提出“定时、每天、按计划投放”等需求时，才进入定时投放。普通投放不得自动转换成定时计划。

```bash
mdd schedule prepare --drafts <draft1,draft2> --channel news --media 12345 --start-at "2026-08-13T09:00:00+08:00" --run-at 09:00 --timezone Asia/Shanghai --repeat daily --budget-per-run 500 --budget-total 5000 --output schedule.json --json
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
