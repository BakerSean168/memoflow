---
tags:
  - plan
  - archive
  - governance
  - event-bus
description: server-first 目录下 unflushed-events 扫描盲区与统一 flush seam 收敛记录
created: 2026-07-11T00:00:00+08:00
updated: 2026-07-11T15:40:00+08:00
---

# Unflushed Domain Events Triage

> 已完成：PR #170 落地扫描修正和 9 个 seam 候选收敛；PR #165、#166 随后完成
> 事件总线加固与 Goal↔Task 标杆联动。

## 背景

PR #167 引入 `unflushed-events-audit` 时，仓库仍使用 `domain-server` / `infrastructure-server`
目录。审计冻结了 7 个旧路径 baseline。随后 PR #162 把业务包迁移到 `src/server/*`，但
审计的路径匹配和 baseline 没有同步迁移，导致审计在新目录下扫描 0 个目标文件并错误通过。

## 新目录复核结果

让扫描器同时识别旧目录和 `server/domain` / `server/infrastructure` 后，共得到 9 个迁移候选：

| 模块           | 仓储                                    | 迁移前状态                                                           |
| -------------- | --------------------------------------- | -------------------------------------------------------------------- |
| account        | PowerSyncAccountRepository              | 已手写 `pullDomainEvents + eventBus.send`，不是漏发，但属于分裂 seam |
| authentication | PowerSyncAuthSessionRepository          | 漏发                                                                 |
| governance     | PowerSyncRuleRepository                 | 漏发                                                                 |
| governance     | RulePrismaRepository                    | 漏发                                                                 |
| notification   | PowerSyncNotificationTemplateRepository | 漏发                                                                 |
| notification   | NotificationTemplatePrismaRepository    | 漏发                                                                 |
| reminder       | ReminderGroupPowerSyncRepository        | 漏发                                                                 |
| repository     | PowerSyncRepositoryRepository           | 漏发                                                                 |
| repository     | RepositoryPrismaRepository              | 漏发                                                                 |

因此准确口径是：**9 个 seam 收敛候选，其中 8 个真实漏发，1 个手写发布变体**。

旧工程 C 还迁移了 editor、schedule、setting 的相关仓储。PR #162 已在新目录实现中吸收这些
改动，所以 server-first 版本不再重复修改它们。

## 实施决策

工程 C v2 统一处理全部 9 个候选：

1. 普通仓储继承 `AggregateRepositoryBase`，只实现 `persist()`。
2. 有复合事务或自定义错误映射的 Rule 仓储在事务成功后调用 `publishAggregateEvents()`。
3. account PowerSync 保留 `save(account, tx?)` 的事务执行器语义，再统一发布事件。
4. audit 同时扫描旧目录与 server-first 目录，并将 baseline 清零。
5. 增加 account PowerSync adapter 回归测试，覆盖事务内持久化、事件发送和事件缓冲清空。

实现由 PR #170（`refactor/unified-flush-seam-v2`）承载。

## 治理联动

目录扫描修正后，`unflushed-events-audit` 应扫描非零文件，并报告 0 baseline exemption。

完整 `memoflow:governance-check` 还暴露了 PR #162 留下的独立 shape 问题：
`data-portability` 缺少 ADR-031 要求的 `server/domain`。PR #170 同时补齐最小 domain 入口，
使完整治理检查恢复通过。

## 完成标准

- unflushed audit 扫描 server-first 目录，不再出现“0 文件通过”。
- 9 个候选全部接入统一发布 seam，8 个真实漏发归零。
- baseline allowlist 为空。
- account PowerSync 事务参数行为有回归测试。
- 相关包 lint、typecheck、test、build 全绿。
- `memoflow:governance-check` 全绿。

以上标准已在 PR #170 分支及合并后的 `main` 验证通过。
