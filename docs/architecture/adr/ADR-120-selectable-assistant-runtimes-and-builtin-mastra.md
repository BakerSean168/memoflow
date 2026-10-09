---
tags: [adr, ai, byoa, mastra, desktop, state-ownership]
description: Desktop 可选择本地 Agent 或保留的 Mastra 内置助手，每个会话只有一个执行状态所有者。
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# ADR-120: Selectable Assistant Runtimes and Built-in Mastra

**状态：** 已采纳（2026-10-09 用户批准完整实施、PR 合并与生产发布；实施中）  
**日期：** 2026-10-09  
**拟修订：** ADR-050 的全产品 Mastra-only 限定、ADR-096 的所有会话均从 Mastra 恢复限定。两者的单一状态所有权原则继续保留。  
**关联：** ADR-051、ADR-097、ADR-099、ADR-112、ADR-116～118、ADR-121。

## 背景

用户希望在 MemoFlow 自身界面中选择本机 Codex、Claude Code、Pi 等成熟 Agent，借鉴 T3 的接入和模型选择方案，减少自行维护通用 Agent 行为的投入。用户同时希望未安装、也不打算安装这些工具的人仍可使用现有内置助手。会话中的“Master”按现有 **Mastra** 技术栈解释，产品界面使用“内置助手”。

[源码调研](../../analysis/2026-10-09-local-byoa-t3-source-study.md) 已确认现有 Vue/IPC 客户端可复用，但 Desktop composition 和 transport 直接依赖 Mastra，模型连接只支持 OpenAI-compatible API；本地 BYOA 不是新增几个模型名称即可完成。

## 决策

### 1. 保留两个长期可选入口

- **内置助手**：继续由 Mastra 执行，保留现有模型服务配置、聊天、受控工具、Goal/Task/Knowledge 工作流与恢复能力。无需外部 CLI、Agent 账号或安装器。
- **本地 Agent**：仅 Desktop 首批提供；使用用户配置的本机 Agent，由它承担模型交互、上下文管理和工具执行循环。MemoFlow 提供界面、会话关联和业务工具。
- Mastra 是正式保留的产品选项，不是待删除兼容路径。维护范围为现有业务能力、可靠性和适配；不追求复制所有外部 Agent 的通用能力。
- 本轮不增加 Web/API 远程运行本机 Agent 的能力。它们继续使用内置助手；共享 UI 按宿主能力显示选项。

“内置”只表示无需安装外部 Agent。模型连接仍须配置且可用；不承诺免费额度、订阅互通或离线推理，也不引入统一代付/转售服务。

### 2. 默认值、切换与失败必须可预测

| 场景                                      | 产品行为                                                            |
| ----------------------------------------- | ------------------------------------------------------------------- |
| 首次打开、未选择执行方式                  | 默认内置助手；缺少模型配置时进入现有模型设置，不强制安装 Agent      |
| 本机检测到 Agent                          | 显示可连接选项；不自动替换用户默认值、不自动登录或执行推理          |
| 用户选择并保存本地 Agent 为默认           | 只影响之后新建的会话；既有会话继续使用原执行方式                    |
| 外部 CLI 缺失、未登录、配额不足或进程失败 | 当前会话明确不可用/失败，保留记录；可由用户选择“用内置助手新建对话” |
| 内置模型失效                              | 显示该连接的错误与修复入口；不隐式启动本地 Agent                    |
| 同一 Agent 内更换模型                     | 无活动 turn 时，按该 Agent 能力变更；参数不支持时明确拒绝           |
| 更换执行方式、Agent 类型或账号实例        | 新建会话；不把原生上下文、待审批请求或未完成写入迁移到另一运行时    |

禁止失败后自动跨运行时重跑。手动转到新会话不自动复制整段私有历史；需要携带内容时由用户显式选择文本，不携带原生 checkpoint、工具授权或待执行操作。

### 3. 用产品契约表达选择，模型连接与 Agent 连接分开

目标契约采用可穷尽的联合类型，名称在实现切片中统一落入 `packages/contracts/ai`：

- `builtin`：关联现有 `AIProviderConnection` 和模型。
- `local_agent`：关联当前 Profile 的 `LocalAgentConnection`、模型及 driver 支持的选项。

