---
tags: [plan, active, ai, desktop, byoa, mastra]
description: 本地内嵌 BYOA 与保留 Mastra 内置助手的分阶段实施方案、代码映射及行为验收。
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# 本地 BYOA 与内置助手：实施方案

**状态：已批准，实施中；各切片仅在行为验证通过后标为完成。**  
**决策入口：** [ADR-120：可选运行时与内置助手](../../architecture/adr/ADR-120-selectable-assistant-runtimes-and-builtin-mastra.md)、[ADR-121：本地宿主与工具通道](../../architecture/adr/ADR-121-desktop-local-agent-host-and-tool-bridge.md)。  
**事实依据：** [T3 源码与 MemoFlow 映射](../../analysis/2026-10-09-local-byoa-t3-source-study.md)。T3 固定 `ec80933ac8cd02fec5c97b342462ccc9567cdb1e`，MemoFlow 研究基线 `a33d7b265260dd60455dc133e1e47b4c80069658`；实施前重新核对实际代码，不把本文当作已存在的接口。

## 1. 产品目标与完整范围

用户在 MemoFlow 里选择“内置助手”或已连接的本机 Agent、选择该执行方式支持的模型并对话。未安装任何 Agent 的用户仍可使用已有 Mastra 功能；外部进程失败不拖垮内置助手，也不自动改用另一运行时重跑。

本方案覆盖三个原生接入：Codex、Claude Code、Pi。**先交付 Codex 是实施顺序，不是把后两项默认为已完成或永久取消。** 本地模型调用仍可联网；无需部署另一套云端 Agent 服务。

里程碑：

- **M1 — 内置助手 + Codex 本地聊天和只读业务闭环**：LBA-1001～1005。可独立验收并作为明确标注的首版，不开放未验证的写工具。
- **M2 — 确定性业务写入**：LBA-1101/1102。Goal、Task 各自有授权、并发、回执与重试证据。
- **M3 — 三种 Agent 与知识能力**：LBA-1201～1203。Claude/Pi 分别完整验收，Knowledge 按 owner 接入。
- **M4 — 打包与发布收口**：LBA-1301。按交付里程碑核对支持矩阵；只有 M1～M4 范围都兑现才关闭本计划。

首版沿用用户已安装/登录的 CLI；应用内登录按 driver 现有能力后续增补，不为所有 provider 制造统一假登录。自动安装更新、托管多账号、ACP 通用市场、WSL 跨宿主桥、远程/多设备执行、跨 Agent 会话迁移和 T3 开发工作台不纳入本轮。连接记录保留稳定实例 ID，避免将来多配置只能靠显示名区分。

内置助手保留现有专用工作流与模型服务设置。用户主动打开内置工作流时清楚标明执行来源；本地 Agent 普通工具不偷偷调用 Mastra 规划。内置不是免配置模型、免费额度或离线推理承诺。

## 2. 已有接缝与预期改动

