---
tags: [adr, desktop, ai, byoa, mcp, lifecycle]
description: 借鉴 T3 接入原生本机 Agent，通过 Profile 绑定的工具通道复用业务能力，避免引入完整工作台与第二编排引擎。
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# ADR-121: Desktop Local Agent Host and Tool Bridge

**状态：** 已采纳（2026-10-09 用户批准完整实施、PR 合并与生产发布；实施中）  
**日期：** 2026-10-09  
**依赖：** [ADR-120](./ADR-120-selectable-assistant-runtimes-and-builtin-mastra.md)  
**关联：** ADR-004、ADR-006、ADR-045、ADR-049、ADR-058、ADR-105、ADR-116～118；与已实施的 ADR-119 对齐 Profile 生命周期，但不依赖其导入功能。

## 背景与复用基线

T3 上游固定提交为 `ec80933ac8cd02fec5c97b342462ccc9567cdb1e`。其 Codex、Claude、Pi 分别使用 app-server、Agent SDK、RPC，并非同一个通用模型 API。完整适配器还包含 Git、回滚、子 Agent 和后台编排；直接引入全部 private workspace 包会带来不需要的服务图。[源码与固定链接](../../analysis/2026-10-09-local-byoa-t3-source-study.md)

采用按协议裁剪移植：复用独立解析、消息关联、模型能力与测试经验；有 Effect/T3 依赖的逻辑按 MemoFlow 现有 async/IPC 风格实现。复制和改写部分保留 T3 MIT 版权、许可、固定来源及原生版本；第三方 SDK 依赖独立记录。无需重写 Agent 推理循环。

## 决策

### 1. 执行只在本地 Desktop 宿主

Vue 使用受校验的 Electron IPC；Desktop 组合根绑定本地 Agent 会话和当前业务 ports。原生 CLI 为宿主管理的子进程，SDK/桥接资源同样有明确关闭入口；阻塞或原生扩展工作按需隔离，不能在 renderer 直接启动进程。

不复制 T3 的远程环境、设备配对、全套 WebSocket 客户端、Git/worktree/PR、终端/浏览器工作台、后台调度或跨 Agent 委派。应用退出后不承诺持续执行；重新打开只恢复原生会话，不自动续跑未完成写入。

这是单机范围，不等同离线模型。首批按 Windows 原生和 Linux 分别验收；WSL 跨宿主桥、macOS 原生验收及远程主机不计入首批完成范围。

### 2. 连接和登录复用 Agent 原生能力

连接配置归当前 Profile，保存稳定实例 ID、driver、显示名、启用状态、可执行文件路径、所选原生配置目录及允许的启动选项。相同 driver 的不同实例不能共享可变会话状态；未提供托管多账号 UI 前不宣称已实现账号隔离。

首版复用已安装、已登录的原生 Agent；设置页提供明确状态、路径配置和原生设置指引。只在用户主动连接/刷新时进行有界初始化/目录查询，不周期性发真实推理探活。检测缺失不能自动下载安装，也不能阻塞内置助手。

内置模型 API 凭据仍归现有 SecretVault；原生登录凭据归 Agent 自己，MemoFlow 不复制到模型服务连接、不上传或借用内置 API key。需要环境变量秘密时通过宿主安全存储引用，不在 renderer 事件、argv、日志或同步配置中传明文。

自定义模型条目只是 Agent 支持的模型标识与能力；端点/凭据必须在对应 Agent 的原生配置中成立。目录/参数差异由 adapter 处理，不把一个 `/models` API 当作所有 driver 的事实来源。

### 3. Profile 内保存本地连接、会话与展示记录

V1 使用现有 Profile 数据库的 `localOnly` 表能力，保存三个小表；具体 schema 见 `packages/powersync-schema`：

| 本地记录                      | 最小内容                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `ai_local_agent_connections`  | 连接实例配置、版本；不含原生凭据副本                                                          |
| `ai_local_conversations`      | product shell、driver/instance 关联、原生 thread/session 标识、模型选择、最近观察到的执行摘要 |
| `ai_local_conversation_items` | 有界消息/工具展示项、稳定 item/run 关联及完整性标记；不含原生 checkpoint                      |

全部绑定 Profile/owner；不进入 PowerSync 上传下载、Prisma 云表或现有 V3 `ai-conversations` 导出。内置继续使用既有 `ai_conversations` 与 Mastra storage；不为两种模式复制同一份记录。默认执行方式是设备/Profile 偏好，复用现有本地偏好能力。

传输采用带 `runtimeKind` 的 conversation reference；宿主以保存记录再次校验，不能信任 renderer 提供的路径或原生 ID。缺失本地记录不能回退查询 Mastra。删除只清理 MemoFlow 自己管理的关联/记录和资源；原生历史删除按 driver 能力明确反馈，不递归删除用户 CLI 配置目录。晚到事件不能复活已删除会话。

