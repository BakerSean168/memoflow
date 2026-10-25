# 日程冲突检测实现计划

> 归档说明：日程冲突检测、冲突缓存刷新与相关测试已落地，本文仅保留为历史实施方案参考。

## 摘要

- 保留现有“同一用户下时间重叠即冲突”的规则。
- 冲突策略采用软提示，允许保存。
- `hasConflict` 和 `conflictingEntries` 作为服务端缓存字段，任何 create/update/delete/resolve 后都要同步刷新受影响事件。

## 关键改动

- 将 `ScheduleConflictDetectionService` 收敛为纯分析服务，不再在检测时写库。
- 新增冲突缓存刷新服务，按受影响时间窗口找出相关事件，并逐个基于真实邻居重算冲突状态。
- `ScheduleEventApplicationService` 在 create/update/delete 后统一触发缓存刷新，并返回刷新后的最新事件 DTO。
- 统一 `with-conflict-detection` 返回形状为 `{ schedule, conflicts }`。
- 修复事件更新时遗漏的 `description/location/priority/attendees` 写回。
- 统一请求层与领域层优先级范围为 `1-5`。
- 前端编辑器改为自动冲突检测加软提示文案，移除过时的 `userId` 传参。

## 验证

- 为纯检测服务补充“不写库”的单元测试。
- 为事件服务补充 create/update/delete 后冲突缓存联动刷新的单元测试。
- 运行 `schedule` 模块相关 Vitest 用例。
