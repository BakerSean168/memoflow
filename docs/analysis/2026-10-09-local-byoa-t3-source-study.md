---
tags: [analysis, desktop, ai, byoa]
description: 基于固定 T3 Code 提交调研 MemoFlow 本地 Agent 接入的源码复用、裁减边界与最小运行契约。
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# MemoFlow 本地 BYOA：T3 Code 源码复用研究

日期：2026-10-09。性质：源码调研与设计建议，不是已批准的实施规格。

后续目标已在 [ADR-120](../architecture/adr/ADR-120-selectable-assistant-runtimes-and-builtin-mastra.md)、[ADR-121](../architecture/adr/ADR-121-desktop-local-agent-host-and-tool-bridge.md) 与[实施方案](../plan/active/2026-10-09-local-byoa-and-builtin-assistant.md)具体化：用户要求保留现有 Mastra 作为无需外部 Agent 的内置选项。本文的源码事实继续有效；涉及替换/退休内置功能的早期建议以这组新提议为准，功能仍未实施。

研究范围：保留 MemoFlow 自身界面，在本机启动用户选择的 Agent，提供模型选择、会话、工具执行及审批体验。
“本地”指宿主与 Agent 进程运行于本机；模型可以调用云端。它不自动意味着只支持一个账号。

## 结论

**可以沿用 T3 已实现的接入路线，再把宿主与 UI 翻译到 MemoFlow；不需要重新开发通用 Agent 推理循环。**
本地限定可以删除远程环境路由和开发工作台；最大的进一步简化来自首版复用已安装、已登录的 CLI。
但“已有登录”“每种 Agent 暂限一个实例”“先支持 Codex”只是建议裁剪，不是用户已经确认的要求。
如果保留多个本地账号和应用内登录，仍然可以复用 T3 思路，只需保留相应实例、凭据与登录生命周期。

应复制的是协议处理、配置与能力模型、事件处理经验和契约测试；不应为了复用而搬入 T3 整个 orchestration-v2。
当前 T3 的 Codex、Claude 适配器仍与服务端编排模型相连；Pi 的包边界更独立，但也不是无依赖 SDK。

## 证据范围与可信度

- 上游：`https://github.com/pingdotgg/t3code`，固定提交 `ec80933ac8cd02fec5c97b342462ccc9567cdb1e`。
- 提交时间：2026-10-09T17:26:05+05:30；本地浅克隆位于 `/tmp/memoflow-t3-byoa-20261009`。
- 以下“源码事实”来自该提交；“建议/推断”是对 MemoFlow 场景的取舍，不能当作已验证的集成结果。
- 本次未启动真实 Agent、登录账号、发送模型请求、安装上游依赖或运行上游测试；读取测试仅证明覆盖意图。
- 所有上游链接固定提交，避免把后续上游变化当成本次已验证事实。

## 1. 当前真实接入链路

T3 的注册表读取实例配置，用 driver 创建实例；实例暴露状态快照、会话适配器、可选认证能力。
实例配置变更会关闭旧资源作用域并重建；它不只是一个模型名称列表。[S1] [S2]

| Agent       | 真实入口与协议                                                                                                                | 可借鉴的最小链路                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Codex       | `apps/server/src/provider/Drivers/CodexDriver.ts` → `orchestration-v2/Adapters/CodexAdapterV2.ts` → `effect-codex-app-server` | 启动 `codex app-server`、初始化、建/续会话、发送 turn、接收通知、回应请求、取消 |
| Claude Code | `Drivers/ClaudeDriver.ts` → `Adapters/ClaudeAdapterV2.ts` → `@anthropic-ai/claude-agent-sdk`                                  | `query()`、异步消息流、`resume`、`canUseTool`、`interrupt()`、`close()`         |
| Pi          | `packages/provider-pi/src/server/driver.ts` → `adapter.ts` → `rpc.ts`                                                         | `pi --mode rpc` 的 JSONL 请求与事件；读取本机 Pi 配置和会话                     |
| 通用 ACP    | `packages/provider-acp-registry` → `packages/provider-acp` → `effect-acp`                                                     | 协商初始化/认证/能力，调用 session 操作；按 agent 实际支持情况处理模型与恢复    |

