---
tags: [plan, active, mcp, external-agent]
description: External Agent Gateway 实施总方案、验收矩阵与十个可独立验证的工作项
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# MemoFlow External Agent Gateway 实施方案

**当前状态：PAT + OAuth 六工具本地只读切片已交付。** PAT 六工具与 prod-like 已验证并提交 checkpoint `320dd1ac994`。用户于 2026-10-07 批准按更新的 ADR-117 继续 EAG-04A～04E 和 EAG-05；只实现只读 OAuth，不开放写工具。
实施基线：`3664f8da6a95174d24ae8f443f2d12b3ce223e33`；分支 `feat/external-agent-gateway-20261007`，保留开始时已有未提交修改。历史 SHA 是研究基线，不要求回退。
EAG-01 证据：[兼容报告](../../analysis/2026-10-07-eag-01-compatibility-evidence.md)。EAG-02：[纵向链路证据](../../analysis/2026-10-07-eag-02-goal-pat-evidence.md)。

## 阅读顺序

1. [仓库现状与纠偏](../../analysis/2026-10-07-external-agent-repository-assessment.md)：已有能力与真实差距。
2. [协议/认证官方研究](../../analysis/2026-10-07-external-agent-protocol-research.md)：2026 MCP、SDK、Better Auth 和客户端证据。
3. [架构规格](../../architecture/external-agent-gateway.md)：能力清单、数据流、契约、部署边界。
4. [ADR-116](../../architecture/adr/ADR-116-external-agent-capability-and-gateway-boundary.md)、[ADR-117](../../architecture/adr/ADR-117-external-agent-authorization-and-credentials.md)、[ADR-118](../../architecture/adr/ADR-118-external-agent-mutations-and-assisted-workflows.md)：边界、授权与可靠写入的取舍。
5. 本方案及下面的具体工作项：按依赖实施、逐项回填证据。

## PAT checkpoint 范围（历史交付）

本次先完成 PAT 认证的 6 个只读工具：Goal get/search、TaskPlan get/search、TaskOccurrence get/list。按 EAG-01 → EAG-02 → EAG-03 实施与真实数据库/prod-like 验证，交付可调用地址和客户端配置。OAuth 实现与真实 Codex/Claude OAuth 验收明确延期，不再作为本次 PAT 六工具交付的前置；不要求用户提供 HTTPS 开发域名或测试登录账户。

下述全量成功标准仍是后续方案，不能把本次只读交付等同于 EAG-01～10 全部完成。EAG-04/05 的 OAuth 工作延期；写入、其他 owner 与 assisted workflow 属于后续阶段，当前不实施。公共连接最终默认 OAuth 的架构方向保持，PAT 当前用于受控个人自动化。

## 当前 OAuth read 范围（用户于 2026-10-07 批准继续）

PAT 六工具 checkpoint 已独立提交；OAuth 现按 [EAG-04](./external-agent-gateway/2026-10-07-eag-04-oauth-and-connection-lifecycle.md) 的 A～E 切片实施，EAG-05 最终验收。协议与产品状态各有真值 owner，明确 offline_access、30 秒同结果重试、90 天授权总寿命和撤销后重新授权不得复活旧 token。两客户端首次闭环提前到 EAG-04C。下方旧 PAT 范围的延期记录不表示当前 OAuth 仍未授权；当前本地 OAuth 验证已完成，证据见 [EAG-04](../../analysis/2026-10-07-eag-04-oauth-read-evidence.md)，公共 rollout 独立验收。

## 1. 成功标准

用户通过 Codex 或 Claude Code 连接 MemoFlow，OAuth 授予有限权限后可读取自己的 Goal、TaskPlan、TaskOccurrence。扩展写权限后可以创建 Goal/KRs、创建和修改 TaskPlan、完成指定 Occurrence；不依赖 MemoFlow Web 页面保持打开、不调用第二层 LLM、不产生重复业务事实。

第一正式里程碑为 OAuth + 6 个 read tools。第二里程碑为可重放的 5 个 write tools。Reminder/Routine、更多聚合查询、Knowledge 与 assisted workflow 属于后续增量，不阻塞第一里程碑。

