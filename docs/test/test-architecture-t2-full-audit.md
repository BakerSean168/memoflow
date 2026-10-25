# MemoFlow T2：测试架构全量静态审查报告

生成日期：2026-10-24；源码基线 main@88d452338（本地未提交 T1/T2 变更）。

> 这是可供人阅读的审查结果。**全量静态检查**和**逐条人工断言审查**是两种不同的完成标准。
> 静态信号属于排查候选，不能直接判定测试无效、质量通过或可以删除。

## 一、结论

- **全量自动扫描完成：1336 / 1,336 个文件。** 抽取约 **7570 个标准测试声明**，另 14 个测试工厂调用（参数化声明并非实际运行用例数）。
- **样本级人工核对：433 个文件**，其他 903 个仅完成 AST / 规则分析。这不等于全部文件的断言质量已经人工确认。
- **46 个文件出现至少一项待核实的静态线索**。线索包含条件跳过、在 helper 中断言、模拟浏览器、间接源码读取和 CI 车道未确认，不等于发现了 46 个缺陷。
- **已获得行为等价与真实执行证据、可以退休的测试：0 个。**
- 需要优先解决的是“误分类导致误删”和“业务高风险跨边界用例缺少真实门禁”，而不是压缩测试文件数量。

## 二、架构统计

| 主类型或辅助职责         | 文件数 | 人工抽样 | 命中静态线索 |
| ------------------------ | ------ | -------- | ------------ |
| boundary                 | 13     | 13       | 0            |
| component                | 174    | 73       | 43           |
| contract                 | 80     | 80       | 0            |
| e2e                      | 62     | 62       | 3            |
| integration              | 70     | 70       | 0            |
| performance              | 2      | 0        | 0            |
| unit                     | 766    | 40       | 0            |
| Governance (role)        | 78     | 0        | 0            |
| Source constraint (role) | 91     | 91       | 0            |

注意：Smoke 是 Integration 的一种执行职责，Source-constraint 与 Governance 是辅助 Role；不是所有行互斥可加总。

## 三、自动审查发现（仅排查线索）

| 标识                          | 优先度 | 涉及文件 | 解释                                           |
| ----------------------------- | ------ | -------- | ---------------------------------------------- |
| unbound-specialized-e2e       | medium | 3        | 专项 E2E 的 PR/Nightly 自动化入口未经证实      |
| browser-interaction-simulated | low    | 43       | 模拟 DOM 中验证键盘/焦点，需评估真实浏览器补测 |

**怎么看？** 重点关注高优先级和 P0 业务风险；多个信号可能来自同一个文件，文件数不可相加。
无直接 expect 并不意味着没有断言：例如同步 E2E 调用的 waitForGoalVisible 在 helper 中断言。
对 11 份带条件 skip 的文件检查调用位置：10 份是 Desktop/Windows 或操作员授权的专项场景，另 1 份 Web Provider 需要显式提供真实 Endpoint/Key。
这些具有明确的跳过前提，不应当被当成坏测试删除；仍需核对所需平台上的实际执行收据。

## 四、优先处理的审查线索（具体文件）

### 专项 E2E 的 PR/Nightly 自动化入口未经证实（3 个文件）

| 文件                                                       | 测试声明 | 排查原因                                                             |
| ---------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| apps/web/e2e/sync/goal-sync-regression.spec.ts             | 3        | canonical E2E has no configured PR/Nightly/Release automated binding |
| apps/desktop/e2e/authentication/desktop-auth-flow.spec.mts | 5        | canonical E2E has no configured PR/Nightly/Release automated binding |
| apps/desktop/e2e/packaged-runtime/packaged-runtime.spec.ts | 1        | canonical E2E has no configured PR/Nightly/Release automated binding |

### 模拟 DOM 中验证键盘/焦点，需评估真实浏览器补测（43 个文件）

| 文件                                                                        | 测试声明 | 排查原因                                  |
| --------------------------------------------------------------------------- | -------- | ----------------------------------------- |
| packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.spec.ts     | 45       | focus or key interaction in simulated DOM |
| apps/desktop/src/renderer/focus-window/FocusWindowApp.spec.ts               | 3        | focus or key interaction in simulated DOM |
| apps/desktop/src/renderer/intervention-window/InterventionWindowApp.spec.ts | 3        | focus or key interaction in simulated DOM |
| packages/app-vue/src/layouts/shell/AppShell.spec.ts                         | 19       | focus or key interaction in simulated DOM |
| packages/app-vue/src/layouts/shell/BusinessPanel.spec.ts                    | 11       | focus or key interaction in simulated DOM |
| packages/app-vue/src/layouts/shell/ConversationSidebar.spec.ts              | 8        | focus or key interaction in simulated DOM |
| packages/app-vue/src/layouts/shell/ManageAccountsDialog.spec.ts             | 6        | focus or key interaction in simulated DOM |
| packages/app-vue/src/layouts/shell/ModuleCapsule.spec.ts                    | 5        | focus or key interaction in simulated DOM |

只展示最靠前的 8 条；使用文末的筛选命令可看完整明细。

## 五、关键业务风险矩阵（11 项）