来源：[S3] [S4] [S5] [S6] [S22]。Codex、Claude **没有**独立的 `packages/provider-codex` / `provider-claude` 包。
T3 此版本还注册了 Cursor、Grok、OpenCode、Antigravity、Muse；首版无需同时接入这些 driver。[S3]
统一的是 MemoFlow 面向界面的契约；下面仍是几套不同协议，ACP 不能自动替代所有原生能力。

## 2. 设置、账号、模型：可以照着做，但要区分三件事

**源码事实：**实例保存 driver、显示名、环境变量、enabled、driver 专属 config；模型选择保存 `instanceId + model + options`。[S1] [S7]
因此多个本地账号也能复用同一套结构，无需引入远程环境系统。
实例的 `environment` 字段在此指子进程环境变量，不应与 T3 的远程 EnvironmentId 混为一谈。

**源码事实：**Codex 支持 `managed` / `existing`、binaryPath、homePath、shadowHomePath、launchArgs、customModels。
Claude 支持 binaryPath、homePath、customModels、launchArgs 等。[S8]
`shadowHomePath` 负责账号隔离并共享部分 Codex 状态；它是多账号增强功能，不能仅改显示名替代。

**源码事实：**T3 并不保证所有 driver 都有应用内登录。
认证 UI 明确处理“无 in-app sign-in，按 provider 文档完成设置”；Pi 无可用模型时提示使用原生 `/login` 或配置 API key。[S9] [S27]
Codex managed 分支引入安装、T3 凭据存储与专门认证控制器；existing 分支复用本地配置。[S4] [S11]
完整复制 T3 的账号管理，与“读取已登录 CLI”不是同一个工作量。

**源码事实：模型目录因 Agent 而异。**

- Codex existing 路径启动短期 app-server，调用 `account/read` 与分页 `model/list`，读取推理选项、能力，再追加 customModels。[S12]
- Claude 状态探测用 SDK 初始化数据和 `claude auth status`；目录还依赖 T3 的 bundled/更新 model manifest 与兼容性配置，不能宣称全来自原生实时目录。[S13] [S28]
- Pi 用临时 `--no-session` RPC 读取 `get_state`、`get_available_models`、`get_commands`，能看到用户配置的 provider/model。[S10]
- `CustomModelEntry` 是 slug、名称、能力描述，不是通用的 baseURL/API key 代理；底层 Agent 本身必须认识该模型和连接配置。[S14]

**建议：**设置页先保留“检测 CLI → 显示登录状态 → 刷新模型 → 选择模型与能力参数”。
需要的应用内登录入口按 driver 能力展示；不支持时给明确的原生设置入口，不能显示一个不会生效的统一登录按钮。
多账号若纳入首版，保留 instanceId 和配置目录隔离；没有必要同时复制凭据跨设备传输、托管安装和共享账号切换协调。

## 3. 最小 Codex 翻译范围

这一条链可以直接按上游协议组织；不需要保留 Git 项目或工作树概念。

1. 用明确 argv 启动 `codex app-server`，继承所选实例环境与配置目录；完成 `initialize` 握手。[S12]
2. 用 `account/read`、`model/list` 提供设置和选择器；能力按返回值展示，不给全部模型硬塞相同推理选项。[S12]
3. `thread/start` 返回原生 thread id，存入 MemoFlow 会话绑定；后续 `thread/resume` 使用该 id。[S15]
4. `turn/start` 发送消息、模型及运行策略；按线程/turn/item 标识消费增量、工具状态与结束通知。[S31]
5. command/file/permissions approval、tool user input、MCP elicitation 是不同的 server request；保存 request id 并回传相应响应。[S16]
6. `turn/interrupt` 请求停止；进程关闭时终结 pending 请求、撤销当前会话工具凭据，再收敛 UI 状态。[S17] [S32]