| 代码位置                                                                                                                                                                              | 实施动作                                                                           | 必须保留的语义                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Desktop composeAI](../../../apps/desktop/src/main/runtime/compose-ai.ts) / [AI module](../../../packages/ai/src/server/infrastructure/ai.module.ts)                                  | 将会话执行依赖从直接 Mastra 引用改为已绑定会话的派发；本地 driver 懒启动、失败隔离 | Mastra 继续运行内置会话和 workflow；不增加通用多引擎框架         |
| [Assistant client](../../../packages/ai/src/client/runtime-assistant.ts) / [Electron transport](../../../packages/ai/src/electron/index.ts)                                           | 沿用 IPC，补 runtime reference、capabilities 和 typed requests                     | schema 校验、宿主身份、终止事件、取消与 handler 清理             |
| [命令契约](../../../packages/contracts/src/modules/ai/api/assistant-runtime.dto.ts) / [事件契约](../../../packages/contracts/src/modules/ai/api/assistant-events.dto.ts)              | 定义 builtin/local_agent 联合、权限/用户问题、原生工具展示描述                     | 不接收客户端 owner/native path；不放开产品工具执行白名单         |
| [AISettings](../../../packages/app-vue/src/modules/setting/components/AISettings.vue) / [模型选择](../../../packages/app-vue/src/modules/ai/composables/useAIModelSelection.ts)       | 增加本地 Agent 连接入口和分组；保留内置 Provider onboarding                        | 默认值不劫持现有会话；参数只呈现所选运行时能力                   |
| [Chat view](../../../packages/app-vue/src/modules/ai/composables/useAIChatView.ts) / [Chat session](../../../packages/app-vue/src/modules/ai/composables/useAIChatSession.ts)         | 通用聊天使用会话引用；内置 workflow 入口按来源显示                                 | 原生会话不落入 Mastra workflow hydration；用户草稿不冒充持久状态 |
| [PowerSync schema](../../../packages/powersync-schema/src/index.ts) / [Desktop connector](../../../apps/desktop/src/main/database/powersync.ts)                                       | 增加 ADR-121 的三个 localOnly 表及本地 change/query 接入                           | 不产生上传 CRUD、云表或跨 Profile 列表；内置 shell 同步方式不改  |
| [Desktop profile manager](../../../apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts)                                                                                  | 把 Agent/MCP 资源纳入现有 teardown；复用当前 Profile generation 或等价失效凭据     | 先断新工作与凭据，再关会话，最后释放业务 ports/DB                |
| [Gateway descriptors](../../../packages/agent-gateway/src/read-tool-descriptors.ts) / [现有 product tools](../../../packages/ai/src/server/mastra/tools/product-tools.ts)             | 复用 schema/owner 调用，增加 Desktop 本地宿主装配                                  | Hosted 认证协议不变；内部/外部工具子集可以不同                   |
| [Task mutation adapter](../../../apps/desktop/src/main/modules/ai/task-plan-mutation.adapter.ts)                                                                                      | 复用业务创建语义，补接所需的 owner transaction/receipt                             | 不以“已有 create 方法”替代幂等和批准证据                         |
| [Architecture manifest](../../../tools/governance/architecture-surface-manifest.json) / [retirement tests](../../../packages/ai/src/server/mastra/ai-vnext-no-legacy.surface.spec.ts) | 将 Mastra-only 约束限定为内置路径；新增单会话归属检查                              | 被退休 Python/AgentHost/重复 checkpoint 路径继续禁止             |

新增模块优先在 `packages/ai` 现有运行时/adapter 分层中实现，Desktop 做组合与平台生命周期。不要仅为目录对称新建 `agent-platform`、全局 capability registry 或独立服务；至少两个真实实现出现重复后才抽共享部分。

## 3. 分阶段切片

全部项的完成条件是行为证据，不是文件已创建或按钮可见。

| ID       | 可交付行为                                                                   | 前置               | 保护契约 / 聚焦验证                                                                             |
| -------- | ---------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| LBA-1001 | 无外部 Agent 环境仍能使用内置聊天、审批及现有 workflow；建立可选择的会话契约 | ADR 目标明确       | 保留现有 Mastra 测试；增加 provider 缺失不影响内置、伪造 runtime reference 拒绝测试             |
| LBA-1002 | 设置连接 Codex、读取登录/模型状态并保存本地配置；内置模型设置同时可用        | 1001               | 保存三个 localOnly 表及列表引用；缺 CLI/未登录/失效模型可解释，无自动安装/推理探测/默认切换     |
| LBA-1003 | Codex 创建/恢复会话、流式发送、权限与提问响应、取消、历史显示                | 1002               | 假进程 fixtures + 真实 CLI；覆盖初始化/取消竞态、未知请求、进程退出、陈旧请求与删除后晚到事件   |
| LBA-1004 | Codex 在当前 Profile 只读查询 Goal，界面可打开对应目标                       | 1003               | 本地 MCP 注入、归属校验、令牌撤销和 Profile 切换；不依赖 API/Redis/云登录                       |
| LBA-1005 | 增加 TaskPlan/TaskOccurrence 只读工具；两运行时列表/默认值/故障隔离闭环      | 1004               | 第二真实 owner 验证复用；原生工具展示不被 15 个内置工具枚举拒绝；内置流程回归及 M1 Desktop 验收 |
| LBA-1101 | 用户授权后 Agent 创建/更新 Goal；重复提交返回确定回执                        | 1005               | 同输入重放、异输入冲突、expectedVersion、真实本地事务故障、撤销后重放拒绝；默认不提供删除       |
| LBA-1102 | TaskPlan 创建/修改、TaskOccurrence 完成与 KR 贡献完整                        | 1101               | 第二 owner transaction/receipt 证明；完成选择不擅自采纳 suggestedValue，已有贡献不重复          |
| LBA-1201 | Claude 接入相同 UI 和业务工具，保持其原生权限/历史能力                       | 1005               | SDK 流、resume/interrupt、MCP options、模型 manifest 来源和版本；M2 写能力仅在其门禁通过后开放  |
| LBA-1202 | Pi 接入相同 UI 与业务工具                                                    | 1005               | RPC、模型目录、extension 注入/清理、非零退出、用户输入；不全局安装 extension；M2 同样受门禁     |
| LBA-1203 | 三种 Agent 可读取 Knowledge；将结果经受控业务编辑面保存为笔记                | 1102、1201、1202   | 现有知识 owner、路径边界、资料引用和编辑确认；不新增任意文件写工具或隐式内置规划                |
| LBA-1301 | Windows/Linux 打包验证和支持矩阵；按里程碑发布                               | 所发布范围全部完成 | 原生路径/依赖/进程清理、无外部 CLI 的内置模式、Profile 隔离、Web/API 回归、可定位的产物证据     |