## 2. 工作项与依赖

每份工作项包含可观察结果、实现步骤、保护契约、验证和回退。编号只作为稳定引用，不引入额外的编排 runtime 或状态数据库。

| 工作项                                                                                                     | 交付行为                                            | 依赖                                     | 状态                                  |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| [EAG-01：基线与协议认证试验](./external-agent-gateway/2026-10-07-eag-01-baseline-and-protocol-spike.md)    | SDK/provider/client profile 有可重复证据            | 无                                       | 基线已验证；客户端闭环待04/05         |
| [EAG-02：Goal 私有只读接入](./external-agent-gateway/2026-10-07-eag-02-goal-read-pilot.md)                 | scoped PAT + goal_get/search + 隔离/审计            | 01                                       | 已实现并验证：Goal/PAT，证据见 EAG-02 |
| [EAG-03：Task 只读与重复提取](./external-agent-gateway/2026-10-07-eag-03-task-read-and-shared-contract.md) | 6 个 read tools；最小共同 descriptor                | 02                                       | 已实现并验证：PAT 六工具，OAuth 延期  |
| [EAG-04：OAuth 连接生命周期](./external-agent-gateway/2026-10-07-eag-04-oauth-and-connection-lifecycle.md) | 登录/注册、consent、refresh、revoke                 | 02；可与 03 独立推进                     | 已交付：本地 OAuth/CLI/UI/生命周期    |
| [EAG-05：只读版本验收](./external-agent-gateway/2026-10-07-eag-05-read-release-verification.md)            | 两客户端 + prod-like read journey                   | 03、04                                   | 本地验收通过：两 CLI、PG、HTTPS 制品  |
| [EAG-06：Goal 可靠写入](./external-agent-gateway/2026-10-07-eag-06-goal-mutation-receipts.md)              | goal_create/update，原子 receipt                    | 05                                       | 待实施                                |
| [EAG-07：TaskPlan 可靠写入](./external-agent-gateway/2026-10-07-eag-07-task-plan-mutations.md)             | task_plan_create/update，第二 owner 验证            | 06                                       | 待实施                                |
| [EAG-08：TaskOccurrence 完成](./external-agent-gateway/2026-10-07-eag-08-task-occurrence-completion.md)    | 显式测量选择、版本检查、可靠 KR 贡献                | 07                                       | 待实施                                |
| [EAG-09：更多真实 owner 能力](./external-agent-gateway/2026-10-07-eag-09-planner-routine-knowledge.md)     | 按子切片扩展 Planner/Notification/Routine/Knowledge | 05；写能力另依赖 08                      | 待实施                                |
| [EAG-10：Assisted Workflow 适配](./external-agent-gateway/2026-10-07-eag-10-assisted-workflow-adapter.md)  | handle/review/resume/cancel；可选 Tasks/MRTR        | 08；所需 owner slice；workflow seam 稳定 | 待实施                                |

主线：`01 → 02 → (03 + 04) → 05 → 06 → 07 → 08`。09 的只读部分可在 05 后推进；10 不阻塞 deterministic tools。

EAG-02 使用 PAT 是实现顺序，不改变公共默认 OAuth。没有 OAuth 时只能标注受控私测，不能把它宣传为公共连接体验已经完成。

## 3. 需要保护的契约

- Web/Desktop session 和 Desktop device flow 继续承担第一方登录；scoped OAuth/PAT 独立管理。
- 业务归属与状态机仍由 Goal/Task/Routine 等 owner 决定；MCP 不直接访问业务表。
- ExecutionContext 仍只有一份；source=http，客户端不能选择 identity/source。
- Goal 和 Task 的内部 UI/AI workflow 不被统一工具重构强迫改道；共享的只是相同业务操作的 contract/handler。
- TaskPlan/Occurrence、Goal initial KRs、Task Prompt complete-only、Task contribution/outbox 均保留既有语义。
- Reminder legacy 退役不撤回；本地 timer/knowledge 能力不伪装成 hosted 能力。
- 当前项目不需要迁移旧业务数据或维护双轨兼容。新增 auth/receipt 持久化按仓库 schema 流程提交，不借此建 migration framework。

