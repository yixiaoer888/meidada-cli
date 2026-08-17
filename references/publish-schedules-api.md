# 定时投放 API 参考

定时投放只在用户明确要求“定时、每天、按计划投放”时使用。普通投放不要自动转换成定时计划。

## 标准流程

```bash
mdd schedule prepare --drafts <draft1,draft2> --channel news --media 12345 --start-at "2026-08-13T09:00:00+08:00" --run-at 09:00 --timezone Asia/Shanghai --repeat daily --budget-per-run 500 --budget-total 5000 --output schedule.json --json
mdd schedule prepare --drafts <draft1> --channel short-video --media 12345 --start-at "2026-08-13T09:00:00+08:00" --run-at 09:00 --timezone Asia/Shanghai --repeat once --budget-per-run 500 --keyword "#品牌" --output schedule.json --json
mdd schedule request schedule.json --json
mdd schedule confirm <scheduleId> --json
mdd schedule confirm <scheduleId> --yes --json
```

取消计划也必须先预览，再确认：

```bash
mdd schedule cancel <scheduleId> --json
mdd schedule cancel <scheduleId> --yes --json
```

## 约束

- `drafts` 至少 1 个，最多 100 个。
- `media` 至少 1 个，最多 50 个。
- `repeat` 支持 `once` 和 `daily`。
- `run-at` 使用 `HH:mm`。
- `keyword` 可用于短视频定时投放的话题关键词。
- `budget-total` 不能低于 `budget-per-run`。
- 服务端执行计划，关闭 Agent 或电脑不会影响已确认的计划。