若某个 driver 不支持必须的动作（例如恢复或权限回答），按原生能力给出明确限制并调整发布支持矩阵；不能使用另一运行时偷偷补做，再将其记为已完成。M1 可以先发布 Codex 支持，但计划仍保持后续项 TODO。

## 4. 核心实现约束

### 4.1 会话路由与持久化

- `ConversationRef = { runtimeKind, id }` 在 UI/IPC 中区分两类来源；创建/读取/删除/用量均经相同归属校验，现有纯内置 HTTP 客户端仍只接受其宿主支持的种类。
- 内置会话继续由既有 repository/Mastra 负责；本地会话只写 localOnly 记录。统一列表只是查询组合，不能顺手创建同 ID 的第二个 shell。
- native ID 尚未创建、已丢失、实例已删除或配置目录变更时明确返回不可恢复原因；禁止“读不到就按内置初始化”。实例的账号/配置目录变更使既有绑定需要重新验证，不能把原生 ID 交给另一个账户试恢复。
- 模型选择随 run 记录快照，默认偏好只影响新会话；连接/模型可用性临时失败不覆盖用户选择。工具批准与用户问题关联当前会话/请求，重启后旧批准作废。
- 本地 items 只保存已接受的展示内容和完整性标记，不写每个 token，不存第二套 Agent 状态机。历史不完整允许明确显示；不能用聊天记录重建并自动执行未完成 tool call。
- 删除/锁定先使活动引用失效；provider 原生历史无法删除时明确披露本次只移除 MemoFlow 历史/关联。原生 homePath 不是 MemoFlow 可递归清理的目录。

### 4.2 双运行时的初始化与失效隔离

- 未选择本地 Agent 时不启动它、不读取所有用户配置目录、不展示安装要求。缺 CLI 的正常用户路径可直接进入内置 Provider 设置。
- 本地 driver 和 Mastra 的懒加载/启动失败分别处理；不能在共享模块初始化中以任何一个可选执行方式的错误阻止另一种使用。
- 不自动跨方式 retry；失败界面可创建一个内置新会话，原会话与已提交业务事实保留。用户发送到新会话才产生新的执行与费用。
- UI 显示实际运行方式和模型；原生用量缺字段显示未知，不用默认零值或内置连接信息补齐。
- 原生权限与业务授权分开。普通业务写入按照启用范围执行；需要确认的编辑保留 MemoFlow 的可信确认流程，不重复或绕过已确定的规则。

### 4.3 写入门禁

LBA-1101 先验证 Goal 的本地真实事务，再将同样语义应用到 Task；接入现有 External Agent Gateway 项目的 owner receipt 时复用同一实现，不另造本地“等价”回执。

幂等身份为 owner + 稳定连接 + capability/version + idempotencyKey。输入规范化摘要、expectedVersion、批准摘要各自有独立语义；`requestId`、短期 token 或 toolCallId 不能替代。执行前仍检查当前授权；同 key 并发必须由 DB 约束/锁收敛。

必须覆盖“事务回滚”和“事务已提交但响应丢失”两种故障；后者通过持久回执返回原 mutation snapshot。必要事件/outbox 同事务提交，不因 Agent 取消而删除成功事实。无法证明某个写入安全时，能力发现不公布它，M1 只读能力仍可交付。

公开错误沿用 ADR-049 的 Result/transport 映射，至少区分未安装、需登录、模型不支持、运行中冲突、原生会话不可恢复、请求过期、协议失败、结果不确定、权限拒绝。实现时在已有 AI failure vocabulary 中统一，禁止把 stderr、原生配置或凭据直接当 UI 错误。

## 5. 行为验收矩阵

以下全部为未来验收要求，当前状态均为 TODO。每项需记录测试入口/实际证据，不能从源码阅读推断通过。

