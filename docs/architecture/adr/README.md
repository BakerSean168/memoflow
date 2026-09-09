---
tags:
  - adr
  - index
description: 架构决策记录索引
created: 2025-11-23T15:00:00
updated: 2026-09-09T00:30:00+08:00
---

# ADR 索引

本目录只收录正式的 Architecture Decision Record。ADR 文件名必须使用 `ADR-XXX-kebab-case.md`，编号必须唯一；新增或调整 ADR 时，必须在同一变更中更新本索引。

## 当前 ADR

<!-- prettier-ignore -->
| 编号                                                                | 标题                                                     | 状态   | 日期       |
| ------------------------------------------------------------------- | -------------------------------------------------------- | ------ | ---------- |
| [ADR-001](./ADR-001-use-nx-monorepo.md)                             | 使用 Nx Monorepo                                         | 已采纳 | 2024-08-15 |
| [ADR-002](./ADR-002-ddd-pattern.md)                                 | 采用 DDD 架构模式                                        | 已采纳 | 2024-08-20 |
| [ADR-003](./ADR-003-event-driven-architecture.md)                   | 事件驱动架构                                             | 已采纳 | 2024-09-01 |
| [ADR-004](./ADR-004-electron-desktop-architecture.md)               | Electron 桌面应用架构与包提取策略                        | 已采纳 | 2025-12-03 |
| [ADR-005](./ADR-005-ui-package-multi-framework.md)                  | UI 包多框架支持架构                                      | 已采纳 | 2025-12-03 |
| [ADR-006](./ADR-006-desktop-ipc-communication.md)                   | Desktop IPC 通信架构与依赖注入集成                       | 已采纳 | 2025-12-06 |
| [ADR-007](./ADR-007-api-consistency.md)                             | API 接口一致性规范                                       | 提议中 | 未注明     |
| [ADR-008](./ADR-008-standard-api-response-format.md)                | API Response Format                                      | 已采纳 | 2026-01-15 |
| [ADR-009](./ADR-009-standard-clean-architecture-layers.md)          | Clean Architecture Layers                                | 已采纳 | 2026-01-15 |
| [ADR-010](./ADR-010-standard-centralized-contracts.md)              | Centralized Contracts                                    | 由 ADR-049 修订 | 2026-01-15 |
| [ADR-011](./ADR-011-standard-naming-conventions.md)                 | Naming Conventions                                       | 已采纳 | 2026-01-15 |
| [ADR-012](./ADR-012-standard-error-handling.md)                     | Error Handling                                           | 由 ADR-049 修订 | 2026-01-15 |
| [ADR-013](./ADR-013-standard-testing-strategy.md)                   | Testing Strategy                                         | 已采纳 | 2026-01-15 |
| [ADR-014](./ADR-014-standard-typescript-guidelines.md)              | TypeScript Guidelines                                    | 已采纳 | 2026-01-15 |
| [ADR-015](./ADR-015-dev-phase-simplicity-preference.md)             | Dev Phase Simplicity Preference                          | 已采纳 | 2026-01-16 |
| [ADR-016](./ADR-016-apps-as-containers.md)                          | Apps as Containers                                       | 已采纳 | 未注明     |
| [ADR-017](./ADR-017-centralized-types.md)                           | Absolute Type Centralization in Contracts                | 已被 ADR-049 取代 | 未注明     |
| [ADR-018](./ADR-018-smart-container-application-service-pattern.md) | Smart Container + Application Service Pattern            | 已采纳 | 2026-01-18 |
| [ADR-019](./ADR-019-module-extension-strategy.md)                   | 模块扩展策略                                             | 已采纳 | 2025-12-08 |
| [ADR-020](./ADR-020-api-server-unified-extraction-strategy.md)      | API Server 统一提取策略                                  | 已采纳 | 2026-01-19 |
| [ADR-021](./ADR-021-api-routes-file-organization-strategy.md)       | API 路由文件组织策略                                     | 已采纳 | 2026-01-19 |
| [ADR-022](./ADR-022-api-module-routing-refactor.md)                 | API 模块路由重构                                         | 已采纳 | 2025-01-19 |
| [ADR-023](./ADR-023-server-side-clean-architecture-refactor.md)     | Server-Side Layer Decoupling & Pure Dependency Injection | 已采纳 | 2026-01-21 |
| [ADR-024](./ADR-024-application-service-framework-decoupling.md)    | ApplicationService 框架解耦方案                          | 已采纳 | 2025-01-18 |
| [ADR-025](./ADR-025-module-composition-pattern.md)                  | Module Composition Pattern                               | 已采纳 | 2026-08-13 |
| [ADR-026](./ADR-026-server-side-adapter-pattern.md)                 | Server-Side Adapter Pattern                              | 已采纳 | 2026-02-19 |
| [ADR-027](./ADR-027-zod-to-openapi-documentation.md)                | API Documentation with Zod-to-OpenAPI                    | 已采纳 | 2026-02-19 |
| [ADR-028](./ADR-028-workspace-package-resolution-strategy.md)       | Workspace Package Resolution Strategy                    | 已采纳 | 2026-03-09 |
| [ADR-029](./ADR-029-main-process-sqlite-access.md)                  | 主进程 SQLite 直接访问策略                               | 已过时 | 2025-12-06 |
| [ADR-030](./ADR-030-standard-result-pattern.md)                     | Unifying API Responses with Result Pattern               | 由 ADR-049 修订 | 2026-01-16 |
| [ADR-031](./ADR-031-server-feature-standard-shape.md)               | Server Feature Standard Shape                            | 已采纳 | 2026-08-13 |
| [ADR-032](./ADR-032-support-package-import-conventions.md)          | Support Package Import Conventions                       | 已采纳 | 2026-05-25 |
| [ADR-033](./ADR-033-cross-module-communication-patterns.md)         | Cross-Module Communication Patterns                      | 已采纳 | 2026-07-10 |
| [ADR-034](./ADR-034-obsidian-vault-repository.md)                   | 本地 Obsidian Vault 与可选 GitHub 知识仓库               | 已采纳 | 2026-07-16 |
| [ADR-035](./ADR-035-unified-assistant-agent-host.md)                | 统一助手与可插拔 Agent Host                              | 已被 ADR-050 取代 | 2026-07-17 |
| [ADR-036](./ADR-036-auth-account-boundary-and-verification.md)                | Auth / Account 边界与验证安全模型                          | 已采纳 | 2026-07-17 |
| [ADR-037](./ADR-037-product-time-system.md)                       | 产品时间体系（Instant/Ymd、TransferDate、门面与风格） | 已采纳 | 2026-07-26 |
| [ADR-038](./ADR-038-goal-consistency-and-reliable-task-contributions.md) | Goal 一致性与可靠 Task 贡献链路 | 已采纳（Task binding 语义由 ADR-056 修订） | 2026-08-01 |
| [ADR-039](./ADR-039-cloud-auth-and-local-profile-access.md) | Cloud Auth 与 Local Profile Access 分离 | 已采纳 | 2026-08-02 |
| [ADR-040](./ADR-040-test-system-v2.md) | Test System V2 单一归属与稳定门禁 | 已采纳 | 2026-08-04 |
| [ADR-041](./ADR-041-ci-cd-platform-v2.md) | CI/CD Platform V2 解耦与可扩展交付平台 | 已接受 | 2026-08-05 |
| [ADR-042](./ADR-042-unified-business-operation-and-delivery-contracts.md) | 统一业务操作、可靠交付与 Fail-Fast 能力契约 | 已采纳 | 2026-08-09 |
| [ADR-043](./ADR-043-unified-operation-timeline-replay-audit.md) | 统一 Operation Timeline、最小权限 Replay 与审计、统一指标命名 | 已采纳 | 2026-08-12 |
| [ADR-044](./ADR-044-w0-w6-fault-matrix.md) | W0-W6 关键故障矩阵（ADR-043 附属：故障、注入层、durable fact、恢复动作、禁止状态、测试文件） | 已采纳 | 2026-08-12 |
| [ADR-045](./ADR-045-unified-request-execution-context.md) | 统一 HTTP/IPC/System 的 Request/Execution Context（RefArch Phase 2） | 已采纳 | 2026-08-15 |
| [ADR-046](./ADR-046-query-cache-powersync-offline-policy.md) | Query Cache Pilot — Offline / Freshness / PowerSync 策略（试点范围：Desktop networkMode、freshness、reconnect ordering、profile isolation、拒绝 cache 持久化） | 已接受（试点范围） | 2026-08-15 |
| [ADR-047](./ADR-047-api-observability-pipeline.md) | API 可观测性流水线与装配治理（single observer、有界 metrics、默认 noop / opt-in OpenTelemetry、transport-only 模块注册上下文） | 已采纳 | 2026-08-15 |
| [ADR-048](./ADR-048-transport-contract-parity.md) | Transport Contract Parity — adapter-owned validation、HTTP/IPC parity fixture、mapper 边界与 direct Vitest 门禁（RefArch Phase 4） | 已采纳 | 2026-08-16 |
| [ADR-049](./ADR-049-domain-outcome-and-failure-contracts.md) | Domain Outcomes and Failure Contracts — 领域故障、应用结果、公开失败、provider ACL 与传输投影 | 已采纳（实施中） | 2026-08-17 |
| [ADR-050](./ADR-050-mastra-native-ai-runtime.md) | MemoFlow AI vNext — Mastra-native Runtime 与单一状态所有权 | 已采纳 | 2026-08-20 |
| [ADR-051](./ADR-051-ai-primitive-taxonomy.md) | AI Primitive Taxonomy — Agent / Tool / Workflow / Skill / Memory / Context | 已采纳 | 2026-08-20 |
| [ADR-052](./ADR-052-goal-create-reference-workflow.md) | `goal.create` Reference Workflow 与确定性业务执行 | 已采纳（Goal/Task draft schema 由 ADR-053~056 修订） | 2026-08-20 |
| [ADR-053](./ADR-053-goal-task-personal-product-boundary.md) | Goal / Task 个人产品边界与信息架构收敛 | 已采纳并实施（Goal 新模型由 ADR-067/069 修订） | 2026-08-25 |
| [ADR-054](./ADR-054-shared-labels-and-system-views.md) | Shared Labels 与 System Views 分离 | 已采纳并实施 | 2026-08-25 |
| [ADR-055](./ADR-055-key-result-measurement-progress-v2.md) | Key Result Measurement & Progress V2 | 已采纳并实施（待 ADR-068 V3 替代） | 2026-08-25 |
| [ADR-056](./ADR-056-task-plan-goal-link-contribution-settlement.md) | Task Plan → Goal Link / Contribution / Settlement | 已采纳并实施（Goal-level link 由 ADR-069 修订） | 2026-08-25 |
| [ADR-057](./ADR-057-task-occurrence-outcome-and-plan-lifecycle.md) | Task Occurrence Outcome、Overdue 与 Task Plan 生命周期 | 已采纳（待实施） | 2026-08-25 |
| [ADR-058](./ADR-058-oss-first-standard-capability-reuse.md) | OSS-first 标准能力复用与领域所有权边界 | 已采纳（从 Goal / Task vNext 开始执行） | 2026-08-25 |
| [ADR-059](./ADR-059-routine-coach-domain-runtime-and-surfaces.md) | Routine Coach 领域、Runtime 与交互 Surface | 已采纳（待实施） | 2026-08-25 |
| [ADR-060](./ADR-060-schedule-planner-and-scheduler-boundary.md) | Schedule / Planner 与 Scheduler / Temporal Engine 分离 | 已采纳并实施 | 2026-08-25 |
| [ADR-061](./ADR-061-business-module-scheduling-port-and-handler-registry.md) | 业务模块通过 Scheduling Port 与 Handler Registry 接入 Scheduler | 已采纳并实施（由 ADR-081~083 继续收敛） | 2026-08-25 |
| [ADR-062](./ADR-062-reminder-routine-single-scheduling-authority.md) | Reminder / Routine 单一调度权与可靠 Occurrence 执行 | 已采纳（待实施） | 2026-08-25 |
| [ADR-063](./ADR-063-notification-fact-delivery-policy-and-device-surfaces.md) | Notification Fact、Delivery Policy 与 Device Surface 分离 | 已采纳（待实施） | 2026-08-25 |
| [ADR-064](./ADR-064-emittery-runtime-event-delivery.md) | Runtime EventBus 采用 Emittery 与 Delivery-scoped Async Publish | 已采纳并实施 | 2026-08-25 |
| [ADR-065](./ADR-065-durable-github-installation-intent-gateway.md) | Durable GitHub App Installation Intent 与 Setup Gateway | 已采纳 | 2026-08-28 |
| [ADR-066](./ADR-066-adopt-delivery-platform-v3.md) | MemoFlow Delivery Platform V3 与跨平台 build-once/promote-many 交付模型 | 已采纳并实施 | 2026-09-02 |
| [ADR-067](./ADR-067-goal-vnext-product-model-and-lifecycle.md) | Goal vNext Product Model、Lifecycle 与 Target Timeframe | 已采纳（待实施） | 2026-09-08 |
| [ADR-068](./ADR-068-key-result-measurement-v3.md) | Key Result Measurement V3 — Initial / Current / Target | 已采纳（待实施） | 2026-09-08 |
| [ADR-069](./ADR-069-goal-workspace-cross-module-context.md) | Goal Workspace 与跨模块 Context Read Model | 已采纳（待实施） | 2026-09-08 |
| [ADR-070](./ADR-070-ai-goal-plan-orchestration.md) | AI GoalPlanDraft V2 与多实体 Goal Context Orchestration | 已采纳（待实施） | 2026-09-08 |
| [ADR-071](./ADR-071-task-plan-occurrence-aggregate-boundary.md) | Task Plan / Task Occurrence 聚合边界 | 已采纳（实施中） | 2026-09-08 |
| [ADR-072](./ADR-072-task-plan-schedule-algebra.md) | Task Plan Schedule Algebra | 已采纳（实施中） | 2026-09-08 |
| [ADR-073](./ADR-073-task-occurrence-result-and-checklist.md) | Task Occurrence Result 与 Checklist | 已采纳（实施中） | 2026-09-08 |
| [ADR-074](./ADR-074-task-reminder-policy-persistence.md) | Task Reminder Policy 与 Persistence Parity | 已采纳（实施中） | 2026-09-08 |
| [ADR-075](./ADR-075-task-workspace-context-and-goal-link.md) | Task Workspace、Context 与 Goal Link | 已采纳（实施中） | 2026-09-08 |
| [ADR-076](./ADR-076-routine-definition-trigger-and-legacy-reminder-retirement.md) | Routine Definition、Trigger Algebra 与 Legacy Reminder 退役 | 已采纳（待实施） | 2026-09-08 |
| [ADR-077](./ADR-077-routine-occurrence-interaction-and-reliability-boundary.md) | Routine Occurrence、Interaction 与 Reliability Boundary | 已采纳（待实施） | 2026-09-08 |
| [ADR-078](./ADR-078-routine-profile-eligibility-runtime-context-and-overrides.md) | Routine Profile、Eligibility、Runtime Context 与 Temporary Override | 已采纳（待实施） | 2026-09-08 |
| [ADR-079](./ADR-079-routine-intervention-policy-notification-and-surface-boundary.md) | Routine Intervention Policy、Notification 与 Device Surface 边界 | 已采纳（待实施） | 2026-09-08 |

