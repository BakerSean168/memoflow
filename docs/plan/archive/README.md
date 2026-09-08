---
tags:
  - plan
  - archive
description: 归档计划目录
created: 2026-04-26T00:00:00
updated: 2026-09-08T12:14:00+08:00
---

# Archived Plans

本目录存放已完成、暂停或仅保留背景参考价值的历史计划。

## 规则

- 不在这里维护活跃任务
- 归档文件保留原始计划上下文，必要时在文首补充结果或停用原因

## 季度子索引

历史文件较多，按季度分组导航（子索引仅为导航，正文仍在本目录原文件）：

- [2026 Q2（4–6 月）](./2026-Q2.md)
- [2026 Q3（7–9 月）](./2026-Q3.md)

## 本轮归档

| 日期       | 计划                                                                                                     | 结果                                                                                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-08 | [MemoFlow Core vNext — Unified Refactor Orchestration](./2026-08-25-core-vnext-orchestration.md) | Goal/Task/Routine/Planner/Scheduler/Notification/EventBus 重构与 residual 全闭环；HARD-7101~7105 完成，PR #338 exact-head CI 19/19 全绿并合入 `088a9f16499` |
| 2026-09-06 | [MemoFlow Delivery Platform V3](./2026-09-02-delivery-platform-v3.md)                                    | Phase 1–4 完成；exact candidate/staging/release/production authority、v0.13.3 live rollout、retain-split timing、Action pinning、macOS trust capability 与 final CI/Coverage observation 全闭环 |
| 2026-09-04 | [AI Provider Onboarding V2](./2026-08-25-ai-provider-onboarding-v2.md)                                   | CC Switch/LobeChat 风格 onboarding、SSRF / DNS pinning、one-time handle、atomic encrypted save/replacement、Custom + real OpenRouter E2E、PR required CI/local Docker acceptance 全闭环         |
| 2026-08-23 | [MemoFlow AI vNext — Mastra-native 一次性大重构](./2026-08-20-mastra-native-ai-vnext-refactor.md)        | AI-VNEXT-01–09 完成；PR #252 全绿合并；Mastra 唯一 runtime、legacy hard-delete、eval/usage/local Docker 验收闭合                                                                                |
| 2026-08-20 | [UI Shell Focus Polish](./2026-08-19-ui-shell-focus-polish.md)                                           | #250：Settings 单顶栏、300ms hover intent、移除冗余控件、按 AI 会话记忆 focus/split                                                                                                             |
| 2026-08-08 | [基础 UI 与 Shell 重构](./2026-08-06-ui-foundation-and-shell-refactor.md)                                | 三栏最小宽度与拖拽收缩、compound capsule、设置页扁平化；local-docker 产品旅程 7/7                                                                                                               |
| 2026-08-08 | [基础 UI 与桌面 Shell 后续优化](./2026-08-06-ui-foundation-shell-follow-up-optimization.md)              | 场景生命周期/导航意图/滚动宿主/模块骨架；commit 784fb9f6                                                                                                                                        |
| 2026-08-08 | [业务闭环与模块边界重构 R0-R7](./2026-08-07-business-loop-and-module-boundary-rebuild.md)                | R0-R7 实施完成；local-docker e2e 7/7、PR #211 19/19 全绿                                                                                                                                        |
| 2026-08-08 | [业务重构 findings 追踪](./2026-08-07-business-loop-findings-tracking.md)                                | 状态全部同步 done；P0-01/P0-04/R2-5 证据回填                                                                                                                                                    |
| 2026-08-05 | [Test System V2](./2026-08-04-test-system-v2-refactor.md)                                                | #204；唯一归属、七 Oracle、active ruleset；全绿 run 30934384004                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------                                                                                                    |
| 2026-08-05 | [Test System V2](./2026-08-04-test-system-v2-refactor.md)                                                | #204；唯一归属、七 Oracle、active ruleset；全绿 run 30934384004                                                                                                                                 |
| 2026-08-04 | [CI Feedback Loop Phase Two](./2026-08-04-ci-feedback-loop-phase-two.md)                                 | 动态 pnpm cache、Boundary 并行 Oracle、Web affected gate、clean-source runner；#202 首轮全绿                                                                                                    |
| 2026-08-04 | [CI Feedback Loop Optimization](./2026-08-04-ci-feedback-loop-optimization.md)                           | Required checks 约 8:20；Web E2E 完整 74 tests；Boundary 0:48                                                                                                                                   |
| 2026-08-03 | [Desktop Cloud Connection Boundary Refactor](./2026-08-03-desktop-cloud-connection-boundary-refactor.md) | Profile Access、Cloud Connection Dialog 与可选 PIN 解耦；全仓 prod-like validation 通过                                                                                                         |
| 2026-08-03 | [Desktop GitHub Device Authorization](./2026-08-03-desktop-github-device-authorization.md)               | Device flow 全链路完成；Desktop E2E 2/2、prod-like validation 与安全并发协议通过                                                                                                                |

### 未注日期（早期文件，无日期前缀）

| 计划                                                                                                |
| --------------------------------------------------------------------------------------------------- |
| [CHECKPOINT-domain-test-system](./CHECKPOINT-domain-test-system.md)                                 |
| [INDEX-domain-test-documentation](./INDEX-domain-test-documentation.md)                             |
| [P0-1-clarification-complete-summary](./P0-1-clarification-complete-summary.md)                     |
| [P0-1-文档导航](./P0-1-文档导航.md)                                                                 |
| [baseline-report](./baseline-report.md)                                                             |
| [memoflow-ai-goal-feature-backlog](./memoflow-ai-goal-feature-backlog.md)                           |
| [p0-1-clarification-implementation-plan](./p0-1-clarification-implementation-plan.md)               |
| [route-2-unified-ai-workflow-orchestrator-plan](./route-2-unified-ai-workflow-orchestrator-plan.md) |
| [tdd-ai-whimsical-swan](./tdd-ai-whimsical-swan.md)                                                 |