上游低层客户端已经区分 request、notification、respond、respondError，并关联 pending 请求。
这部分是非常具体的移植参照；用 Node Promise/AsyncIterable 翻译时保留语义，不必照搬 Effect Service/Layer。[S17]
原生恢复能恢复 Agent 上下文；MemoFlow 仍需保存自己的消息展示与运行状态，二者不能互相替代。
恢复失败应提示重新开始或明确创建新会话，不能把空会话伪装成原会话恢复成功。

## 4. MCP 不是改一次用户全局配置

**源码事实：**T3 创建带 thread / providerSession / instance 身份的工具连接配置，包含 endpoint 与 Authorization。[S18]

- Codex：在 `thread/start`、`thread/resume` 的 config 覆盖里注入 `mcp_servers`，无需写用户全局 `config.toml`。[S19]
- Claude：通过 SDK query options 注入 `mcpServers`，同时处理工具权限和输入回调。[S20]
- Pi：生成本机 extension，通过 `--extension` 加载，并以进程环境传入当前会话 MCP URL/token；不是原生通用 MCP 参数。[S21]
- ACP：向 session 传递 MCP servers，T3 还实现 stdio bridge / MCP-over-ACP 及个别 harness 丢弃工具时的 fallback。[S22]

**建议：**MemoFlow 本地 MCP 服务直接绑定当前 profile 的业务 owner ports，提供目标、任务、知识工具。
只替换工具集与会话授权来源，不复制 T3 的 worktree、PR、浏览器、设备、scheduler 工具与相应提示词。
本机身份和 profile 绑定仍须校验；“只监听本机”不能代替“当前 Agent 只能操作当前 MemoFlow profile”。
Pi 若在首版范围，MCP extension 是必要接入工作；不能把它算作与 Codex 完全相同的几行配置。

## 5. 哪些直接复用，哪些翻译，哪些删除

| 范围                                                                               | 建议方式                                                                       | 理由                                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 请求/通知分流、退出收敛、argv 解析、模型选项映射、事件测试用例                     | 按需 vendor 小模块，或逐项翻译并保留来源                                       | 行为边界明确，已有测试能描述边缘情况                         |
| `effect-codex-app-server`                                                          | 允许局部 vendor，但会带 Effect 与生成协议 schema；也可只实现首版实际使用的方法 | 它仅运行时依赖 Effect，比整个 T3 服务端更独立                |
| `ProviderClientDefinition` 的配置/图标/能力数据                                    | 保留数据设计，适配现有校验库                                                   | 该层没有 React 导入，但使用 Effect Schema                    |
| driver/instance/会话命令与事件契约                                                 | 用现有 TS/Node 风格实现小型宿主                                                | 原版接口直接引用 T3 orchestration 记录和 Effect Stream/Scope |
| React 设置页、model picker、聊天组件                                               | 以行为为参照翻译成 Vue                                                         | 原版依赖 React、T3 client-runtime 与 environment queries     |
| 远程机器、跨设备认证回调、账号传输、环境路由                                       | 本地版删除                                                                     | 没有对应部署场景                                             |
| Git/worktree/PR/diff/终端工作台、审查、线程 merge/fork/rollback、后台跨 Agent 编排 | 首版删除或不接入                                                               | 不属于 MemoFlow 聊天与业务操作闭环                           |
| 安装器、自动更新、配额信用兑换、全量 usage 仪表盘、多个其他 provider               | 可推迟                                                                         | CLI 已存在时不影响发送消息与业务工具调用                     |

源码依赖依据：[S2] [S3] [S8] [S23] [S24] [S33]。这些裁剪是产品范围建议，不是未经验证的“删文件后就能编译”保证。
尤其不能直接复制整个 `CodexAdapterV2.ts` 再只改 import：它还包含 native subagent、背景任务、回滚、MCP Apps、usage 与事件投影。