原生协议对象留在 adapter 内；UI 不接触 Mastra、Codex、Claude SDK 私有类型。现有 `AssistantRuntimeClient` 继续承载消息、历史、取消与响应请求，按真实需要补充 typed permission / user-input 事件。

路由层只解析已保存的会话归属并转交调用，不做第二轮规划、模型重试或通用任务调度。不得恢复 ADR-035 的三引擎框架、Python bridge 或被退休的 AgentHost。

### 4. 每个会话只有一个执行状态所有者

| 事实                                      | 所有者 / 保存位置                                                  |
| ----------------------------------------- | ------------------------------------------------------------------ |
| 内置会话标题、归档和产品 ID               | 现有 MemoFlow Conversation shell                                   |
| 内置消息、memory、workflow snapshot       | 现有 Mastra storage；继续遵守 ADR-096/099                          |
| 本地 Agent 会话标题、执行方式、连接关联   | 当前 Profile 的本地会话记录                                        |
| 原生 session/thread、上下文、压缩与恢复   | 对应 Agent；MemoFlow 只保存可校验的关联标识                        |
| 本地 Agent 在 MemoFlow 中的消息展示记录   | Profile 内的宿主展示记录；不得充当 Agent checkpoint 或再次执行依据 |
| Goal、Task、Knowledge、Routine 等业务事实 | 真实 owner application/domain，与执行方式无关                      |

会话创建时确定 `runtimeKind`，首次发送前校验连接。原生会话标识可在创建原生 thread 后绑定，但不能因标识尚缺就回退到 Mastra。恢复请求必须同时验证 Profile、会话、连接实例和原生标识；缺失/不匹配属于明确失败。

最小本地持久化方案见 ADR-121：本地 Agent 会话不写入现有同步的 `ai_conversations`。列表组合两个来源的展示 DTO，但一个会话只写一个来源。内置消息不再复制进新的本地展示表。

### 5. 业务能力同源，工作流执行方式明确

两个运行时复用同一业务 schema、owner application port 和已确定的授权规则；各自的工具集合和交互形式可以不同。AI 结果仍是待验证输入，不能直接操作业务数据库。

保留现有 Mastra 工作流及专用 UI。用户从本地 Agent 会话发起普通 Goal/Task/Knowledge 操作时走确定性工具/业务编辑面，不在后台再次调用 Mastra 规划。首版如需现有高级工作流，显式打开“内置助手”工作流入口，说明使用内置模型连接，单独创建关联；不把它伪装成当前原生 turn 的继续。

未来通过 MCP 提供 assisted workflow 时，按 ADR-118 做显式 start/get/resume/cancel 与费用来源展示；不作为首版本地聊天的前置条件。

用量按本次实际执行来源显示。原生 Agent 未返回费用时显示未知/未提供，不能记作 0，也不能把订阅额度折算为内置 API 费用或重复计入两份记录。

## 取舍

- **仅保留 BYOA**：维护面更小，但要求所有用户安装外部工具，不满足本次需求。
- **全部继续走 Mastra**：现有实现最直接，但无法使用用户已经选择的成熟 Agent 能力。
- **显式两种执行方式**：保留可用性与选择权，接受两套 adapter 的维护成本；通过单会话归属和同源业务操作限制复杂度。
- **自动运行时 fallback**：容易改变成本、权限与上下文，并重复已经提交的写入，因此不采用。

## 与既有决策和交付的关系

本提议不改写已经验收的历史。采纳并实施时，将 ADR-050/096 的“Mastra 唯一运行时”收窄为“内置会话由 Mastra 唯一执行”，保留退休路径禁令；ADR-097 的内置 Provider/secret 规则和 ADR-099 的 workflow 真值继续有效。

用户已批准实施。实现同步更新 `AI_MASTRA_RUNTIME_AUTHORITY` 的适用范围并新增会话路由约束，不能为通过检查删除旧架构保护。

落地顺序、行为验收和完成状态统一记录在[实施方案](../../plan/active/2026-10-09-local-byoa-and-builtin-assistant.md)。本 ADR 没有承诺现有云端会话跨设备完整消息恢复、原生会话迁移或旧版本数据迁移等新增能力。