| [ADR-080](./ADR-080-planner-calendar-range-occupancy-and-conflict-model.md) | Planner Calendar Range、Occupancy 与 Conflict Model | 已采纳（待实施） | 2026-09-08 |
| [ADR-081](./ADR-081-scheduled-invocation-model-and-legacy-schedule-task-retirement.md) | ScheduledInvocation Model 与 Legacy ScheduleTask 退役 | 已采纳（待实施） | 2026-09-08 |
| [ADR-082](./ADR-082-scheduler-invocation-attempt-and-runtime-state-machine.md) | Scheduler Invocation Attempt 与 Runtime State Machine | 已采纳（待实施） | 2026-09-08 |
| [ADR-083](./ADR-083-schedule-scheduler-contract-diagnostics-and-persistence-boundary.md) | Schedule / Scheduler Contract、Diagnostics 与 Persistence Boundary | 已采纳（待实施） | 2026-09-08 |
| [ADR-084](./ADR-084-notification-fact-and-inbox-lifecycle.md) | Notification Fact 与 Inbox Lifecycle | 已采纳（待实施） | 2026-09-08 |
| [ADR-085](./ADR-085-notification-workflow-semantics-and-template-retirement.md) | Notification Workflow Semantics 与 Template 退役 | 已采纳（待实施） | 2026-09-08 |
| [ADR-086](./ADR-086-notification-delivery-plan-projection-and-channel-retirement.md) | Notification DeliveryPlan、Projection 与 Legacy Channel 退役 | 已采纳（待实施） | 2026-09-08 |
| [ADR-087](./ADR-087-notification-interaction-and-typed-action-intents.md) | Notification Interaction 与 Typed Action Intents | 已采纳（待实施） | 2026-09-08 |
| [ADR-088](./ADR-088-notification-preference-quiet-hours-realtime-and-operations-boundary.md) | Notification Preference、QuietHours、Realtime 与 Operations Boundary | 已采纳（待实施） | 2026-09-08 |
| [ADR-089](./ADR-089-knowledge-space-source-binding-and-health-boundaries.md) | KnowledgeSpace、Source Binding 与 Health/Observation Boundary | 已采纳（待实施） | 2026-09-08 |
| [ADR-090](./ADR-090-stable-knowledge-document-identity.md) | Stable KnowledgeDocument Identity | 已采纳（待实施） | 2026-09-08 |
| [ADR-091](./ADR-091-knowledge-projection-index-and-operation-boundaries.md) | Knowledge Projection、AI Index 与 Operation Boundary | 已采纳（待实施） | 2026-09-08 |
| [ADR-092](./ADR-092-settings-hub-and-preference-ownership-boundary.md) | Settings Hub 与 Preference Ownership Boundary | 已采纳（待实施） | 2026-09-08 |
| [ADR-093](./ADR-093-user-preference-profile-and-product-time-context.md) | User Preference Profile 与 Product Time Context | 已采纳（待实施） | 2026-09-08 |
| [ADR-094](./ADR-094-device-preference-feature-policy-and-consent-boundary.md) | Device Preference、Feature Policy 与 Consent Boundary | 已采纳（待实施） | 2026-09-08 |
| [ADR-095](./ADR-095-preference-persistence-sync-migration-and-portability.md) | Preference Persistence、Sync、Migration 与 Portability | 已采纳（待实施） | 2026-09-08 |
| [ADR-096](./ADR-096-assistant-conversation-shell-and-mastra-runtime-state-boundary.md) | Assistant Conversation Shell 与 Mastra Runtime State Boundary | 已采纳（待实施） | 2026-09-09 |
| [ADR-097](./ADR-097-ai-provider-connection-secret-and-model-capability-boundary.md) | AI Provider Connection、Secret 与 Model Capability Boundary | 已采纳（待实施） | 2026-09-09 |
| [ADR-098](./ADR-098-ai-context-knowledge-index-and-owner-contract-boundary.md) | AI Context、Knowledge Index 与 Owner Contract Boundary | 已采纳（待实施） | 2026-09-09 |
| [ADR-099](./ADR-099-ai-workflow-draft-apply-and-execution-record-boundary.md) | AI Workflow Draft、Apply 与 Execution Record Boundary | 已采纳（待实施） | 2026-09-09 |
| [ADR-100](./ADR-100-product-time-context-and-timezone-aware-calendar.md) | Product Time Context 与 Timezone-aware Calendar | 已采纳（待实施） | 2026-09-09 |
| [ADR-101](./ADR-101-product-time-presentation-and-compatibility-surface.md) | Product Time Presentation 与 Compatibility Surface | 已采纳（待实施） | 2026-09-09 |
| [ADR-102](./ADR-102-label-registry-and-owner-assignment-boundary.md) | Label Registry 与 Owner Assignment Boundary | 已采纳（待实施） | 2026-09-09 |
| [ADR-103](./ADR-103-label-identity-normalization-time-and-color-contract.md) | Label Identity、Normalization、Time 与 Color Contract | 已采纳（待实施） | 2026-09-09 |
| [ADR-104](./ADR-104-account-profile-lifecycle-and-cloud-identity-projection.md) | Account Profile、Lifecycle 与 Cloud Identity Projection | 已采纳（待实施） | 2026-09-09 |
| [ADR-105](./ADR-105-cloud-auth-access-enforcement-and-local-profile-boundary.md) | Cloud Auth、Access Enforcement 与 Local Profile Boundary | 已采纳（待实施） | 2026-09-09 |
| [ADR-106](./ADR-106-owner-driven-data-portability-v3.md) | Owner-driven Data Portability V3 | 已采纳（待实施） | 2026-09-09 |
| [ADR-107](./ADR-107-legacy-editor-persistence-retirement.md) | Legacy Editor Persistence Retirement | 已采纳（待实施） | 2026-09-09 |
| [ADR-108](./ADR-108-dashboard-retirement-and-home-composition.md) | Dashboard Retirement 与 Home Composition | 已采纳（待实施） | 2026-09-09 |
| [ADR-109](./ADR-109-product-governance-to-knowledge-standards.md) | Product Governance → Knowledge Standards | 已被 ADR-110 取代 | 2026-09-09 |
| [ADR-110](./ADR-110-governance-permanent-executable-reference-module.md) | Governance 永久可执行参考模块与开发规范工作台 | 已采纳 | 2026-09-09 |

## 维护规则

- 规则类 ADR 与实施类 ADR 统一收录在这里，不再使用 `003b`、`007b` 这类旁支编号。
- 历史文档允许保留原始正文结构，但文件名、标题编号和索引状态必须保持一致。
- 文档与代码冲突时，以当前代码、配置和测试为准；ADR 负责保留决策背景，不替代实现事实。