## 4. Acceptance Criteria

以下状态按实际实施证据维护；部分子行为通过不等于整个验收项完成。

| AC     | 可观察结果                                                           | 必需证据                                      | 归属       | 状态                                                         |
| ------ | -------------------------------------------------------------------- | --------------------------------------------- | ---------- | ------------------------------------------------------------ |
| EAC-01 | 2026 MCP 正常发现/调用；unsupported profile 明确拒绝                 | SDK integration transcript，精确版本          | 01～03     | 本地已验证：SDK 2026 profile、Codex/Claude 各六工具          |
| EAC-02 | A 无法发现或读取 B 的业务内容；伪造 identity 不生效                  | 双账户 negative tests，拒绝前无 owner query   | 02、03     | 已实现并验证：Goal/Task 双账户、伪造 identity 拒绝           |
| EAC-03 | scope、audience、expiry、revoke、Account closure 都有效              | 真实 token/provider integration matrix        | 02、04     | 本地已验证：PAT/OAuth、在线授权与真实 PG 生命周期            |
| EAC-04 | OAuth 从 401 discovery 到 consent/callback 完成；refresh/revoke 闭环 | Codex 与 Claude Code 各一份记录               | 04、05     | 本地已验证：两 CLI OAuth/六工具；refresh、撤销与重连见证据   |
| EAC-05 | 6 个 read tools 有严格 input/output、有界分页、Product Time 语义     | contract tests、跨页和时间边界数据            | 03、05     | 已实现并验证：PAT/OAuth 共用六工具                           |
| EAC-06 | Goal create+KRs、update 调 owner；无 Assistant/DOM 依赖              | 真实数据库和 Web 可见结果                     | 06         | 未完成                                                       |
| EAC-07 | 同 key 重试/并发/响应丢失只产生一次 effect；异 body 拒绝             | 故障注入、重启、receipt/outbox 行数           | 06、07、08 | 未完成                                                       |
| EAC-08 | 旧版本写入明确 conflict；不覆盖他人修改                              | 两客户端并发测试、版本 unchanged 断言         | 06～08     | 未完成                                                       |
| EAC-09 | TaskPlan 和 Occurrence 清晰分离；Prompt 可以 record 或 complete-only | Task/Goal 行为测试与真实完成 journey          | 07、08     | 未完成                                                       |
| EAC-10 | 同一已共享操作在 Mastra/MCP 的 contract/owner effect 一致            | descriptor parity + 双 adapter fixture        | 03、09     | 明确延期至 EAG-09：目前仅 descriptor seam                    |
| EAC-11 | read/write/assisted 关闭开关、限流和 shutdown 行为确定               | prod-like 多实例/故障验证和脱敏 audit         | 05、08     | 部分完成：read 本地已验证；生产多容器演练及其他 lanes 待验收 |
| EAC-12 | 云端提醒不依赖 Agent 进程；local-only 能力不发布                     | Scheduler/Notification durable evidence       | 09         | 未完成                                                       |
| EAC-13 | workflow 重启可查询、revision 冲突、授权撤销及取消竞态正确           | restart/fault tests；支持/不支持 Tasks 客户端 | 10         | 未完成                                                       |
| EAC-14 | 文档宣称的制品与验证一致，无“本机可用=生产已交付”                    | Git SHA、OCI revision/digest、报告路径        | 每次发布   | 已实现并验证：本地源码/镜像一致；未发布生产                  |

## 5. 测试与交付顺序

每项先固定真实 owner 的 characterization，再对新增行为建立失败测试，完成最小 slice 后运行最近 targets。文档门禁固定为：

```bash
pnpm nx run memoflow:governance-check
pnpm nx run memoflow:docs-check
git diff --check
```

按修改范围运行 `pnpm nx run <project>:test`、`:typecheck`、`:lint`；Goal/Task 事务故障需各自 `test:integration`，不能仅靠 in-memory success 测试。新 `agent-gateway` target 在实际建包时通过 nx-mcp 确认并纳入仓库测试系统；不在尚不存在时声称命令可运行。