| AC  | 场景                                                   | 预期可观察结果                                             | 切片           |
| --- | ------------------------------------------------------ | ---------------------------------------------------------- | -------------- |
| 01  | 未安装任何 CLI，有内置模型连接                         | 内置聊天、审批和已有工作流可用；没有安装/登录 Agent 前置   | 1001           |
| 02  | 未安装 CLI，也无内置模型连接                           | 清楚进入模型配置；不宣称免费或自动代付，不强制安装         | 1001/1002      |
| 03  | 发现 CLI、切换默认执行方式                             | 只有新会话采用新默认；既有内置/原生会话保持来源            | 1002/1005      |
| 04  | CLI 缺失、原生未登录、模型目录读取失败                 | 局部不可用且可重试；内置仍可用，无真实推理探活             | 1002           |
| 05  | Mastra 初始化失败，已配置本地 Agent                    | 本地会话仍可运行；内置失败明确显示，无全模块瘫痪           | 1003           |
| 06  | 原生 turn 已执行工具后断开                             | 不自动启动 Mastra/另一个 Agent，不重放写入                 | 1003/1101      |
| 07  | 权限请求、补充问题及不支持请求                         | 正确 typed UI/响应；未知 request 明确拒绝，不无限等待      | 1003           |
| 08  | 启动中停止、双击发送、取消后晚到 delta                 | 单活动 turn；有界结束；旧事件不改变终态或新会话            | 1003           |
| 09  | 进程退出/重启应用/原生 thread 丢失                     | 可恢复则恢复同一绑定，否则明确失败；不伪造新上下文         | 1003           |
| 10  | 切换或锁定 Profile 后旧 token/请求继续到达             | 旧调用被拒绝，旧进程资源清理；新 Profile 无数据污染        | 1004           |
| 11  | 另一 Profile 伪造 connection、native ID 或 runtimeKind | 宿主拒绝，不能借其他身份恢复或写数据                       | 1003/1004      |
| 12  | 本地 MCP 调用 Goal/Task 读工具                         | 返回当前 owner 数据；关闭云 API 后仍可用                   | 1004/1005      |
| 13  | 本地与内置历史列表、删除和原生晚到事件                 | 来源不混用、无双写/复活；无法清理原生历史时准确反馈        | 1005           |
| 14  | 本地数据同步、V3 导出和另一设备登录                    | 本地连接/会话/items 不上传、不导出、不被另一宿主接管       | 1002/1005      |
| 15  | 内置 Goal/Task/Knowledge workflow 中断后恢复           | 原 Mastra durable 语义保留；原生会话不调用该恢复路径       | 1001/1005      |
| 16  | 用户开启写授权后撤销；原生工具声称 approved            | 每次执行重新授权；伪造批准无效，读写范围独立               | 1101           |
| 17  | 同 key 同输入重试、同 key 异输入、同 key 并发          | 原回执重放、明确冲突、只有一次业务 effect                  | 1101/1102      |
| 18  | 事务中失败、提交后响应丢失、取消后重查                 | 无部分提交；已提交可找回原回执，不重复事件                 | 1101/1102      |
| 19  | 旧 expectedVersion、审批后输入变化                     | 拒绝失效变更；不能自动读最新版本消除冲突                   | 1101/1102      |
| 20  | TaskOccurrence 完成与 Prompt/Fixed KR 贡献             | 保留 complete-only/record 选择，贡献仅发生一次             | 1102           |
| 21  | Claude 模型/SDK/权限/MCP/恢复                          | 来源与能力准确；真实工具调用；限制显式，不借 Codex 补做    | 1201           |
| 22  | Pi RPC/模型目录/extension/退出                         | 会话级注入可用，结束资源清理，不改全局 extension           | 1202           |
| 23  | Knowledge 引用、草案编辑确认、非法路径                 | owner 保存正确笔记；拒绝越界，不能任意写文件               | 1203           |
| 24  | Agent 未返回 token/费用、用户改用内置新会话            | 未知值明确；每次执行只归实际来源，不重复计量               | 1005/1201/1202 |
| 25  | Windows/Linux 打包，CLI shim、空格路径与退出           | 找到正确程序、argv 无 shell 拼接、退出无遗留工具权限       | 1301           |
| 26  | Web/API 共享 contracts/UI 回归                         | 仍可内置聊天与工作流，不加载本机 driver 或暴露不可兑现操作 | 1301           |

## 6. 验证命令与证据

本轮读取现有 project.json 核实以下 target；实施时从变更最近的项目和文件开始。工具目录没有 CodeGraph/nx-mcp 时使用定向源码和 Nx CLI，不增设替代索引服务。