原生上下文仍是执行真值。宿主展示记录是 UI 历史：按稳定 item 更新，在结束/中断等检查点落盘，流式缓存有界；非正常退出可能保留不完整展示，并须标识。重启时不得把持久化的“曾在运行”当成仍有活动进程。没有原生可恢复状态时，展示历史不等于可以继续执行。

### 4. 最小会话协议与能力差异

公共职责限于读取可用能力、创建/恢复、发送、响应请求、取消、读取展示历史和关闭。先由 Mastra + Codex 真实实现验证接口，再加入 Claude/Pi；不预建动态插件注册平台。

- 一次会话只允许一个活动 turn，重复发送返回明确冲突；不同会话可独立执行，宿主资源限额由实际验收确定。
- 请求必须关联 profile generation、conversation、run、request/item ID。原生 request 与 notification 分开校验；未知 request 显式拒绝，未知可忽略通知只做有界诊断。
- permission、工具审批、用户问题是不同 typed 请求，提供当前 driver 支持的回答；过期、已取消或来自旧连接的回答不再生效。
- 取消使用原生 interrupt/abort，然后等待有界收敛；必要时结束该运行的宿主资源。已经提交的业务操作不随取消回滚，结果不确定时先查回执。
- Profile 锁定/切换先拒绝新调用、撤销工具凭据、终结待响应请求和关闭原生资源，再释放业务 ports/数据库。旧 generation 的事件不得写入新 Profile。
- CLI 退出/协议失效只影响相应本地会话，不让整个 AI 模块或内置助手初始化失败；Mastra 本身不可用也不能阻塞已配置的本地 Agent。

不强求相同附件、推理选项、历史删除或模型热切换能力；按 capability 显示并在宿主验证。不暴露的能力不得被 UI 默认填充参数触发。

### 5. 会话注入的本地 MCP 通道

Desktop 管理一个随活动 Profile 启停的 loopback MCP 服务，随机可用端口，连接凭据按会话/运行范围发放并可撤销。仅信任经过校验的 Host/Origin/凭据；本机监听本身不构成授权。IPC 由宿主身份绑定；loopback HTTP 入口沿用 `source: 'http'`，委托元数据由宿主生成，不创造第二种 ExecutionContext。

Codex 在 thread 创建/恢复配置中注入，Claude 用 SDK `mcpServers`，Pi 用宿主管理的 extension；不改用户全局 MCP 配置。会话配置目录仍可包含用户自己的工具，不能把“只注入 MemoFlow 工具”宣称为整个 Agent 已被沙箱隔离。保留 Agent 原生权限/沙箱设置，不因本地部署而全量批准命令或文件访问。

每次发现与执行都校验当前 Profile、会话授权范围和能力版本。首次连接默认只读；用户在可信 MemoFlow 设置中明确启用对应写权限后才开放相关写工具。停止/撤销/锁定后失效。原生工具展示使用独立描述，不扩大 MemoFlow 业务工具执行白名单。

复用 ADR-116 的 Goal/Task schema 和 owner 语义，不复用 Hosted Gateway 的 PAT/OAuth/Redis 外壳。先 Goal，再 Task；两个真实 owner 证明重复后才提取共享 descriptor/handler helper。Knowledge 后续只经过现有知识 owner，不能暴露任意本机路径读写。

### 6. 写入、审批和幂等延续现有业务规则

遵守 ADR-118 的同 key 同输入重放、不同输入冲突、expectedVersion/CAS 和原子 receipt 要求。本地幂等域使用 owner + 稳定 LocalAgentConnection ID + capability version + key；短期 token、进程 PID 和原生 toolCallId 都不能替代稳定连接或重试 key。

连接写授权与逐操作审批分别表达。要求人工确认的操作必须由 MemoFlow 保存输入摘要/版本/有效期，在可信 UI 确认，并由 owner 在提交时校验消费；不能接受模型参数中的 `approved: true` 或把原生工具批准当作业务批准。当前 Mastra 已有审批语义继续保留。

成功 owner mutation、必要 outbox 与 receipt 必须共用 owner 管理的本地数据库事务。任一接缝未满足前，对应写工具保持不可用；不能用内存 map 或“业务成功后补写 receipt”充数。明确未提交时允许原 key 重试；不确定则返回可查询的状态，不自动换 key 重做。

TaskPlan 与 TaskOccurrence 分开；完成事件、KR 贡献与 Routine 定时器继续归 owner。首批写入限定单 owner，不将 Goal + Tasks + Knowledge 伪装为一个原子工具；高级组合和 assisted workflow 沿用现有专项决策。

## 代价、门禁与关联

接受多 driver 的协议适配成本、三个本地记录集合与有限的 UI 事件扩充；换取无需完整 T3 fork 或通用运行平台的接入。内置助手与外部 Agent 共存是产品能力，不是同一会话的双状态系统。

源码参考不等于实际互通证据。CLI 版本、Windows shim/PATH、Electron 打包、SDK 资源文件、MCP 注入和 Profile teardown 必须通过[实施方案](../../plan/active/2026-10-09-local-byoa-and-builtin-assistant.md)中的真实验收。没有对应原生版本与平台证据时，不显示“已支持”。
