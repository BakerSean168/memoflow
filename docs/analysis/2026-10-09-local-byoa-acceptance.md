---
tags: [analysis, ai, desktop, byoa, acceptance]
description: ADR-120/121 的实现证据、支持矩阵及尚未通过的交付门禁。
created: 2026-10-09T00:00:00Z
updated: 2026-10-10T00:00:00Z
---

# 本地 BYOA 验收证据

本文件记录可观察证据，不将功能编码、测试通过、合并、发布和生产部署混为一项。
需求真值见[实施方案](../plan/active/2026-10-09-local-byoa-and-builtin-assistant.md)。
当前候选尚未完成全部验收，不可据此宣称 prod 已交付。

## 原生支持矩阵

| 入口        | 协议/版本                         | Linux 原生行为                                                                                | Windows                                               | 边界                                                         |
| ----------- | --------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| 内置 Mastra | 现有 workspace 固定依赖           | 聊天/审批与 Goal、Task、Knowledge 持久恢复测试通过                                            | Linux 安装包内置模型入口通过；Windows 待通过          | 无 CLI 前置；仍需自己的内置模型连接                          |
| Codex       | app-server，CLI 0.160.1           | 真实 Goal 查询两轮、同 native ID 恢复通过；模型 gpt-6-astra                                   | npm shim/空格 argv fixtures 通过；Windows 包待通过    | 账号/config/home 变更校验；不自动跨 Agent 重试               |
| Claude Code | Agent SDK 0.3.295，用户已安装 CLI | SDK fixtures 通过；Ollama Cloud gpt-oss:20b 真实 MCP Goal 查询两轮、同 native ID 恢复通过；此前 4Router 第二轮超时记录保留 | npm/native executable fixtures 通过；Windows 包待通过 | SDK 使用用户 CLI，不打包可选 CLI；恢复前先无 prompt 校验身份 |
| Pi          | 原生 RPC，CLI 1.0.3               | 真实 Goal 查询两轮、同 session 恢复通过；模型 auto/gpt-6-astra                                | npm shim/空格 argv fixtures 通过；Windows 包待通过    | 会话扩展临时注入，退出删除，不改全局 extensions              |

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

以 `68398e60fc4...24cb9b4c31f` 做两路只读审查。Standards 两项：首次发送取消窗口、合法 Codex failed turn 被误映射协议错误。Spec 三项：首次发送取消窗口、Claude 身份校验晚于 SDK resume、缺少 run/model 展示快照。对应修复已加入行为测试；两路审查已对 `70646c6030b3ee6e1e5b35f9689fbdf009dada7b` 复核，原问题全部关闭，无新增具体阻断项。平台验收和最终 CI 仍需绑定后续候选。