```bash
pnpm nx run ai:test
pnpm nx run desktop:test
pnpm nx run app-vue:test
pnpm nx run contracts:test
pnpm nx run powersync-schema:test
pnpm nx run agent-gateway:test
pnpm nx run goal:test
pnpm nx run task:test
pnpm nx run-many --targets=lint,typecheck --projects=ai,desktop,app-vue,contracts,powersync-schema,agent-gateway
pnpm nx run memoflow:governance-check
```

上述不是每次必跑的全套；按切片选择，修改 owner 时补对应 target。共享契约/宿主改动需要 API/Web 最接近的检查，打包变动使用 `pnpm nx run desktop:package`、`pnpm nx run desktop:test:packaged-smoke` 与已有 `desktop:e2e` 配置。开发启动为 `pnpm nx run desktop:serve-safe`。

单元/contract tests 使用原生消息 fixtures 和假子进程，验证协议与边缘状态；SQLite integration 使用真实 Profile 临时数据库验证 localOnly、事务和回执。不能只 mock owner.save 成功就断言跨步原子性。真实 Agent 验证单独执行有限的固定任务，记录 CLI/SDK 版本、OS、binary 来源、模型、Profile、会话和脱敏结果，不循环探测。

运行时、打包、env 或部署相关改动遵循仓库流程，使用 `validate-local-deploy` 与 `pnpm docker:local:up` 验证共享 API/Web 回归，再做 Desktop 场景；该验证步骤不意味着本地 BYOA 在产品运行时依赖 Docker/API。Windows 与 Linux 分别验收；没有 macOS/WSL 实机证据就保持未验证。

## 7. 依赖、风险与范围控制

- **Mastra-only 架构锁**：LBA-1001 同步修订约束为内置权威 + 单会话路由；保留历史 retired-file locks，不能删测试绕过。
- **External Agent Gateway 写入**：与[既有计划](./2026-10-07-external-agent-gateway.md)共享 owner 事务/回执工作，Desktop 不依赖其 Hosted rollout；相同能力由一个实施 owner 维护。
- **Profile 改造**：与[独立 Profile 计划](./2026-10-09-desktop-independent-profiles.md)协同 teardown/失效机制，不复制 registry，不把导入功能当作 BYOA 前置；本地记录不自动进入复制导入。
- **旧 AI 交互改进**：保留[内置 AI 交互计划](./2026-10-04-ai-interaction-goal-workflow-convergence.md)中的内置能力修复；对共享 UI/契约的工作先归并，避免两边分别重写会话层。
- **SDK 和协议漂移**：固定支持版本与上游引用，在独立更新变更中验收；不永久 fork 整个 T3，也不承诺任何安装版本都可用。
- **资源上限**：进程数、消息帧/附件上限、pending 请求数、取消期限在首个真实 driver 中测定后配置；禁止无限缓存和无限重试，不为了研究阶段虚构性能数值。

没有旧版本兼容或自动数据迁移要求。实现通过新增本地记录承载新能力，保留现有内置数据来源；不删除用户已有内置模型连接/历史。项目允许破坏性 schema 调整不等于授权对用户当前数据执行清理命令。

## 8. 发布与关闭

运行方式由用户选择；功能发布按已验收 driver/能力显示。原生接入临时停用时仍可用内置助手，新会话由用户显式建立；保留原生历史、失败原因和业务回执，不自动迁移或抹除。

各切片合入前对照 AC 标记 delivered/partial/missing/deferred 并附证据。M1 发布时清楚标注只读和仅 Codex；M2/M3 未完成就不声称全方案已交付。用户已授权本轮完成全部切片后创建 PR、合并 main、核对整合所有分支并发布及验证生产；不提前发布未验收范围。

全部范围完成后更新 ADR-120/121 的采纳/实施状态，给 ADR-050/096 增加已生效修订说明，归档本计划并保留固定来源、许可、版本和验收证据。只交付设计文档时保持本计划 active、功能 TODO。

## 9. 设计阶段验证记录（功能实施前）

- 交付 ADR-120、ADR-121、本实施方案、术语与索引更新。
- 本轮只修改文档；没有安装 Agent、发送模型请求、修改应用代码或清理用户数据。
- 两份 ADR、实施方案及研究文档的本地链接可解析，ADR 编号无重复、索引完整；实施表包含 11 个独立切片、26 项行为验收，均为 TODO。
- `git diff --check` 与 `pnpm nx run memoflow:governance-check` 通过（7 个 target 中 6 个缓存命中）；这些是文档/治理证据，不代表功能 AC 已通过。
