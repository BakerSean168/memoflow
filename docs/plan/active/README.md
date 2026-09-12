---
tags:
  - plan
  - active
description: 进行中的计划目录与当前状态
created: 2026-04-26T00:00:00
updated: 2026-09-09T00:31:00+08:00
---

# Active Plans

本目录存放仍在推进中的计划。

## 当前计划

当前有 6 个仍在推进中的 active plan。

| 计划                                                                                                      | 当前状态                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Goal vNext Model Convergence](./2026-09-08-goal-vnext-model-convergence.md)                              | **ACTIVE / UI convergence complete** — `GOAL-7202～7209` 已完成：canonical Goal/KR、Task/Knowledge Context、Workspace、AI GoalPlanDraft V2 与 property-chip/precision Target UI（含 React/Mobile parity）均已落地；下一项为 `GOAL-7210` legacy cleanup，之后执行最终 review。             |
| [Task vNext Model Convergence](./2026-09-08-task-vnext-model-convergence.md)                              | **ACTIVE / implementation started** — TaskPlan/TaskOccurrence 独立聚合、Schedule union、Result/Checklist、Reminder persistence parity、Goal-level link 与 Workspace read model；基线 71 files / 717 tests PASS。                                                                          |
| [Setting vNext Model Convergence](./2026-09-08-setting-vnext-model-convergence.md)                        | **ACTIVE / implementation complete, closure pending** — `SETTING-9202～9209` 已完成 canonical preferences、Notification/device ownership、Settings Hub、V3 preference portability 与 legacy persistence/protocol/client 删除；仅剩 `SETTING-9210` 五层 review / exact-head CI / archive。 |
| [AI vNext Model Convergence](./2026-09-09-ai-vnext-model-convergence.md)                                  | **ACTIVE / design frozen** — 保留 Mastra 单一 runtime，收敛 Conversation shell、Provider Secret/Model Capability、AI Context、Knowledge stable identity、Workflow Draft/Apply、ExecutionRecord；`AI-9601` 文档完成，其余 production implementation 未开始。                               |
| [Time + Label vNext Model Convergence](./2026-09-09-time-label-vnext-model-convergence.md)                | **ACTIVE / local closure complete** — `TIME-1201～1206` 与 `LABEL-1301～1305` 已全部完成，anti-resurrection governance 已接入；`FOUNDATION-1401` 本地五层终审完成，仅剩提交后的 exact-head required CI delivery gate。                                                                    |
| [System-wide vNext Model Convergence](./2026-09-09-system-wide-vnext-model-convergence-implementation.md) | **ACTIVE / canonical execution order** — ADR-067～111 统一 ownership review 已通过；ADR-111 明确零旧数据 destructive cutover，协调所有 module subplan 的依赖、共享 schema 单写者、直接删除与最终 exact-head closure。                                                                     |

## 本轮已归档（2026-09-08）

| 计划                                                                                                      | 结果                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MemoFlow Core vNext — Unified Refactor Orchestration](../archive/2026-08-25-core-vnext-orchestration.md) | Goal/Task/Routine/Planner/Scheduler/Notification/EventBus 全面收口；产品 parity、Schedule/Scheduler 物理拆分、HARD-7101~7105 全部完成；PR #338 第四轮 exact-head CI 19/19 全绿并合入 `088a9f16499`。 |

## 本轮已归档（2026-09-06）

| 计划                                                                                                              | 结果                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MemoFlow Delivery Platform V3](../archive/2026-09-02-delivery-platform-v3.md)                                    | Phase 1–4 全部闭环；v0.13.3 canonical production 已稳定 `DEPLOYED`，4401 五组 paired shadow 决定 retain-split，4402 全仓 Action immutable pinning，4403 app+DMG fail-closed macOS trust capability，4404 以 #328/#329、main CI `34012124207` 与 Coverage `34012124229` 完成最终观察并归档。当前 macOS policy 明确为 `unsigned-pilot`；trusted-public signing 仍是未来凭据条件。 |
| [GitHub Durable Installation Intent + Setup Gateway](../archive/2026-08-28-github-installation-intent-gateway.md) | v0.14.1 已 Published/production `DEPLOYED`；真实 Windows v0.14.0 证明 existing-installation backward-compatible recovery，v0.14.1 证明 no-browser retry；`BakerSean168/thought-forest` 已 `Active`，对应 intent 原子 `Consumed`，Desktop 最后一条 DoD 闭合。                                                                                                                    |

## 近期完成的基础计划

