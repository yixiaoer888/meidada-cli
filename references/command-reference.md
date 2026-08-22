# mdd CLI 命令参考

`mdd` 是媒大大官方内容投放 CLI。Agent 使用时应优先加 `--json`，并以命令返回作为唯一事实来源。

## 环境与版本

```bash
mdd version --json
mdd doctor --json
mdd update --json
mdd update --yes --json
mdd update --check --json
mdd update --global --agent codex --force --json
```

## 安装与 Skill

```bash
mdd skill sync
mdd skill sync --global --agent codex --dry-run --json
mdd skill sync --global --agent codex --force --json
mdd setup --api-key-stdin --json
```

默认使用正式 API 地址 `https://www.meidada.cn`；企业私有部署可用 `--api-url` 或 `MDD_API_URL` 覆盖。

首次接入由 Agent 使用安全读取后通过 `mdd setup --api-key-stdin --json` 从标准输入传递 Key；用户无需手动执行命令。setup 会注册设备、保存用户级配置、验证 API/认证并查询 `/profile`。

`mdd update` 默认更新 CLI 并同步当前项目 Skill；`--check` 为只读检查。同步到 Agent 用户目录时必须同时指定 `--global --agent <name>`。

## 内容准备

```bash
mdd publish prepare --file article.docx --channel news --media 12345 --output campaign.json --json
mdd publish article --draft draft-123 --media 12345 --output campaign.json --json
mdd publish note --draft draft-123 --media 12345 --account-rule 1 --output campaign.json --json
mdd publish prepare --video demo.mp4 --title "短视频标题" --channel short-video --media 12345 --keyword "#品牌" --output campaign.json --json
mdd publish video --video demo.mp4 --title "短视频标题" --media 12345 --keyword "#品牌" --output campaign.json --json
mdd publish detect --file article.docx --media 12345 --json
mdd publish auto --file article.docx --media 12345 --output campaign.json --json
mdd publish auto --file mixed.html --content-type note --media 12345 --output campaign.json --json
mdd publish validate campaign.json --json
mdd publish dry-run campaign.json --json
mdd publish quote campaign.json --json
mdd publish confirm <approvalId> --json
mdd publish confirm <approvalId> --keep-draft --json
```

`--file` 直接生成投放 payload，不会保存到草稿箱。`--draft` 使用草稿箱已有文章；投放后默认保留。

## 草稿与素材

```bash
mdd draft import article.docx --json
mdd draft update <draftId> --content-file article.html --json
mdd draft update <draftId> --content-file article.html --yes --json
mdd asset upload cover.png body-1.png --json
```

## 媒体、客户与订单

```bash
mdd media search --channel news --keyword "关键词" --json
mdd favorite add 12345 --channel news --json
mdd customer create --file customer.json --json
mdd order list --json
mdd order get <orderNo> --json
mdd order cancel <orderNo> --json
mdd order cancel <orderNo> --yes --json
```

## 定时投放

```bash
mdd schedule prepare --drafts <draft1,draft2> --channel news --media 12345 --start-at "2026-08-13T09:00:00+08:00" --run-at 09:00 --timezone Asia/Shanghai --repeat daily --budget-per-run 500 --budget-total 5000 --output schedule.json --json
mdd schedule prepare --drafts <draft1> --channel short-video --media 12345 --start-at "2026-08-13T09:00:00+08:00" --run-at 09:00 --timezone Asia/Shanghai --repeat once --budget-per-run 500 --keyword "#品牌" --output schedule.json --json
mdd schedule request schedule.json --json
mdd schedule confirm <scheduleId> --json
mdd schedule confirm <scheduleId> --yes --json
mdd schedule cancel <scheduleId> --json
mdd schedule cancel <scheduleId> --yes --json
```

## 渠道补充提醒

```bash
mdd publish prepare --file article.docx --channel we-media --media 12345 --account-rule 1 --article-type 1 --allow-video 0 --output campaign.json --json
```

`detect` 只识别文章、图文/笔记或短视频线路，不创建草稿或报价。`auto` 会在高置信且必填信息齐全时生成投放文件；不确定时返回 `confirmationRequired`、`missingFields` 和 `nextQuestions`，Agent 必须先确认。可用 `--content-type article|note|video` 明确用户选择。

`prepare`、`validate`、`dry-run` 和 `quote` 会在 JSON 结果中返回 `guidance`，提示短视频、自媒体、新闻或海外媒体可补充的关键词、素材、备注和自媒体专用参数。