- Goal/Task/Gateway 全套、AI/contracts/Repository/app-vue 串行全套通过。串行重跑避免并发资源竞争，不修改测试超时掩盖问题。
- 安装依赖 `pnpm install --frozen-lockfile --offline` 通过。
- Linux package 在冻结文件后重建通过，ASAR 入口完整性与依赖校验通过；真实 Electron 已启动并展示 AI 设置。三 driver 缺 CLI 测试发现 Pi 将明确错误替换成通用文案，已增加真实缺文件 red→green 测试并修复，AI 全套 lint/typecheck/test 通过；`25159e214617738a6fd9318b3e8b268a2f7c40bd` 的 packaged Electron 三 driver 缺 CLI、连接跨完整进程重启保留和删除全部通过。Linux 本机 keyring 改变临时 HOME 时，Nx daemon 任务记录曾发生 FK 错误；使用 `NX_DAEMON=false` 按 CI 模式复跑，测试和命令均成功。
- 完整 helper 已对 `70646c6030b3ee6e1e5b35f9689fbdf009dada7b` 执行：affected lint 通过；36 个项目的 test 仅 `ci-cd-platform:test` 失败；37 个项目的 typecheck 仅 `test-utils:typecheck` 失败。前者由 JSON5 无关格式化触发，已恢复原配置格式；后者改用现有编译目标支持的全局替换。两项聚焦复验已通过。随后 `e19c3f3958035247ed444758de2b4b47d094e5d5` 的完整 helper 再次执行，affected lint/typecheck/test 与 Docker 全部通过，无阻断或警告。
- 本地 prod-like API/Web 镜像 revision、宿主端口与监听 owner 均匹配上述 SHA；API/Web/PowerSync 均 healthy，不使用旧容器冒充本次部署。
- Windows 现有 installed-update workflow 增加相同 packaged runtime smoke；三 driver 的缺 CLI 隔离、配置重启保留/删除都纳入安装包验收。`25159e214617738a6fd9318b3e8b268a2f7c40bd` 的 CI run `37998253107` 全部通过。平台 run `37998353514` 的 Linux AppImage N→N+1 通过；Windows 实际启动在 1024px 响应式断点，原有 smoke 写死 4px 导致失败，已改为根据 viewport 验证已存在的 3px/4px 设计值。Windows 新候选、双 lane release evidence 和 production-selected watcher rollout 仍待完成。
- Claude 原生默认 `anyrouter/claude-opus-5-5` 返回 400，通道明确提示模型供应不可用并建议 `gpt-6-astra-cc-format[1m]`。该兼容模型已在 Claude Code 执行器中完成首轮真实 Goal 查询；恢复同一 native session 后再次调用 Goal 工具，但第二轮触及 300 秒上限。原生日志无该轮 API 错误，第二轮工具调用发生在约第 261 秒。随后采用原生支持的进程级低 effort 重试，再次出现 HTTP 429。约 45 分钟冷却后最后一次有限重试仍出现 10 条原生 HTTP 429 记录及明确 cooling down 终态。没有改变用户配置或测试超时，没有将部分成功记为完整两轮通过。
- 2026-10-10 GCP Dev 追加隔离测试：既有 `claude-4router` 命令调用 `claude-opus-5` 单轮成功；该命令自身的 `--resume` 连续 `ALPHA` → `BETA` 成功、native session 不变。同配置下 `ClaudeDriver` / Agent SDK **不连接 MCP**的两轮真实对话也全部完成。但是 Desktop 原验收经现有 4Router 通道执行时，第一轮真实 `goal_search` 完成；第二轮同 native session 再次调用 `goal_search`，MCP tool_result 已写入 Claude 本地 session transcript，之后约 300 秒没有 assistant 终态，最终 `assistant.run.cancelled`。证明 `429` 不是唯一问题；疑点已缩小到 SDK 恢复后 MCP 工具结果至上游继续生成的环节，未确认根因。原有两轮硬门禁维持不变，未调高时限或以无 MCP 的恢复测试替代。
- 同次检查发现 Agent SDK 报 `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`：原 `allowedTools: ['mcp__memoflow__*']` 直接跳过 `canUseTool` 回调。已移除通配预授权，增加 PreToolUse 白名单分类：只读自动允许、写操作逐次用户审批、未知 MemoFlow 工具拒绝；底层 server Scope/事务校验照常保留。新增覆盖只读、写入允许与拒绝、未知工具的单元测试，Claude adapter 5 项通过，`ai:typecheck` 和 `ai:lint` 通过（lint 仅既有其他文件 warning）。待新提交 exact-head CI 和真实原生完整两轮通过后方可合并。
- [PR #439](https://github.com/BakerSean168/memoflow/pull/439) 已创建并关联当前 T3 线程。初始提交 `e19c3f3958035247ed444758de2b4b47d094e5d5` 的 exact-head CI run `37995994699` 已全部通过；初始 Windows/Linux run `37996045674` 因修正已知 smoke 问题而取消，不算通过。后续候选需重新取得精确 SHA 证据。release PR #436 未合并，prod 未变更。

## 26 项要求与当前证据

`delivered` 表示对应行为已有源码与可执行测试证据，不等同于版本已发布；`partial` 项仍阻止宣称全方案交付。平台证据、CI 与上线身份在取得后继续补齐。

| AC  | 机制 / 验证接缝                                                                                           | 当前结果                            |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 01  | compose-ai 初始化隔离、Mastra workflow/chat 回归；安装包内置模型入口另验                                  | delivered                           |
| 02  | 无连接引导与 AI settings；无自动安装或代付                                                                | delivered                           |
| 03  | runtime reference、会话/默认值、view lifecycle 测试                                                       | delivered                           |
| 04  | 原生 probe 分类与局部失败；设置页重试                                                                     | delivered                           |
| 05  | compose-ai / ai-module-partial-start 故障注入                                                             | delivered                           |
| 06  | driver 错误只返回原会话；owner receipt 不自动换 key                                                       | delivered                           |
| 07  | typed request/schema、三 driver 请求响应与过期 fixtures                                                   | delivered                           |
| 08  | startup deferred cancel、单 turn、partial text、晚到事件测试                                              | delivered                           |
| 09  | Codex/Pi 真实同 native ID 恢复；不可恢复状态拒绝；Claude Ollama 两轮见 AC21                                          | delivered（Claude 真实恢复归 AC21） |
| 10  | MCP 撤销、Profile dispose 等待真实 owner drain                                                            | delivered                           |
| 11  | local repository owner/CAS、runtime reference、native fingerprint                                         | delivered                           |
| 12  | Desktop Goal/Task owner + loopback MCP，测试不启动云 API                                                  | delivered                           |
| 13  | local repository 删除后不复活、混合列表按来源路由、原生历史提示                                           | delivered                           |
| 14  | 真实 published schema localOnly、V3 export、guest source blockers                                         | delivered                           |
| 15  | Mastra durable workflow 恢复回归；local 会话不进入 hydration                                              | delivered                           |
| 16  | 本地写 scope 默认关闭、每次事务重新授权、撤销后重放拒绝                                                   | delivered                           |
| 17  | Goal/Task owner 同 key 重放/并发/异输入冲突真实 SQLite                                                    | delivered                           |
| 18  | owner/outbox/receipt 同事务；故障回滚及重开数据库查原回执                                                 | delivered                           |
| 19  | owner expectedVersion、审批输入摘要绑定与失效拒绝                                                         | delivered                           |
| 20  | Task Prompt 显式选择、Fixed 一次贡献及 outbox/receipt 回滚                                                | delivered                           |
| 21  | SDK fixture/身份；Ollama Cloud gpt-oss:20b 真实 MCP Goal 同 session 两轮通过；4Router 超时作为历史记录保留 | delivered（限定 Ollama 路径）       |
| 22  | Pi RPC fixtures + 原生两轮工具查询/恢复、临时 extension 清理                                              | delivered                           |
| 23  | Vault owner 查询/引用；现有编辑审核入口、绑定/路径/幂等测试                                               | delivered                           |
| 24  | run/model 来源快照、未知 token/费用、显式切换新运行时                                                     | delivered                           |
| 25  | Windows shim/argv fixtures；Linux package/完整 smoke 与 AppImage 更新通过；Windows 修正响应式断言后待重跑 | partial：待两平台安装包证据         |
| 26  | 共享 Web/API tests、typecheck 通过；本次镜像 prod-like 健康                                               | delivered                           |

## 2026-10-10: Ollama Free-only verification path (no commercial relay)

- New explicit test launcher: `node scripts/acceptance/ollama-claude-mcp.mjs --check` validates official executable and selected model without making any inference call. It is **not** a functional acceptance.
- Set `OLLAMA_API_KEY` in the invoking process **or**, preferably on a development host, supply `MEMOFLOW_OLLAMA_KEY_FILE=/absolute/path` pointing at a locally created owner-only (`chmod 600`) file containing the key. Never paste a token into GitHub, a shell command, an Agent Fabric remote-exec argument or a test log. Provision credentials locally through an authenticated secret manager/TTY. The AI assistant is not authorized to obtain the key from commercial relay settings.
- Optional: `MEMOFLOW_CLAUDE_BINARY=/absolute/path/to/official/claude`; default `~/.npm-global/bin/claude` must resolve directly into the official `@anthropic-ai/claude-code` package. `MEMOFLOW_OLLAMA_MODEL=gpt-oss:20b` is the low-cost default; explicit reviewed alternatives: `gpt-oss:120b`, `glm-5.3-flash`, `gemma4:31b`. Account Starter access and credits are determined by Ollama, not guaranteed by the allowlist. No fallback to another model or provider.
- Running `node scripts/acceptance/ollama-claude-mcp.mjs` preflights the Ollama public catalog and sends a tiny authenticated Anthropic-compatible request to `https://ollama.com/v1/messages` with an exact model ID, then runs the real two-turn Goal MCP Vitest. Child process environment is an explicit isolated allowlist (`ANTHROPIC_BASE_URL=https://ollama.com`, `ANTHROPIC_AUTH_TOKEN` from the supplied key, `ANTHROPIC_API_KEY` empty, temporary Claude home); the host's AnyRouter/4Router environment is not copied and the GCP `claude` wrapper is not invoked. If Ollama rejects the model or the SDK catalog omits the requested model, fail closed. The script never reuses a commercial channel.
- Claude Agent SDK MCP `Authorization` header is now a child environment variable reference `${MEMOFLOW_MCP_AUTHORIZATION}` rather than a raw token inside serialized `mcpServers`. Hooks still gate MemoFlow write requests and backend scope revocation remains authoritative.
- **2026-10-10 user-executed GCP Dev acceptance, parent HEAD `5a965d96972f3578089245a3c561b1755102efc4`:** User provisioned a mode-0600 Ollama-only key file via local TTY and ran `MEMOFLOW_OLLAMA_KEY_FILE=... node scripts/acceptance/ollama-claude-mcp.mjs`. The user-provided terminal screenshot shows Ollama catalog/API preflight successful, two `assistant.run.started` / `assistant.run.completed` sequences, `mcp__memoflow__goal_search` activity in **both** turns, Vitest **2 passed / 2 skipped / 0 failed** (31.08 s total; real Claude case 20.764 s), and `PASS: exact gpt-oss:20b, two real MemoFlow MCP turns, no commercial fallback.` This upgrades **AC21 to delivered for the tested Ollama gpt-oss:20b Linux path only**. The screenshot is user-supplied evidence; do not characterize this as a new assistant-initiated run. Previous 4Router stalled resume/HTTP 429 remain historical failures, not evidence of general cross-provider stability. No production merge or release is implied. Key material is never recorded in this document or PR.

Official references: https://docs.ollama.com/integrations/claude-code , https://docs.ollama.com/api/anthropic-compatibility and https://ollama.com/pricing . Free accounts have starter usage credits, not unmetered inference; the public model catalog does not prove account entitlement.
