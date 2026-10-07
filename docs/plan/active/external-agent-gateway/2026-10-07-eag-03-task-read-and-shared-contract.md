---
tags: [plan, active, mcp, task]
description: EAG-03 TaskPlan 和 TaskOccurrence 只读能力与双 owner 最小共享契约
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-03：Task 只读与最小共享契约

状态：已实现并验证本次 PAT 六工具范围；真实数据库、官方 SDK、完整 affected 检查及最终 prod-like 验收通过。证据：[EAG-03](../../../analysis/2026-10-07-eag-03-task-read-evidence.md)。依赖：EAG-02。入口：[总方案](../2026-10-07-external-agent-gateway.md)。

## 交付行为

增加 task_plan_get/search、task_occurrence_get/list，组成首批 6 个 read tools。TaskPlan 与 Occurrence 的 ID、版本、时间语义清楚，只有两个 owner 已验证的重复才提升为 helper。

## 实施步骤

1. TaskApplicationPort 绑定四个明确查询；读取时按 identity 注入，详情只返回该 owner 内容和关联引用。
2. 补必要的 owner 数据库分页和有限时间范围，验证用户 IANA timeZone、Ymd/Instant 和时区边界；严格执行页大小与响应预算。
3. 比较 Goal/Task 的实际重复，提取 descriptor 的数据形状和 transport mapping；handler 保持显式 typed binding。没有重复的语义不抽象。
4. 用已有 Mastra read adapter 的兼容 fixture 验证 descriptor 不依赖 SDK；在一个真正共用的操作上验证两 adapter parity。若此时尚无共用操作，保留 parity seam，并由 EAG-09 的 planner operation 完成实际迁移，不能声称 EAC-10 已完成。
5. 记录每个工具的字段、时间含义、权限和样例；确保 JSON Schema 输出仍保留 owner refinement 的运行校验。

## 保护契约

不新增 `task_complete` 歧义工具，不迁移全部 Mastra tool registry。Task query 的 owner envelope 可以有明确投影，不能复制出另一个 Task 业务模型。scope tasks:read 不允许扩展查询任意 Goal 内容。

## 验收与验证

- 6 个工具 strict input/output；schema/list/name 唯一性、unknown tool、直接越权 call 覆盖。
- 两账户、多页、同排序键、DST/跨日、无 upcoming occurrence、有 overdue occurrence 均有明确结果。
- 缺少 tasks:read 时既不发现也不能执行 Task tools；持有 write scope 不自动获得 read。
- contracts、task、goal、api 最近 tests/typecheck/lint 及文档门禁通过；记录 EAC-05 与共享提取证据。

## 回退与移交

单独关闭 Task tool 注册并保留 Goal pilot；不回滚 owner 数据。与 EAG-04 汇合后进入完整 OAuth read 验收。

## 当前源码核验（2026-10-07）

现有 TaskApplicationPort 的范围查询先完整加载所有 range/overdue occurrence；get plan 的统计 fallback 也会加载全部实例，不能直接用于 hosted 有界读取。实施时由 Task owner 新增公开的有界 application query factory，内部复用现有 Prisma mapper 和领域 `toClientDTOAt`，Gateway 只绑定其端口。Plan 最小投影不返回统计字段，避免把未查询的统计伪装为零。

当前用户授权交付 PAT + 六个只读工具，EAG-04/05 OAuth 明确延期。本项只读验收随 PAT 独立完成；OAuth 不再是本次交付依赖。分页使用 Plan createdAt/id 和 Occurrence scheduleDate/id；范围为 epoch-ms Instants，转换为当前账户的 IANA Product Time inclusive Ymd。范围最长 31×24 小时；可选 overdue 为开始 Ymd 前 Pending/InProgress 的已有事实，绝不创建 upcoming occurrence。Occurrence 页固定 asOf，并绑定当前时区；时区变更后旧 cursor 拒绝，要求重新查询。

官方 SDK 2.3.1 使用 Standard JSON Schema 转换。当前 TaskYmd/TaskHm 的 `z.custom` 不能输出 JSON Schema，已直接验证转换失败。应先将该 owner 的日期/时间边界改为可表示的 string/pattern schema（日期复用 canonical Ymd 校验），保留 Window/recurrence/schedule 的运行 refinement；不删 refinement 来换取工具注册成功。


## 最终审查修正（2026-10-07）

MCP 与 owner 共用有效 epoch-ms 输入边界 `[0, 253402214400000]`，保证任何 IANA 时区下可投影为四位年份 Ymd；超界输入在 SDK 校验时拒绝，不调用 owner。账户时区读取也是 Task 请求预算的一部分，由 Setting owner 提供限时 Prisma time query；Task 不读取 Setting 表。未知异常经独立内部 diagnostic observer 传递真实 cause，公开返回安全错误码，日志只保留 causeRef、分类与源位置，不记录 provider message 或请求内容。

状态：已实现并验证；最终镜像与实际容器六工具 SDK journey 已通过。EAC-10 实际 Mastra/MCP 共用操作 parity 明确延期至 EAG-09；本次只提供 SDK 无关 descriptor seam，不将其声明为全量 parity 已验收。
