---
tags: [analysis, ai, desktop, byoa, acceptance]
description: ADR-120/121 的实现证据、支持矩阵及尚未通过的交付门禁。
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# 本地 BYOA 验收证据

本文件记录可观察证据，不将功能编码、测试通过、合并、发布和生产部署混为一项。
需求真值见[实施方案](../plan/active/2026-10-09-local-byoa-and-builtin-assistant.md)。
当前候选尚未完成全部验收，不可据此宣称 prod 已交付。

## 原生支持矩阵

| 入口        | 协议/版本                         | Linux 原生行为                                                                              | Windows                                             | 边界                                                         |
| ----------- | --------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| 内置 Mastra | 现有 workspace 固定依赖           | 聊天/审批与 Goal、Task、Knowledge 持久恢复测试通过                                          | 安装包验收待执行                                    | 无 CLI 前置；仍需自己的内置模型连接                          |
| Codex       | app-server，CLI 0.160.1           | 真实 Goal 查询两轮、同 native ID 恢复通过；模型 gpt-6-astra                                 | npm shim/空格 argv fixtures 通过；实机打包待验收    | 账号/config/home 变更校验；不自动跨 Agent 重试               |
| Claude Code | Agent SDK 0.3.295，用户已安装 CLI | 初始化/目录、流/权限/恢复 fixtures 通过；真实完整两轮尚未通过：配置的上游通道 HTTP 429 冷却 | npm/native executable fixtures 通过；实机打包待验收 | SDK 使用用户 CLI，不打包可选 CLI；恢复前先无 prompt 校验身份 |
| Pi          | 原生 RPC，CLI 1.0.3               | 真实 Goal 查询两轮、同 session 恢复通过；模型 auto/gpt-6-astra                              | npm shim/空格 argv fixtures 通过；实机打包待验收    | 会话扩展临时注入，退出删除，不改全局 extensions              |

macOS、WSL 跨宿主和任意第三方 wrapper 的私有凭据文件未取得支持证据。身份检查覆盖已知 native home/config/auth 文件与相关宿主环境；不声称能发现外部 wrapper/key helper 内任意来源的账号变化。带稳定账号 ID 的 OAuth 刷新不应无故失效；没有稳定 ID 的 Pi OAuth 保守失效。

## 可复现行为入口

下列路径均相对仓库根目录。使用对应 `pnpm nx run <project>:test --args=<path>`，测试输入来自临时 Profile/SQLite 或协议 fixtures，不修改用户原生配置。

| 证据                                | 测试入口 / 结果                                                                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 内置和本地初始化隔离                | `apps/desktop/src/main/runtime/compose-ai.spec.ts`；`packages/ai/src/server/infrastructure/__tests__/ai-module-partial-start.spec.ts`、`ai-module-mastra-lifecycle.spec.ts`                        |
| 内置 durable 恢复及审批             | `packages/ai/src/server/mastra/runtime/mastra-workflow.runtime.spec.ts`；`workflows/goal-create.workflow.spec.ts`、`task-create.workflow.spec.ts`；AI 全套通过                                     |
| 原生协议、帧/进程上限、原生请求过期 | `packages/ai/src/server/local-agent/*.spec.ts`；聚焦三文件 15 项通过；未知请求拒绝、进程失败及过期回答均有 fixture                                                                                 |
| 单 turn、取消、模型快照和历史       | `local-agent-runtime.spec.ts`：7 项通过；部分文本取消 red→green；同 native ID 切模型及逐轮模型快照 red→green                                                                                       |
| 初次发送等待中 Stop/New/切换        | `packages/app-vue/src/modules/ai/composables/useAIChatSession.spec.ts`：deferred create red→green；取消前建立控制器，晚到创建不覆盖选择、不发送                                                    |
| localOnly、归属、删除后晚到         | `packages/ai/src/server/infrastructure/adapters/powersync/local-agent.repository.spec.ts`                                                                                                          |
| Profile 导出/复制边界               | `apps/desktop/src/main/modules/ai/local-agent-portability.spec.ts`：真实 PowerSync schema + V3 export 排除本地绑定；guest 源保留阻断通过                                                           |
| MCP 身份、撤销与真实 owner drain    | `packages/ai/src/server/local-agent/local-tool-bridge.spec.ts`；不仅等 HTTP 断开，还等待 owner 调用结束；故障 red→green                                                                            |
| Goal owner 写事务                   | `packages/goal/src/server/infrastructure/adapters/powersync/goal-agent-mutations.spec.ts`：幂等重放/并发、异输入冲突、CAS、事务回滚及重开 receipt                                                  |
| Task owner 写事务和 KR              | `packages/task/src/server/infrastructure/adapters/powersync/task-agent-mutations.spec.ts`：Prompt 显式选择、Fixed 贡献一次；outbox/receipt 注入失败均回滚                                          |
| 业务授权发现与撤销                  | `apps/desktop/src/main/modules/ai/local-agent-writes.spec.ts`：默认不发布写工具，授权后执行，撤销后拒绝重放                                                                                        |
| Knowledge 查询和审核保存            | `apps/desktop/src/main/modules/ai/local-agent-knowledge.spec.ts`；`packages/app-vue/src/modules/repository/composables/localAgentNoteReview.spec.ts`；Vault binding 切换、非法路径和原确认内容重试 |
| 来源/引用/模型 UI                   | `useAIChatView.lifecycle.spec.ts`、`AIMessageContent.spec.ts`；同连接换模型保留草稿及历史，Goal/Task 引用通过语义链接导航                                                                          |

真实 CLI 验收为显式 opt-in：`MEMOFLOW_REAL_CODEX=1` / `MEMOFLOW_REAL_CLAUDE=1` / `MEMOFLOW_REAL_PI=1`，运行 Desktop `src/main/modules/ai/local-agent-tools.spec.ts`。只使用已有登录及原生模型目录，不自动安装、登录或改变凭据；失败不更换运行时补做。

## 工程审查与交付门禁

以 `68398e60fc4...24cb9b4c31f` 做两路只读审查。Standards 两项：首次发送取消窗口、合法 Codex failed turn 被误映射协议错误。Spec 三项：首次发送取消窗口、Claude 身份校验晚于 SDK resume、缺少 run/model 展示快照。对应修复已加入行为测试；后续候选需再次绑定最终 SHA 验证。

- Goal/Task/Gateway 全套、AI/contracts/Repository/app-vue 串行全套通过。串行重跑避免并发资源竞争，不修改测试超时掩盖问题。
- 安装依赖 `pnpm install --frozen-lockfile --offline` 通过。
- Linux package 构建命令曾通过，但发现 ASAR 索引与实际内容不一致，实际启动失败。新增入口完整性校验已能拒绝该包；必须串行重打包并跑 packaged smoke 后才计入通过。
- 本地 prod-like helper、Windows lane、最终 exact SHA CI、双 lane release evidence、production-selected watcher rollout 仍待执行。
- 没有推送 BYOA、创建 BYOA PR、合并 release PR 或发布生产。