| 业务风险                | 已映射文件 | 待核实               | 业务影响/缺口摘录                                                                                                                |
| ----------------------- | ---------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| P0 AUTH-LOGIN           | 3 项       | 已映射（非执行证明） | 现有样本未证明登录表单组件行为与 API 权限拒绝分支完整对应。                                                                      |
| P0 GOAL-DRAFT           | 2 项       | 已映射（非执行证明） | 端到端草稿重启与持久 ID 一致性尚无经过本矩阵人工审定的证据。                                                                     |
| P1 TASK-RECURRENCE-A11Y | 2 项       | 已映射（非执行证明） | 样本证明了语义属性，但未证明完整键盘操作路径。                                                                                   |
| P0 WEB-DESKTOP-SYNC     | 2 项       | Phase 待完善         | 该跨端 E2E primaryCollector 为 specialized lane，未声明 GitHub workflow 自动归属；不能当作常规 PR required E2                    |
| P0 AI-APPROVAL          | 2 项       | 已映射（非执行证明） | Agent 写路径和 fixture 审批 UI 分别有验证；尚未证明真实 Provider/Approval Tool 权限回执从客户端到服务端的完整跨边界链路。        |
| P0 DESKTOP-IPC          | 3 项       | 已映射（非执行证明） | 已证实 Release Assets 调用 Windows Installed E2E，测试命令包含 workspace-ipc.spec.mts；仅为 conditional 配                       |
| P0 DESKTOP-UPDATE       | 3 项       | Phase 待完善         | 安装包真实安装/升级/回滚验收不由当前所列单元、IPC、治理测试直接证明。                                                            |
| P0 DATA-MIGRATION       | 3 项       | Phase 待完善         | 已有真实 PostgreSQL Account/Setting Cutover Integration；尚未证明从完整旧版生产数据库到当前版本的全链路 schema 升级、恢复演练    |
| P0 OWNER-ISOLATION      | 4 项       | 已映射（非执行证明） | 已有真实 DB Agent write 跨身份拒绝，但不代表全模块/全表双身份 Owner 隔离。闭户 HTTP 403 使用 Stub 数据库；需扩展多身份覆盖矩阵。 |
| P1 VISUAL-LAYOUT        | 2 项       | Phase 待完善         | 现有样本未证明全部视觉基线都在 PR 执行，需与 CI visual representative/full 审计关联核对。                                        |
| P0 AI-EVAL-QUALITY      | 2 项       | Env 待完善           | 当前审核样本属于 recorded replay；真实模型/外部 Provider 评测与其执行阶段尚未证实。                                              |

这是“测试架构风险证据”，不是“11 个产品 Bug”。没有实际 PR/Main/Nightly/Release 回执的地方仍需验证。

## 六、处理决策：哪些留，哪些改，哪些删？

| 决策         | 对象                                                   | 原因／后续条件                                               |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------ |
| 保留         | 大部分既有 Unit/Contract/Integration/E2E               | 不能因为相同组件或标题就认定重复；现有跨层行为不同           |
| 补测         | 周期选择器键盘行为；跨端同步专项执行；真实迁移升级恢复 | 明确新的断言与 Runner 后补上覆盖                             |
| 迁移候选     | 43 份 Simulated DOM 键盘/焦点信号候选                  | 只迁移真实浏览器不可替代的行为；数量是候选，不是强制迁移目标 |
| 审查源码断言 | 91 份 Source-constraint（部分路径间接构造）            | 把脆弱字符串锁优先转换为可靠的 AST/接口验证，不提前删除      |
| 安全删除     | 0 份具备完整替代执行证据                               | 等价断言 + 同条件运行 + CI 证据齐备之前不批准退休            |

已有人工复核的 **61 项主分类纠错** 保留于 architecture-review-registry.json，
特别是把运行时 SQLite/LibSQL 文件读取错分成源码静态检查的问题；分类修正不会改变现有 Suite/CI 执行。

## 七、工程下一步

1. 优先核实 Windows Electron 和 Specialized Sync E2E 的实际 Runner 与强制门禁，避免假绿灯。
2. 为 Task 周期选择器补真实键盘交互；将 GoalDialog/TaskPlanForm 的浏览器交互和模拟 DOM 规则分层。
3. 对“零直接断言”候选逐条检查 helper 或期待异常；只有确实不验证行为的用例才重写。
4. 审查 Source-constraint 的误报和源码文本锁，保留真正防止安全/架构回退的规则。
5. 核对所有 P0 数据升级与 Agent 实际跨边界场景，再以等价证明决定是否安全退休旧测试。

## 八、阅读与查询

以下命令从项目根目录执行：

```bash
# 生成这份人类可读的报告
node tools/test-system-v2/batch-audit.mjs --write-report

# 直接在终端输出简洁 Markdown 总览
node tools/test-system-v2/batch-audit.mjs --report

# 输出最优先的 30 个文件（Markdown 表格，不是 JSON）
node tools/test-system-v2/batch-audit.mjs --table --limit 30

# 按标志筛选
node tools/test-system-v2/batch-audit.mjs --table --finding no-direct-assertion

# 查询组件测试清单
node tools/test-system-v2/batch-audit.mjs --table --type component
```

## 九、证据边界

- 已完成所有文件可重复 AST 扫描、类型和辅助 Role 分组、质量线索采集、主要 CI 阶段绑定候选映射。
- 已对 433 份测试的代表性断言进行源码核对，但 **903 个尚未全量人工等价审查**。
- 本报告没有执行全量 E2E、全量真实数据库迁移、真实外部模型评测或完整发布升级路径。
- 静态审查不会自动修改测试、增删 Runner 或放宽 CI 门禁；所有“退休”必须有可追溯替代证据。
