# mdd CLI 命令参考

`mdd` 是媒大大官方内容投放 CLI。Agent 使用时应优先加 `--json`，并以命令返回作为唯一事实来源。

## 环境与版本

```bash
mdd version --json
mdd doctor --json
mdd update --json
mdd update --yes --json
```

## 安装与 Skill

```bash
mdd skill sync
mdd skill sync --global
mdd device prepare --json
mdd config init --api-key "<one-time-deployment-api-key>"
mdd auth whoami --json
```

## 内容准备

```bash
mdd publish prepare --file article.docx --channel news --media 12345 --output campaign.json --json
mdd publish prepare --video demo.mp4 --title "短视频标题" --channel short-video --media 12345 --keyword "#品牌" --output campaign.json --json
mdd publish validate campaign.json --json
mdd publish dry-run campaign.json --json
mdd publish quote campaign.json --json
mdd publish confirm <approvalId> --json
mdd publish confirm <approvalId> --yes --json
mdd publish confirm <approvalId> --yes --keep-draft --json
```

`--file` 会创建临时来源草稿；投放全部成功后默认删除。`--draft` 使用草稿箱已有文章；投放后默认保留。

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

`prepare`、`validate`、`dry-run` 和 `quote` 会在 JSON 结果中返回 `guidance`，提示短视频、自媒体、新闻或海外媒体可补充的关键词、素材、备注和自媒体专用参数。