| 计划                                                                                            | 当前状态                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [应用契约与架构大重构](../archive/2026-08-17-application-contract-and-architecture-refactor.md) | **ADR-049 implemented**：failure-contract inventory 219→1；8 批次 #234–#241 全绿合并；DomainError 退役、baseline 收敛至唯一内部开发面。见 `docs/analysis/2026-08-18-adr-049-completion-evidence.md` |
| [CI/CD Platform V2 一次性重构](../archive/2026-08-05-ci-cd-platform-v2-refactor.md)             | **Archived（2026-08-19）**：架构实施+PR cutover 完成；baseline-v1 采集 7 同范围 run，DoD 性能项确认未达标（wall 10.66 vs 7-8），按偏差接受归档；契约/运营闭环已验证                                 |

## 本轮已归档（2026-08-23）

| 计划                                                                                                             | 结果                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MemoFlow AI vNext — Mastra-native 一次性大重构](../archive/2026-08-20-mastra-native-ai-vnext-refactor.md)       | AI-VNEXT-01–09 全部完成；TypeScript + Mastra 成为唯一核心 AI runtime；Python/LangGraph/AgentHost 退役；PR #252 required CI 全绿并合入 `5507722e2`                   |
| [Oracle2 / Hermes2 本地部署与产品流验证加固](../archive/2026-08-18-oracle2-hermes-local-validation-hardening.md) | Oracle2 历史里程碑保留；开发/验证主机迁移到 GCP Dev 后完成 MagicDNS + clean OCI revision + Auth/A–E 15/15 + host-E2E 隔离；Hermes2 parity 因主机架构变更 superseded |

## 本轮已归档（2026-08-16）

| 计划                                                                                                     | 结果                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Auth Flow Completeness](../archive/2026-08-16-auth-flow-completeness.md)                                | Better Auth 内存契约矩阵、typed error client mapping、Web verification scene guard 与重复注册 409 完成；cloud-auth/app-vue/web 全量 Vitest、typecheck、lint、governance-check 通过                                                                     |
| [RefArch Phase 6：可观测性与装配治理](../archive/2026-08-15-refarch-phase6-observability.md)             | Steps 1-7 完成：single observer/有界 metrics/opt-in OTel、transport-only module 契约、三组 AST surface locks + 双语 JSDoc audit 接入 governance-check、ADR-047、四宿主关键 journey（API/AI/Web/Desktop）与全量门禁通过；详见计划内 gate 记录与偏差说明 |
| [Goal / Task Composition Root 外移](../archive/2026-08-14-goal-task-composition-root-externalization.md) | Goal/Task repository-set ingredient seams、instance-bound transport、API/Desktop host composers、repository consumer 注入与 surface locks 已闭合；计划已归档                                                                                           |

## 本轮已归档（2026-08-15）

| 计划                                                                                                       | 结果                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [RefArch Phase 2：统一 Request/Execution Context](../archive/2026-08-15-refarch-phase2-request-context.md) | Steps 1-5 完成：canonical ExecutionContext、RequestContext middleware、governance-first adapter 试点、Principal ordering、AI→Python requestId 透传、SSE/smoke/inventory/docs 封口；详见计划内 gate 记录 |
| [RefArch Phase 1：P0 分层](../archive/2026-08-15-refarch-phase1-p0-layering.md)                            | 4 steps + 4 review rounds PASS：governance 试点、@prisma/client 边界、API runtime composer、phase1 docs/audit 闭合                                                                                      |

## 本轮已归档（2026-08-08）

| 计划                                                                                                 | 结果                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [基础 UI 与 Shell 重构](../archive/2026-08-06-ui-foundation-and-shell-refactor.md)                   | 三栏最小宽度与拖拽收缩、compound capsule/摘要入口、设置页扁平化；local-docker 产品旅程 7/7 通过，验收 6/6 勾选                                                                              |
| [基础 UI 与桌面 Shell 后续优化](../archive/2026-08-06-ui-foundation-shell-follow-up-optimization.md) | 场景生命周期、统一导航意图、Tab/KeepAlive、单一滚动宿主、设置桌面导航与模块骨架；commit 784fb9f6 落地，Phase 0-5 全勾选                                                                     |
| [业务闭环与模块边界重构 R0-R7](../archive/2026-08-07-business-loop-and-module-boundary-rebuild.md)   | R0 可观测 → R7 全部实施：乐观锁、outbox 单通道、ScheduleLease/claim、Reminder/Notification、Habit/Relation/AI/Activity/Wallet；commit d60e6eaf8 + local-docker e2e 7/7 + PR #211 19/19 全绿 |
| [业务重构 findings 追踪（R0-5）](../archive/2026-08-07-business-loop-findings-tracking.md)           | 全部 finding 状态同步为 done/wip→done；P0-01/P0-04/R2-5 落地证据回填                                                                                                                        |

## 本轮已归档（2026-08-03）