涉及 Gateway/auth runtime/env/deploy 的代码切片，按 [本地容器流程](../../guides/development/local.docker.md) 与仓库 validate-local-deploy skill 完成 `docker-compose.local.yml` 的 prod-like 验证。变更 final head、镜像身份、有效配置和测试账户数据必须能关联。客户端 OAuth/callback 使用实际可达 HTTPS dev origin，禁止绕过回跳或 token 验证来取得绿色结果。

本方案不安排现在部署生产。后续只有在该版本验收通过且 rollout 属于当时任务范围时，按现有 release workflow 发布；未实际运行的阶段明确标记未验证。

## 6. 回退与渐进发布

按 feature flags 启用私测 read → OAuth read → 普通 writes → 扩展 owner → assisted。write/assisted 关闭只停止新的执行，不删除 receipts、grant 或已提交业务对象。已有 workflow 继续按其 durable runtime 查询/取消和恢复政策处理。

故障时优先关闭对应 lane 并撤销受影响的 connection；保留脱敏日志与 receipts。代码回退不意味着删掉认证/幂等唯一性事实。用户既有 Web/Desktop 登录和 owner API 不依赖 Gateway 的开关。

## 7. 后续单列范围

SDK、CLI、Agent Skill、webhooks、设备 protocol、任意组合式 batch、逐操作审批 UI、额外客户端均在基本 Gateway 后按真实需求单列。API object model 和 capabilities 保持同一 owner，但不会自动生成全部渠道。

## 8. 本轮文档验证记录

2026-10-07 文档验证已完成：

- 本轮 21 个相关文档（18 个新增文件、3 个索引更新）通过 Prettier 格式检查；256 个本地链接目标存在。
- `pnpm nx run memoflow:docs-check` 通过。
- `pnpm nx run memoflow:governance-check` 通过，包含 6 个依赖任务；该次运行 7 项任务中 5 项命中 Nx cache，主治理检查实际执行。
- `git diff --check` 通过；本轮仅修改文档，未安装依赖或改动 runtime。
- 写作期间已有 Durable Workflow 文档由其他工作归档至 archive，已按 HEAD `3664f8da6a95174d24ae8f443f2d12b3ce223e33` 修正链接；不把该归档计入本轮交付。

该历史记录仅证明当时文档与治理一致性；当前实现证据见本页验收矩阵及各工作项，不作为 EAC-01～14 完整交付证据。

## 本次 PAT 六工具交付验收

此矩阵单独表示用户缩小后的受控交付，不替代上方全量 EAC。

| 验收项                                                             | 状态             | 证据                                                          |
| ------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------- |
| Scoped PAT 签发/脱敏列表/撤销、当前 scope/audience/expiry/账户关闭 | 已实现并验证     | EAG-02 真实 PG 与容器 SDK journey                             |
| Goal 两工具、TaskPlan 两工具、Occurrence 两工具                    | 已实现并验证     | EAG-03 官方 SDK modern/legacy 与真实 PG                       |
| 身份注入拒绝、两账户隔离、发现过滤之外调用时授权                   | 已实现并验证     | Gateway unit + API integration                                |
| 有界分页/响应、DST/overdue、固定 asOf、无读取生成事实              | 已实现并验证     | Task PG owner tests + SDK pagination                          |
| Task/Setting 数据库锁超时后连接释放、未知 cause 安全诊断           | 已实现并验证     | 审查修正后的真实 PG/API/Gateway tests                         |
| 最终源码镜像与六工具 prod-like SDK journey                         | 已实现并验证     | 新 revision e28ff26819be；完整 helper 与真实 SDK journey 通过 |
| 连接地址、PAT 管理 API 与 Codex 配置说明                           | 已实现           | [连接指南](../../guides/development/external-agent-pat.md)    |
| OAuth 与真实客户端 OAuth 闭环                                      | 明确延期         | 用户选择先交付 PAT + 六工具                                   |
| 写入与其他 owner/workflow、实际 Mastra parity                      | 未完成／后续阶段 | EAG-06～10；实际 parity 随 EAG-09                             |

最新证据与交接：[EAG-03](../../analysis/2026-10-07-eag-03-task-read-evidence.md)。
