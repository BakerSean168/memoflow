---
tags:
  - product
  - feature-map
description: MemoFlow 当前核心功能与 vNext 产品边界地图
created: 2026-06-02T00:00:00
updated: 2026-09-08T09:00:00+08:00
---

# 功能地图

本页只描述当前生产代码的产品边界；历史方案、已退休能力与迁移理由放在 ADR / analysis 文档中。

| 模块 | 当前核心能力 | 当前状态 | 主要入口 | 关键边界 |
| --- | --- | --- | --- | --- |
| Goal | Direction + KR Measurement V2、Record、Review、Shared Label、AI Goal draft | Core vNext 已落地 | `packages/goal`、`packages/app-vue/src/modules/goal`、`packages/app-react` | 无 GoalFolder/category/string tags/Focus/Comparison；`archivedAt` 与业务状态分离 |
| Task | Plan + Occurrence、Today/Upcoming/Plans、Missed/Skipped、recurrence、Shared Label、Goal Link/optional contribution | Core vNext 已落地 | `packages/task`、`packages/app-vue/src/modules/task`、`packages/app-react` | 无 TaskFolder/Dependency/DAG/CriticalPath；Overdue 为派生事实；无 raw Scheduler mutation |
| Routine / Reminder | RoutineDefinition、ProfileMembership、WallClock/ActiveUsage/Protocol、Temporary Override、Occurrence、Method Library | Core vNext 已落地 | `packages/reminder`、`packages/app-vue/src/modules/reminder` | ReminderTemplate 是迁移兼容写入入口；无 ControlMode/独立 cron scanner；Scheduler 仅负责 durable wake-up |
| Planner / Calendar | CalendarEntry、Day/Week/Month Planner、冲突检测、drag/resize owner commands | Core vNext 已落地 | `packages/schedule`、`packages/app-vue/src/modules/schedule` | `@memoflow/schedule` 是产品 Planner；不拥有 worker job |
| Scheduler / Temporal Engine | ScheduledIntent reconcile、ScheduleTask/Execution、lease、queue、retry/backoff、handler registry、只读 diagnostics | Core vNext 已落地 | `packages/scheduler` | 后台基础设施；产品 UI/AI 不直接写 raw ScheduleTask |
| Notification | NotificationRequested、Fact、DeliveryPolicy/Plan、per-channel attempt/receipt、DND/rate limit、Notification Center | Core vNext 已落地 | `packages/notification`、`packages/app-vue/src/modules/notification`、`packages/app-react` | Fact 与 delivery state 分离；业务 producer 不直接 dispatch channel |
| AI | Mastra Assistant、Goal/Task/Knowledge durable workflows、Routine approved commands、Planner/Notification read tools、BYOK、usage/eval | Mastra-native vNext 已落地 | `packages/ai`、`apps/api/src/runtime/compose-ai.ts`、`apps/desktop/src/main/runtime/compose-ai.ts` | Mastra 是唯一 Assistant/Workflow runtime；mutation 必须走 owner port；Planner/Notification 只读；禁止 Scheduler raw access |
| Repository | Vault/GitHub knowledge、Git sync、搜索/反链、Knowledge AI ports | 主线已落地 | `packages/repository`、Repository workspace | Repository 是知识事实 owner；AI 通过 read/mutation port 访问 |
| Dashboard | 统一读模型、统计/趋势、小组件 | 已落地 | `packages/dashboard`、Dashboard UI | 只消费 owner-domain projection，不成为第二份业务真值 |
| Account / Auth / Profile | Better Auth 账密/GitHub、Desktop guest/Profile unlock、cloud adoption/offline recovery | 单轨已落地 | `packages/cloud-auth`、`apps/desktop/src/main/profile`、`apps/web/src/auth` | 云端身份与本地 Profile 分离；云端失效只暂停同步，本地数据继续可用 |
| Settings | 外观、语言、AI Provider、通知、隐私、数据可移植性 | 已落地 | `packages/setting`、Settings UI | Provider secret 只存在 host-side secure storage |
| Governance | 架构、surface、failure contract、test inventory、CI 规则 | 持续执行 | `tools/governance`、`tools/test-system-v2` | HARD-7102 anti-resurrection locks 阻止旧架构复活 |

## 当前 Core vNext closure

Wave 0–5 与 CLEAN-6301~6304、POC-6401、ROUTINE-5302、AI-6101~6103、MOBILE-6201/6202、HARD-7101~7103 已完成。当前 active plan 只剩 HARD-7104 文档真值闭环与 HARD-7105 最终审查/归档。
