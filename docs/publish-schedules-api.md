# 定时投放服务端契约

`mdd schedule` 是普通即时投放之外的可选支线。CLI 只管理计划，实际调度必须由服务端执行，不能依赖用户电脑或 Agent 常驻。

## 接口

- `POST /api/publish-schedules/prepare`：校验草稿队列、媒体、时间、预算和余额，返回草稿预览及预计单次费用，不创建计划。
- `POST /api/publish-schedules`：创建 `DRAFT` 状态计划，支持 `Idempotency-Key`。
- `GET /api/publish-schedules`：列出计划。
- `GET /api/publish-schedules/:id`：返回计划和授权摘要。
- `POST /api/publish-schedules/:id/confirm`：激活计划。
- `POST /api/publish-schedules/:id/pause`：暂停计划。
- `POST /api/publish-schedules/:id/resume`：恢复原授权范围内的计划。
- `POST /api/publish-schedules/:id/cancel`：永久取消计划。
- `GET /api/publish-schedules/:id/runs`：返回每次执行记录、报价、订单号、预览链接和失败原因。

## 执行规则

1. 计划按 `draftIds` 顺序每次取一篇，每篇成功投放后标记为已消费；不得选择队列外草稿。
2. 同一计划、草稿和计划执行时间必须使用稳定幂等键，任务重复投递不能重复创建订单或扣款。
3. 执行前重新读取草稿并核对版本，查询固定媒体的实时报价和钱包余额。
4. 实际费用不得超过 `budgetPerRun`，累计费用不得超过 `budgetTotal`；未设置累计上限时仍受余额和单次上限约束。
5. 媒体不可用、草稿变化、价格超限、余额不足、权限失效或连续执行失败时，将计划置为 `PAUSED`，记录结构化原因并通知用户。
6. 不得自动替换媒体、增加预算、跳过草稿或把失败执行视为成功。恢复计划不能扩大原授权范围，变更媒体、草稿队列、时间或预算应创建新计划并重新确认。
7. 成功投放默认按 `keepDraft` 处理来源草稿；部分失败时保留草稿。队列耗尽后计划进入 `COMPLETED`。
8. 所有持久化时间使用 UTC；`runAt` 按计划的 IANA `timezone` 解释，并正确处理夏令时。
