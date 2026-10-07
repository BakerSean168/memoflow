---
tags: [plan, active, ai, refactor]
description: AI runtime 职责分层评审与 Durable Workflow Runtime 提取方案
created: 2026-10-07T00:00:00
---

# AI runtime 职责分层与 Durable Workflow Runtime

## 基线与交付范围

用户授权评审、详细设计、实现、验证和合并 main。本轮交付 Batch 1，后续批次作为有进入条件的路线图，不在同一个 PR 中混入行为变更。

基线为 main `ad8f4468f764401ff3f70a99cda60d110d50c5fb`，PR #418 已在 2026-10-07 02:40 UTC 合并。`MastraAIRuntime` 为 1386 行，snapshot decoding 与三种 workflow projection 已独立。已有本地 operator 脚本不属于本次改动。

## 对前轮建议的评审

按运行时职责分层的方向正确。Durable Workflow 通过现成 `AIWorkflowRuntimePort` 暴露 start/startDetached/resume/resumeDetached/get/list/cancel，具有独立的请求准备、持久化查询和返回投影语义，适合作为第一刀。

需要修正或补全：

1. 提取范围不能只按原来的行号。`workflowRequestContext`、`runningWorkflowView`、`workflowStore` 在 start 之前，也必须迁移；公共 `summarizeUsage` 位于 workflow 方法之间，却服务整个 AI runtime，应留在 facade。
2. 子模块只持有已装配依赖。Mastra、Memory、Controller、Planner、workflow factory、host mutation port wiring、init/dispose 都留在原 composition root。不能让子模块接受整个 facade，不能引入反向 init callback。
3. 已有 draft 校验会约束 Goal/Task revision、draftRef、owner IDs。真正缺口是外层 kind 与 suspension/recovery receipt/failure operation 的关联，后续应精确补齐这一关系。
4. 当前未知 Mastra status 投影为 running 是既有行为；不能在移动代码时改变。未来 unsupported/corrupt 方案还需确定公开错误、轮询终止、旧 snapshot 恢复语义，不能只增加一个状态字符串。
5. Assistant run ownership、binding generation、approval、abort、settle 形成同一状态机；后续允许将 telemetry 移出，但不能把不同阶段时钟与 run ownership 脱钩。
6. Goal/Task owner-first persist 与 Knowledge approve-then-persist 是不同契约。ADR-112 支持 owner native surface，不支持以通用 workflow composable 抹平差异。

## 选型与文件结构

选择一个具体内部类，复用现有 port。仅提取函数组会使 workflow/storage/history 依赖在多处传递；建立独立 host runtime/registry/generic framework 会制造第二套装配与生命周期。具体类把命令与查询复杂度收在现有接口之后，新增概念最少。

```text
host HTTP / IPC / AI module
  -> MastraAIRuntime (implements AIWorkflowRuntimePort)
       init -> delegate seven workflow operations
       -> MastraDurableWorkflowRuntime (internal)
            existing Goal / Task / Knowledge workflow instances
            existing storage.getStore('workflows')
            existing history.appendUserTurn + optional usageReadPort
            workflow-run-snapshot + workflow-run-projection
       Assistant execution, history APIs, summarizeUsage, init/dispose
```

生产代码仅新增 `packages/ai/src/server/mastra/runtime/mastra-durable-workflow.runtime.ts`，修改同目录 `mastra-ai.runtime.ts`。测试继续使用现有 `mastra-workflow.runtime.spec.ts`，通过公开 facade 与真实 LibSQL store 验证，不增加针对委托次数的脆弱测试。`runtime/index.ts` 不导出新类。

依赖：三个 `ReturnType<typeof create...Workflow>`，仅可读写 workflow store 的 `Pick<MastraCompositeStore, 'getStore'>`，仅追加历史的 `Pick<AssistantHistoryService, 'appendUserTurn'>`，可选 `IAIUsageReadPort`。类型由既有 schema/factory 推导，不复制 DTO，不新增通用 workflow 类型参数。

## 方法归属与受保护语义

| 归属                  | 方法/状态                                                       | 约束                                                                                            |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| facade                | constructor、init、dispose                                      | 唯一 Mastra/Controller/Memory/store 生命周期；共享 initPromise/disposePromise                   |
| facade                | 七个 workflow 方法                                              | 每个入口先 await init，再将同一个 input 委托给内部实例                                          |
| facade                | summarizeUsage、history API、Assistant dispatch/approval/cancel | 实现保持原样；Assistant activeRuns 不迁移                                                       |
| durable module        | start、startDetached                                            | 保留三个显式 owner 分支、schema parse、initialState、identity 注入及原异常行为                  |
| durable module        | resume、resumeDetached                                          | 保留 identity 检查、snapshot input 恢复、lifecycle step、当前 ExecutionContext、terminal replay |
| durable module        | get、list、cancel                                               | 保留查询顺序、过滤、排序、usage enrichment、取消后持久化重读                                    |
| durable module        | workflowRequestContext、workflowInputFromRequest                | start 使用当前请求输入；resume 使用持久化 provider/model/locale 与新的 entry context            |
| durable module        | workflowStore、runningWorkflowView、attachWorkflowUsage         | 保留 missing store error、ack 时间戳、无 usage/零执行的行为                                     |
| existing pure modules | snapshot parsing、run projection                                | 原样复用，含 ownership-before-decode、错误清洗、status mapping                                  |

