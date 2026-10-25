---
tags: [plan, design, ai, goal, events]
status: proposed
created: 2026-10-13T00:00:00Z
updated: 2026-10-13T00:00:00Z
description: 可恢复中断、Goal 原生编辑权交接与 Workspace Event Stream 设计
---

# 设计方案

## 产品状态与错误呈现

保留 durable run 的 running/suspended/failed/completed/cancelled，呈现层映射为运行中、等待用户、本轮已停止、已完成、已停止。另行表达 business draft 的受控、用户可编辑、保存中、结果待核验、已保存状态。AI failed 不意味着业务草稿无效，业务写入失败也不能假称已保存。

同一轮运行保留一个稳定的聊天状态项：加载自然结束，在原位置显示中断原因、已保留草稿说明和可用操作。不要重复追加 terminal error bubble、发送失败标识和 Toast。读请求偶发失败显示同步状态；不能终止模型。严重权限或业务保存拒绝仍准确呈现。

限额原因分为暂时限流、配额不足、无法判断；其他失败包含凭据/权限、暂时不可用、超时、内部失败。失败 adapter 输出 MemoFlow-owned code、strict typed details 和 retry hint。延时优先采用仓库 `retryHint: { kind: 'after', afterMs }` 约定，展示秒数时向上取整，不并行引入另一套 `retryAfterSeconds` 真值。模型、渠道显示使用已授权且已选择的元数据；不泄漏响应 body、headers、stack、key 或任意 context。

“稍后重试”必须由用户触发；retry hint 不是自动重放授权。配额不足不能保证等待即可恢复。无法解析结构化原因时显示一般中断提示。中英文同时覆盖。

## AI 到用户的编辑权交接

原生 Goal session 增加 `detachWorkflow()` 操作，与现有 `releaseControl()` 分开。该操作检查 session 活跃、调用者 authority 和保存 busy 状态，然后一次性清除 AI capability、编辑锁与提交/取消协调回调。保留所有字段、KR、dirty 状态及当前 mounted 表单，不更改初始快照、不触发关闭或重新打开。

Coordinator 在已确认 failed、且未进入 owner 保存时失效化 projection epoch，停止租约续租并释放服务端 grant，调用原生脱离操作，然后清理自己的 projection 引用。旧 AI handle 必须失效，base user handle 保持可编辑；旧 async projection 不允许再次绑定 callbacks 或覆盖字段。

业务保存正在执行、`pendingOwnerAttempt` 存在、`submitted` 已确认，或 durable result 含已创建 Goal 时，禁止转回自由创建。先用 deterministic Goal/KR IDs 查询 owner，区分已写入、明确不存在、暂时无法核验；保留原 replay 语义及冻结状态。绝不能因为 Workflow failed 就清除 pending owner attempt。

审核期间主动接手仍保留 workflow coordinator，沿用既有 release + bind 流程。取消/关闭的用户意图单独处理；失败脱离不得假装用户点击了取消。

传输或租约失权且 run 未确认终止时，保留当前草稿为只读、停止 AI 写入，先核验新 fence 下的 run 和 owner；不得自动关闭，也不得直接切回自由 create。此恢复属于 S1，S0 不改变现有失权回调。

失败后的重新规划是新 run：从原生 owner 读取当前草稿，验证并作为新请求输入，明确记录 source draft revision。不能继续旧 failed Mastra Run，也不能由 stale run 覆盖手动修改。启动前获取新的 fence；当前 dirty 表单只能经显式重新请求 AI 的意图接管，不能靠普通 openCreate 重置。S0 仅实现脱离，重新规划在 S2 闭合。

## 状态权威与护栏

Goal/KR 正式数据由 Goal owner 持久化；未保存的当前表单由 GoalDialog 持有；规划、暂停、live journal、execution receipt 由 Mastra durable Workflow 持有；Attention revision/seenRevision 由 Attention 存储持有；Conversation 标题及未来修订由 Conversation owner 持有。Workspace 日志是变更投影及恢复索引，不是第二个业务数据库。

鉴权由 HTTP/IPC 的 ExecutionContext 决定，禁止用客户端 identityId 选择订阅身份。订阅或查询 run 时先校验 owner 再构造 payload。API、SSE、IPC 输入输出用 contracts 中的 strict schema 校验，非法 delta 丢弃并触发一次快照校准，不部分应用。会话切换、登出、组件释放中止订阅、递增 generation 并隔离 cursor，旧身份事件不能进入新 projection。