| 计划                                                                                                              | 结果                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [Desktop Cloud Connection Boundary Refactor](../archive/2026-08-03-desktop-cloud-connection-boundary-refactor.md) | Profile Access、Cloud Connection Dialog 与可选 PIN 解耦完成；Desktop E2E 2/2 与全仓 validation 通过                       |
| [Desktop GitHub Device Authorization](../archive/2026-08-03-desktop-github-device-authorization.md)               | Better Auth device flow、Web 显式批准、Desktop main 协调器、guest 原地 adoption 与离线重开完成；prod-like validation 通过 |
| [Desktop Profile 与云端认证一次性重写](../archive/2026-08-02-desktop-profile-and-cloud-auth-rewrite.md)           | Better Auth + Profile/Unlock 单轨完成；旧认证内核删除；Desktop E2E 与全仓 prod-like validation 通过                       |
| [Reka UI、Goal 一致性与桌面工作区长期重构](../archive/2026-08-01-reka-goal-consistency-and-workspace-refactor.md) | W0–W10 完成；Docker 旅程 7/7、Electron 布局矩阵、原子写入/可靠贡献/单导航与无障碍门槛通过                                 |
| [三轮 Docker 构建优化](../archive/2026-07-31-three-round-docker-build-optimization.md)                            | 三轮完成；API 镜像减少 30.9%，独立 migrator、isolated builder、显式生产依赖边界与 BuildKit cache 均通过 prod-like 验证    |
| [API Runtime 镜像裁剪](../archive/2026-07-31-api-runtime-image-pruning.md)                                        | runtime 使用生产依赖闭包；镜像减少约 70.4%；六服务 healthy，启动链与治理检查通过                                          |
| [最新 main 本机 Docker 产品复审](../archive/2026-07-31-latest-local-docker-product-review.md)                     | 六服务 healthy；部署阻塞已修；非 AI 与 AI 桌面复审 findings 见 `docs/audit/2026-07-31-local-docker-product-review.md`     |
| [本机 Docker 核心产品审查与优化](../archive/2026-07-29-local-docker-core-product-optimization.md)                 | Phase A–E 与第 10 节全通过；Docker PM journey 7/7、Electron 壳层 8/8、最终 validation pass                                |
| [MemoFlow 产品身份迁移](../archive/2026-07-29-memoflow-identity-migration.md)                                     | 仓库、源码、部署与文档标识统一；identity audit 已纳入治理门禁                                                             |
| [事务邮件通用 SMTP](../archive/2026-07-28-transactional-email-smtp.md)                                            | Phase A–D 实施完成；默认 console；指南见 `docs/guides/development/transactional-email-smtp.md`                            |
| [Docker Web PM 旅程 findings](../archive/2026-07-27-docker-web-pm-journey-findings.md)                            | 旅程记录；i18n/熔断/取码/SMTP 修复已入代码                                                                                |
| [Import Path Elegance](../archive/2026-07-27-import-path-elegance.md)                                             | 包内 `@/` → 相对路径完成；政策 `import-path-policy.md`                                                                    |
| [产品时间体系 ADR-037](../archive/2026-07-26-product-time-system.md)                                              | W0–W8 + P1–P11 完成（#191/#192）                                                                                          |
| [产品时间 Goal 提示词](../archive/2026-07-26-product-time-system-goal-prompt.md)                                  | 随时间 plan 归档                                                                                                          |
| [代码优雅化地基](../archive/2026-07-26-codebase-elegance-foundation.md)                                           | E1–E7；#189/#190 已合                                                                                                     |
| [Auth + Account 安全闭环](../archive/2026-07-17-auth-account-security-closure.md)                                 | A–E 源码闭环；投递见 SMTP archive                                                                                         |
| [Web 登录页优化](../archive/2026-07-15-web-auth-page-optimization.md)                                             | 主项已落地；残余法律文案/e2e                                                                                              |
| [Web 核心产品审查](../archive/2026-07-15-web-core-product-review.md)                                              | 审查历史材料                                                                                                              |
| [Web 产品设计复审](../archive/2026-07-16-web-product-design-review.md)                                            | 审查历史材料                                                                                                              |
| [Obsidian Vault 与 GitHub 知识仓库](../archive/2026-07-16-obsidian-vault-repository-optimization.md)              | §13.2 **15/15**；合 main **#188**                                                                                         |
| [Windows vault-repo residual handoff](../archive/2026-07-25-windows-vault-repo-residual-handoff.md)               | Windows 收尾完成；历史 handoff                                                                                            |

## 规则

- 新计划默认放这里
- 文件名使用 `YYYY-MM-DD-topic-slug.md`
- 计划完成、终止或只保留历史参考价值后，移动到 `../archive`