特别保留：

- start 等待执行结果；失败时如已有 snapshot 返回持久化投影，否则抛原错误。resume 失败仅在持久化投影非 running 时回收为结果。
- detached 使用 Mastra 原生 startAsync/resumeAsync；不增加 fire-and-forget Promise、进程队列或 detached registry。
- resumeDetached 遇到 running/terminal 直接返回当前视图；不能重复派发，也不能重复写 workflowTurn。
- Goal start 的显式 workflowTurn，以及三类 answer 的 workflowTurn，写入同一 canonical Mastra history；不触发 Assistant。
- run identity 以 ExecutionContext 为准；他人 get/cancel 返回 null，resume 抛 RUN_NOT_FOUND，list 不泄露他人记录；拒绝路径不查询 usage。
- Goal/Task/Knowledge approve、recovery、领域 deterministic IDs 和 owner persistence 时序保持原样。
- 不改变 contracts、transport、public exports、存储 schema、依赖版本、生产配置；无数据迁移。

## 实施切片与验收矩阵

先在原实现上补齐 characterization 并运行，再整体移动职责、重复同一组测试。结构性重构不人为制造失败测试；新增或修复行为才需要 red-green。

| AC   | 可观察结果                                                                                  | 证据                                                                                  |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| DW-1 | facade 的所有 workflow 入口仍使用同一组原生 workflow/store                                  | 实际 facade+LibSQL 集成测试、constructor/diff 审查                                    |
| DW-2 | 三类 detached start/resume 在 planner 未完成时返回 running，随后可读取 persisted suspension | 带可控 planner barrier 的三类参数化测试                                               |
| DW-3 | running detached resume 与 terminal resume 重放不再次执行或追加历史                         | barrier 期间重复 resume；完成/取消后 replay                                           |
| DW-4 | identity 在 get/list/resume/resumeDetached/cancel 与 usage 访问前生效                       | 跨 identity 参数化集成断言                                                            |
| DW-5 | durable restore 后按新 ExecutionContext 执行，保持原输入/provider/model/locale              | 现有 Goal restart 测试 + Task/Knowledge detached restart                              |
| DW-6 | history、usage、过滤、降序排序及取消保持原行为                                              | 现有 history/usage/cancel 测试 + 三类 list/cancel 测试                                |
| DW-7 | Goal/Task owner command 幂等、Knowledge approval 后写入及 recovery 不变                     | 现有三类 approve/recovery tests                                                       |
| DW-8 | Assistant run ownership/approval/Stop replay 不漂移                                         | 原有真实 Controller approval/policy tests 全量运行                                    |
| DW-9 | build/import/host wiring 正确，contracts 与 projection 无漂移                               | AI lint/typecheck/test/build，affected checks，governance/inventory，prod-like Docker |

实施顺序：Goal tracer bullet 验证 detached 与权限；同一 seam 扩展 Task/Knowledge；提取具体模块，保持三类显式 dispatch；执行全部验证。无共享新 abstraction，避免借两类相似性构造 framework。

## 后续路线图与进入条件

1. Batch 2：先将现有 `assistant-observability.ts` 扩展为 turn 观测对象，再评估 `AssistantTurnSession`。先固定 late native ID、Stop replay、approval/cancel 竞态、事件序列、cleanup；保留状态机为整体。
2. Batch 3：独立 Workflow Run Contract Hardening。为每个 kind 关联 suspension/receipt/failure；未知 status 需单独选择错误/不可用投影及客户端终止语义，替换原宽松 characterization。
3. Batch 4：先补 Goal/Knowledge native dirty/busy 离页保护与 missing run polling characterization，再拆 Goal projection/draft mapping/native review coordination。Task 可复用已验证 mechanics；Knowledge 保持自身 persistence 顺序。
4. Batch 5：按 composer context、Assistant stream、conversation projection 拆 ChatSession，维持上层 facade。待职责收敛后再评估 ChatView 是否需要进一步拆分。
5. Batch 6：只在实际维护收益明确时整理 DTO/tool/planner。AIContextAssembler 与 ai.module composition root 不以行数为重构目标。

## 验证、合并与回退

运行最近 Nx AI tests/typecheck/lint/build 与文档 governance，刷新生成的 test inventory；使用仓库 `validate-local-deploy` helper 执行 affected 检查与必要本地 prod-like build/health/provenance 检查。保留报告及失败诊断，修复后重跑相关门禁。

PR 描述引用本方案及结果。以最终 head SHA 审查实际 diff 和 AC，不以较早提交的 CI 作为证据。全部必要检查通过后按用户授权合并 main；同步 main 并核对 merge SHA。无需生产 rollout。回退为 revert 本次合并，无存储迁移。

## 实施结果

待实施及验证后回填；完成后按仓库规范移入 archive。