lease token/fence 仅用于 owner 写入验证，禁止放进广播事件或草稿检查点。持久化版本和乐观 UI generation 分开。业务写入重试需要 stable idempotency key；公共 retry hint 不授予自动写入重试。

## 可靠事件生产

Workspace 的公开通道目标为经过认证的单一 SSE endpoint；确切 route 与 contracts 在 S3/S4 接入时确定。Notification 原端点和业务行为保留。公开事件采用 `conversation.updated/deleted`、`attention.changed`、`workflow.updated` 语义；这些是传输事件，内部 domain event 仍遵守 `domain:past-tense` 规范。

最小信封包括 schema version、eventId、opaque cursor、resource kind/id、单调 resourceRevision、必要 payload。workflow payload 可包含验证过的状态、安全 failure 和有限 action batch；action 的 revision/actionId/sequence 用于局部幂等。事件不得携带 workflow engine snapshot、模型上下文或其他身份的数据。

Conversation/Attention 若与事件日志共用数据库，状态写入及 durable handoff 同事务完成。广播只能在提交后触发。进程在提交后广播前崩溃，已提交的事件仍由 dispatcher/恢复扫描送达。

Mastra 写入存在独立事务边界，S3 必须先验证可用的 storage adapter seam。优先在 pinned storage adapter 的实际快照/preview 提交事务内记录最小 durable handoff；不能证明原子性时，必须实现覆盖全部变化的持久化扫描/CAS恢复，而不是 `persist(); emit()`。不得包装调用后盲目覆盖 engine snapshot。Postgres 与 LibSQL 各自用真实存储 fault test 证明。未选定并验证该 seam 前，S3 不满足交付条件。

Workspace dispatcher 以持久化日志为准，多进程事件分发必须独立于本进程 EventBus。通知可作为唤醒提示，读取仍以持久化日志为准；服务端有限扫描与客户端每秒 workflow/get 不同。不得依赖某一客户端重连才发现另一个进程的更新。

cursor 不能仅用时间戳或未考虑事务提交顺序的自增号：并发事务可能后分配先提交。S3 必须测试“低序号事务晚提交”不会被已推进游标跳过。可选择按已提交 outbox 串行分配 delivery sequence，资源 revision 单独在 owner mutation 内 CAS 更新。具体存储实现经两 owner 验证后提取。

## 订阅、去重与恢复

### S3/S4 的实际落点

Goal 试点直接在 Mastra 的 `mastra_workflow_snapshot` 上使用数据库 trigger。快照、每个 run 的 `resourceVersion`、安全读模型和事件 outbox 在同一事务内提交；回滚不留事件。读模型保留累计业务动作与已保存 Goal 的 `priorReceipt`，终止快照不能抹掉已应用草稿或让已保存 Goal 重新进入 create。事件只发送新增动作，排除引擎图、prompt、provider 响应、堆栈和租约 capability。

LibSQL 的 SQLite 写入顺序提供提交游标；共享客户端访问在 interactive transaction 生命周期内串行，避免引擎事务与读模型清理互相争用。当前进程提交直接唤醒订阅者，另一个进程的提交由每个 source 一份、仅有订阅时运行的 1 秒 committed-head 检查发现。这是服务端持久化通知桥接，浏览器不周期读取 Workflow。

Postgres trigger 只写 outbox 并在提交后发 `NOTIFY` 唤醒提示；消费事务按 identity 锁定 delivery head，给已经提交的 outbox 分配游标，每批最多 100 条。业务事务不预分配 delivery sequence，避免晚提交的变化被先推进的游标跳过。LISTEN 连接建立/重建后都补读持久化记录，通知本身不作数据真相。

游标绑定持久 source epoch、identity 摘要和已处理 sequence；数据库查询始终使用认证后的 identity，游标不授予访问权限。保留 7 天历史，删除历史时保留每个 identity 的 `prunedThrough`，不能用“最早剩余全局序号”判断过期，否则其他 identity 的序号空隙会造成错误重置。

Web 的试点端点为 `GET /ai/runtime/workspace/sse`（API host 前缀为 `/api/v1`），支持 `Last-Event-ID`，15 秒注释心跳和有限写入背压；原 Notification SSE 保留。Desktop 使用认证 IPC start/event/ack/stop，同一 sender 最多一份订阅，每条事件投影完成后才 ACK，错误 sender/identity/游标不能释放待确认事件。