## 6. 用实际规模判断“简单”

以下是固定提交的物理行数，包含注释与空行；它们描述上游边界，不是 MemoFlow 预计新增代码量。

| 文件/范围                                               |      物理行数 | 含义                                    |
| ------------------------------------------------------- | ------------: | --------------------------------------- |
| `provider-core/src/server/driver.ts`                    |           222 | driver/instance 接口本身很小            |
| `provider-core/src/server/ProviderAdapter.ts`           |           652 | T3 完整适配契约已含大量首版不需要的能力 |
| `effect-codex-app-server/src/client.ts` + `protocol.ts` |     275 + 485 | 核心消息客户端边界可研究、可翻译        |
| `CodexAdapterV2.ts` / `ClaudeAdapterV2.ts`              | 7,351 / 8,264 | 不能把完整体验称为几个 API 调用         |
| Pi `rpc.ts` / `adapter.ts`                              |   484 / 3,310 | 简洁原生协议与完整 T3 产品映射的差别    |
| ACP `AcpSessionRuntime.ts`                              |         3,025 | 通用 ACP 也有能力协商与生命周期成本     |

`effect-codex-app-server/src` 非 `.test.` TypeScript 共 60,157 行，其中 `schema.gen.ts` 占 57,042 行。
这些大多是生成协议声明，不能拿总行数夸大必须人工移植的工作；反过来也不能忽略上层真实状态处理。[S23]

**判断：**限定本地、先一套原生 driver、复用现成登录，可以成为边界清楚的集成改造。
同时复刻多 Agent、多账号登录、完整会话树、跨 Agent 恢复与工具审批细节，会重新接近通用客户端规模。

## 7. 本地宿主仍须保留的最小契约与失败处理

建议的职责划分，不是必须新增的包或 framework：

- 配置与快照：实例路径/配置目录、版本、auth 状态、模型与能力、可解释的 unavailable 状态。
- 会话绑定：MemoFlow thread id ↔ driver/instance/native thread id；同时保存当前模型选项与 profile 身份。
- 命令：start/resume、send、respond、cancel、close；能力允许时再提供 model switch 和 compact。
- 事件：文本增量、工具生命周期、permission request、user input、完成/取消/失败；未知通知可忽略并记录，未知请求必须明确答复或拒绝。
- 展示持久化：本地消息/运行状态、稳定 item id、断开后快照同步；不必照搬 T3 全套事件存储与回放体系。
- 资源生命周期：超时的探测、破损 stdout/JSON、子进程退出、待审批取消、关闭时终结 pending、重启后恢复身份。
- 工具授权：会话凭据只授予当前 profile，停止/关闭后失效；业务写入的校验与幂等仍由 MemoFlow owner 负责。

上游测试专门覆盖初始化中断、Stop 与启动竞态、重复末尾文本、恢复、审批取消监听器释放、Pi 非零退出；本地限定不会消除这些问题。[S25] [S29] [S30] [S34] [S35]
可以删除复杂工作台和多线程编排，同时保留这些与最小聊天闭环直接相关的失败语义。

## 8. 尚未验证与许可

- 未验证 MemoFlow Electron 打包后的 CLI 发现、Windows 子进程/路径行为、退出清理与权限 UI；需要第一条真实闭环验证。
- 未验证用户安装的 Agent 版本与此提交使用的协议是否兼容；上游自身已使用 `excludeTurns` 的 raw request 绕过尚未更新的生成 schema。[S15]
- 未验证自定义代理端点在各 Agent 的登录/模型目录里如何表现，不能把添加 custom slug 当作接入新服务成功。
- T3 根许可证为 MIT、版权为 T3 Tools Inc.；复制或大比例改写应保留版权与许可声明。[S26]
- 第三方 SDK/CLI 与其服务使用条件需按实际纳入的依赖处理；本报告只确认 T3 源码许可，不替第三方作许可结论。

## 9. MemoFlow 当前代码映射（本地 Desktop）

本地基线为 `a33d7b265260dd60455dc133e1e47b4c80069658`。工作区已有另一项 Desktop Profile 设计的未提交文档，本次未修改。下表为静态源码阅读结论，不是运行验收。本会话未提供 CodeGraph / nx-mcp，使用定向源码检索与 Nx CLI；没有生成第二套代码索引。

| 接入点                                                                                                                                                                                | 当前事实                                                                                                                                            | 本地 BYOA 改造建议                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Desktop composeAI](../../apps/desktop/src/main/runtime/compose-ai.ts)                                                                                                                | 80–148 行组装 PowerSync repositories、MastraAIRuntime 和业务 ports                                                                                  | 在 Desktop 组合根接入选定 Agent 的宿主；Agent 直接承担执行循环，不再套一层 Mastra 通用助手来调它         |
| [AssistantRuntimeClient](../../packages/ai/src/client/runtime-assistant.ts)                                                                                                           | 38 行起已有 history、stream、cancel、approval 接口及 IPC 实现                                                                                       | 沿用客户端接缝与 IPC，按原生事件补充能力；不照搬 T3 WebSocket/多环境连接层                               |
| [Electron AI transport](../../packages/ai/src/electron/index.ts)                                                                                                                      | 326 行起直接调用 mastraRuntime；825 行起 teardown 会移除 handlers、abort streams、dispose                                                           | 需要改宿主依赖，不是只更换模型配置；保留每个 profile 的注册、取消和销毁闭环                              |
| [模型选择](../../packages/app-vue/src/modules/ai/composables/useAIModelSelection.ts)                                                                                                  | 已有 provider 分组、模型选择与会话偏好                                                                                                              | 可沿用交互；数据改为 Agent 原生目录与支持的选项。切换模型能力按 provider 实际支持判断                    |
| [AI Settings](../../packages/app-vue/src/modules/setting/components/AISettings.vue) / [Provider DTO](../../packages/contracts/src/modules/ai/aggregates/ai-provider-config-server.ts) | 现有连接是 baseUrl + credentialRef；[provider type](../../packages/contracts/src/modules/ai/value-objects/ai-provider-type.ts) 仅 openai_compatible | 新入口表达 Agent 类型、可执行文件/原生配置与连接状态；不能把 Codex 当成只需 baseUrl 的 LLM provider      |
| [事件契约](../../packages/contracts/src/modules/ai/api/assistant-events.dto.ts) / [命令契约](../../packages/contracts/src/modules/ai/api/assistant-runtime.dto.ts)                    | toolName 是 15 个产品工具的闭集；审批仅 approve/decline                                                                                             | 补原生工具活动、权限请求、结构化提问与必要的推理选项。原生工具展示不等于扩大 MemoFlow 业务工具执行白名单 |
| [聊天组合](../../packages/app-vue/src/modules/ai/composables/useAIChatView.ts)                                                                                                        | 同时组合通用聊天及 Goal/Task/Knowledge workflows                                                                                                    | 普通会话可先接 BYOA；旧工作流须按业务逐项决定替换/保留，不能只删 Mastra 依赖就宣称全部完成               |
| [本地 Task mutation](../../apps/desktop/src/main/modules/ai/task-plan-mutation.adapter.ts)                                                                                            | 已能通过 TaskApplicationPort 创建 TaskPlan；不直接写数据库                                                                                          | 复用真实 owner 操作；向 Agent 暴露的写入仍须验证、授权并有明确重试语义                                   |
| [现有 Gateway](../../packages/agent-gateway/src/server/read-gateway.ts) / [ports](../../packages/agent-gateway/src/ports.ts)                                                          | Hosted MCP 当前为 Goal/Task 只读，认证/配额契约面向 PAT/OAuth                                                                                       | 复用工具 schema 与 owner 语义；本地 bridge 不依赖 Hosted OAuth、Redis 或 API 服务上线                    |