`useGoalWorkflowEvents` 首次/重连读取带版本快照，之后合并连续的动作 delta；重复版本忽略，gap 或过期游标校准。Goal 自己的定时 get、generic reconciliation 对 Goal 的定时 get、Workflow Client 对 Goal Resume 的等待 get 已移除。Task/Knowledge 的原读取语义仍保留。恢复会话不自动打开原生表单；显式打开或本轮已控制的表单才接受字段投影。Resume ACK 的 `awaitAfterVersion` 防止旧暂停快照和迟到 ACK 覆盖较新的已提交状态。

这些是首个 Goal owner 的落地，还不是两个 owner 已验证后的共享 Workspace framework。Attention/Conversation 接入继续按 S5/S6 推进。

建立连接时先覆盖 live 窗口再读取历史，历史分页和实时缓冲都必须有上限。历史和实时共用一种 schema，通过 eventId 和 resourceRevision 去重，禁止用 unbounded Set 永久累积。

首次加载需要可证明一致的 snapshot/cursor 边界：先订阅并缓冲，再取带版本快照并合并缓冲，或服务端提供一致 watermark。游标只能在事件被可靠接收/应用后推进；投影失败不能静默 ack。SSE 采用 at-least-once，客户端同 revision 幂等，过期/重复不覆盖新状态；revision gap 触发按 ID 读取。

重连携带 cursor；超出保留期返回 typed reset_required，不假称历史已补齐。执行一次作用域快照校准再恢复订阅。cursor 按身份/runtime/profile 隔离；默认内存保存，跨浏览器刷新由首次快照恢复。需要持久 cursor 时另行验证身份切换和设备 scope。

单个 Workspace subscription 在 composition root 管理生命周期，Conversation/Attention/Workflow 只消费各自投影。正在运行的 Goal 字段、暂停提问、终止 failure 均由 workflow.updated 更新。Web 走 SSE，Desktop 本地 Agent 走同契约的 IPC/native event；Desktop 的通知不能只有不可恢复的瞬时 IPC。

正常事件包含足够数据时直接投影，不额外 workflow/get。只有初始化、显式刷新、version gap、断线/前台恢复或 cursor reset 才校准；同资源并发读取合并。Attention acknowledgement 仍是有业务意义的命令。运行状态订阅验证通过后一次性移除对应轮询，不能永久双跑。

## 草稿检查点与交付边界

第二阶段引入独立 draft checkpoint：identity、owner kind、draftId、draftRevision、validated content、更新时间及可选 sourceRunId。只保存业务字段，不保存 coordinator、lease、token 或 Error。CAS 防止多窗口覆盖，草稿删除/提交后清理必须明确；登出切换身份不得串用，重新登录恢复须先鉴权。

草稿是正式 Goal 之前的独立对象，禁止草稿保存自动调用 createGoal。用户字段与后续 AI delta 冲突必须显式解决；数据库/浏览器刷新/断线测试独立验收。S0 仅保护当前 mounted draft，不保证刷新或退出恢复。

分阶段修改保持可回退到上一可验证切片，不以增加轮询间隔作为最终方案。本轮 UI 切片不变更数据库；后续 schema 必须按仓库现行规则实施，不设计额外兼容双轨。没有两个真实 owner 的证据前不创建共享事件 framework。

## S5 实际传输与第二 owner

Attention 的 PostgreSQL 事件记录由原生表 AFTER INSERT/UPDATE/DELETE 触发器与状态写入同事务提交；投递序号在提交后由 identity head 锁分配，未提交事务不能预占续传位置。Desktop 的原生 owner 写入在 PowerSync writeTransaction 内追加本地日志；同步收到的数据通过公共 watch 唤醒后按身份从已提交快照校准，不依赖进程内 EventBus。

事件 resourceVersion 与 Attention revision/seenRevision 分离，心跳、已读确认、删除、过期投影均有事件顺序。到期仅掩盖界面 working/input/approval，保留原生执行状态和业务修订号；最近一个 deadline 的计时器触发校准，不持续轮询业务数据。

Goal 与 Attention 可能位于不同数据库，Workspace cursor 因而是两份 owner epoch/sequence 加 identity 摘要，不能假设跨存储存在全局事务或全局时序。每份游标分别检查留存下界与 epoch；重置后校准持久化快照。HTTP SSE 与有界 ACK 的 IPC 使用相同 Workspace 契约。前端按同一 host workflow client 共享传输，最后一个消费者释放才关闭；加入较晚的消费者先校准快照，然后处理事件。Notification 原端点保持原有行为。