[DesktopProfileAccessContext](../../apps/desktop/src/main/profile/profile-access-context.ts) 已按本地 owner 提供 ExecutionContext，无需云登录；[main.ts](../../apps/desktop/src/main/main.ts) 577–595 行已将 AI 绑定当前 profile 并提供本地 storage。新 Agent 的会话映射、活动请求和工具通道应跟随该 profile 生命周期；[profile teardown](../../apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts) 408 行起提供既有销毁顺序。不能把“只有一台电脑”解释为可以删除既有 profile 隔离。

## 10. 建议的最小本地产品范围

用户已确定：在 MemoFlow 内聊天，复刻 T3 式 Agent/模型接入，只需本地环境。“每个 Agent 单个配置、已有登录、先一个操作系统”是进一步降低成本的建议，不是用户已确认放弃多账号、内嵌登录或跨平台。

建议首个闭环：

1. MemoFlow 设置展示 Agent 类型、可执行文件位置、可用状态及原生登录提示；从用户明确的连接/刷新动作读取模型目录，不定期发真实推理探活。
2. 沿用现有聊天与模型选择界面。先用 Codex 验证完整链路，再按实际需求接 Claude/Pi；使用同一 Agent 的原生模型能力，不假设所有 Agent 都支持任意模型和任意参数。
3. Desktop 宿主管理原生进程/SDK 会话，完成发送、流式事件、审批/追问回复、取消、错误和恢复。需要进程隔离时利用 Electron/Node 现有机制，不另建常驻 daemon 或云服务。
4. 在本地宿主注册最小 MCP 工具集，调用现有 Goal/Task owner ports。采用会话注入的 loopback endpoint 和短期凭据时，凭据绑定当前 profile/运行范围，并在关闭时失效；不写用户全局 MCP 配置。
5. 会话保存 provider 原生 session/thread 标识及必要的本地展示记录。执行上下文以 provider 为准，业务事实以 MemoFlow owner 为准；不持久化每个 token，也不搬 T3 全套 event log/outbox。provider 不支持历史读取时，明确区分本地显示记录与原生恢复句柄。
6. 最先验收“读取目标与任务 → 生成可编辑提案 → 通过业务接口保存 → 页面看到结果”。读与写分阶段验证；现有六个只读 Gateway 工具不等于已具备创建、编辑、完成任务的外部调用闭环。

可以不移植：远程环境与配对、跨设备连接恢复、多用户服务端认证、Git/worktree/checkpoint/PR、内置终端工作台、网页预览、调度/委派系统、自动安装/更新与托管多账号（后两项以接受原生本机配置为条件）。裁掉的是 T3 的宿主功能，不是禁用 provider 自身已有的推理/工具能力。

仍须保留：原生登录失败反馈、版本/协议不兼容反馈、进程退出与超时收尾、审批与用户问题、取消、原生会话恢复、受控业务工具调用，以及应用退出/profile 切换清理。程序关闭后不承诺 Agent 继续工作；重启可恢复对话也不等于自动重放未完成的业务写入。

“仅本地”不表示离线模型，也不自动解决 Windows GUI 进程 PATH、CLI shim、WSL 与宿主路径不同的问题。首个验收必须在实际目标操作系统上完成；是否额外支持 WSL Agent 需要确定。

## 11. 移植方式与规模判断

建议采用 **按协议裁剪移植**：对照固定 SHA 的 T3 实现和测试，复用协议对象与独立解析逻辑，把依赖 Effect/T3 服务图的流程按 MemoFlow 现有 async/IPC 风格实现。新增代码保留来源和 MIT 声明，并记录支持的原生 Agent 版本。具体第三方 SDK/依赖仍按其自身许可和使用条件接入，T3 的许可不替它们授权。

不建议先引入所有 private workspace packages，再逐个删除不用的服务；也不建议搭插件市场、动态 driver registry、通用调度或多环境 runtime。首次直接接一种 Agent；第二种真实协议验证后再抽取确实重复的部分。

复杂度分开判断：

- 仅“本机已登录 Agent + 模型目录 + 文本聊天”：边界有限，主要是接入适配。
- 加审批/追问、取消、重启恢复与 profile 生命周期：仍可控，但不能省掉协议状态处理。
- 完成 MemoFlow 数据读写和旧 AI 功能替换：涉及现有业务工具及 UI 契约，工作量可能比基础聊天连接更大。
- 全量复刻内嵌登录、多账号、多平台和 T3 工作台：已超出上述最小范围。

因此，“比完整移植 T3 简单很多”有源码支撑；“只需改名或翻译几个文件，全部现有 AI 功能就可替换”没有证据。本文不根据上游代码行数推断工时。

## 12. 后续实现验收与本轮验证

建议实现时以原生消息 fixtures/假子进程验证：分片与畸形消息、CLI 缺失/退出、登录失败、未知事件、模型选择、审批关联、取消后迟到事件、原生会话恢复。再做真实 Desktop 小闭环，验证工具调用确实访问当前 profile，并且重试不会重复写入。只支持一种 Agent 时不需要提前建立通用测试框架。

本轮仅做源码、契约和上游测试阅读；未安装或登录 Agent，未发送模型推理，未修改用户配置，未做原生协议互通或打包验收。`pnpm nx run memoflow:governance-check` 通过（7 个 target，4 个命中缓存）；本文 16 个本地源码链接均能解析。本文是研究建议，不覆盖现有 ADR，也不代表实现已开始。

## 固定提交来源

[S1]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/contracts/src/providerInstance.ts#L112-L132
[S2]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/provider/ProviderInstanceRegistry.ts#L1-L47
[S3]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/provider/builtInDrivers.ts#L22-L68
[S4]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/provider/Drivers/CodexDriver.ts#L1-L150
[S5]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts#L630-L730
[S6]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/provider-pi/src/server/rpc.ts#L1-L90
[S7]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/contracts/src/modelSelection.ts#L9-L20
[S8]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/contracts/src/settings.ts#L590-L708
[S9]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/web/src/components/settings/ProviderAuthenticationSection.tsx#L61-L101
[S10]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/provider-pi/src/server/status.ts#L128-L179
[S11]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/provider/Drivers/CodexManagedProvider.ts#L212-L282
[S12]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/provider/CodexProvider.ts#L329-L478
[S13]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/provider/ClaudeModelCatalog.ts#L43-L119
[S14]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/contracts/src/model.ts#L125-L144
[S15]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts#L6450-L6497
[S16]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts#L5042-L5498
[S17]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/effect-codex-app-server/src/protocol.ts#L162-L276
[S18]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/provider-core/src/server/mcpSession.ts#L1-L60
[S19]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts#L1312-L1348
[S20]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts#L7342-L7369
[S21]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/provider-pi/src/server/mcpInjection.ts#L237-L312
[S22]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/provider-acp/src/server/adapter.ts#L689-L724
[S23]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/effect-codex-app-server/package.json#L1-L46
[S24]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/provider-core/src/client.ts#L1-L68
[S25]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.test.ts#L1852-L1930
[S26]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/LICENSE#L1-L21
[S27]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/provider-pi/src/server/status.ts#L441-L457
[S28]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/provider/ClaudeProvider.ts#L356-L405
[S29]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.test.ts#L1069-L1110
[S30]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/provider-pi/src/server/adapter.test.ts#L3552-L3635
[S31]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts#L6170-L6220
[S32]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts#L6900-L6950
[S33]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/packages/provider-core/package.json#L171-L184
[S34]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.test.ts#L2236-L2300
[S35]: https://github.com/pingdotgg/t3code/blob/ec80933ac8cd02fec5c97b342462ccc9567cdb1e/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.test.ts#L3721-L3764
