---
tags:
  - testing
  - architecture
  - ci
description: MemoFlow Test System V2 / Inventory V3 的正交四维测试分类与行为风险覆盖索引
created: 2026-10-24T00:00:00+08:00
updated: 2026-10-24T00:00:00+08:00
---

# T1：正交四维测试分类与风险覆盖索引

起始基线：2026-10-24 WSL main@88d452338。本工具在 **Test Inventory V3** 上建立只读、可查询的语义视图，
不引入第二个执行器、新的 Nx 任务图或额外 CI lane。原有 Primary Suite / Collector 仍是唯一执行归属真源。

## 1. 四个独立维度

| 维度                                   | 字段                   | 合法分类                                                                             | 回答的问题         |
| -------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| Test Type（互斥主类型）                | testType               | unit / component / contract / integration / boundary / e2e / performance             | 被验证的对象与范围 |
| Verification Dimension（多选标签）     | verificationDimensions | functional / visual / accessibility / security / reliability / ai-evaluation         | 验证什么质量属性   |
| Execution Environment（运行时 + 依赖） | executionEnvironment   | node / simulated-dom / real-browser / electron，外部依赖 database / external-service | 实际或候选运行条件 |
| Execution Phase（五阶段，各自有状态）  | executionPhases        | local / pr / main / nightly / release                                                | 何时可以或可能执行 |

四维与测试原归属正交。例如：

    GoalDialog.spec.ts
      primarySuite = unit（原归属不变）
      testType = component
      dimensions = functional + accessibility + reliability（自动候选）
      runtime = simulated-dom（Vitest happy-dom）
      local = available；PR / Main = conditional
      是否实际在 PR 运行 = 未由此索引证明

    apps/web/e2e/visual-regression/matrix.spec.ts
      testType = e2e
      dimensions = functional + visual + accessibility（自动候选）
      runtime = real-browser
      visual 基于几何、焦点与 aria 断言，不等同于像素截图比较

    packages/ai/src/evals/eval-runner.spec.ts
      testType = unit
      dimensions = functional + ai-evaluation（自动候选）
      evaluationMode = recorded-replay
      证明回放评测框架的行为，不代表真实 Provider 质量验收

### 1.1 Smoke / Governance / Structural 不强行当作同层类型

| testRole          | testType       | 说明                                              |
| ----------------- | -------------- | ------------------------------------------------- |
| behavior          | 七个主类型之一 | 常规行为测试                                      |
| smoke             | integration    | HTTP 装配与基本健康验证；Primary Suite 仍为 smoke |
| governance        | null           | 仓库级元规则，不是产品测试层级                    |
| source-constraint | null           | 源码文本形态断言候选（旧 Unit 执行归属保留）      |

这样既不会将源码字符串断言冒充业务 Unit，也不会创造一个独立 Structural Test Job。
原有 boundary / domain / purpose 仍是补充索引字段，但不作为四个主维度。

## 2. 分类策略与证据可信度

- Test Type 根据现有 primary suite、Vue mount、契约路径等信号推断。
- Visual 需要截图比较断言或布局几何断言信号；纯截图留档不代表视觉回归测试。
- Accessibility 依据 aria、可访问名称、焦点、axe 等断言信号推断；键盘和屏幕阅读器真实可用性仍待评审。
- Security 由权限拒绝、401/403、账号隔离、秘密泄露等断言词汇推断。
- Reliability 由重启、恢复、回滚、重试、幂等等断言相关信号推断。
- AI Evaluation 需要执行评测 Dataset + Executor / 比较器；评测报告文件格式测试不能算模型质量评测。
- Functional 标记常规产品测试的验证意图，不自动赋给 Governance 或 Source-constraint。

**所有自动识别都是 candidate，不是人工证实，更不是 CI 执行证明。**
在行为矩阵里，只有对具体行为实际阅读断言后的样本，才可以写
review=assertion-reviewed 与 verifiedDimensions，且只针对对应 behaviorClaim。

### 2.1 Execution Environment 不能混淆

Runtime 根据 Vitest collector 配置、文件环境声明与 Playwright collector 推断：
Node、Simulated DOM、Real Browser 或 Electron。
Database 属于候选的外部依赖，不能仅凭 Integration 名称宣称已验证真实 PostgreSQL。
External Service 只有在外部 Provider 真实调用被核实后才能确认为依赖；当前不凭空标记真实模型。

### 2.2 Execution Phase 不是实际执行记录

| 状态          | 含义                                                   |
| ------------- | ------------------------------------------------------ |
| available     | 有显式执行入口，但可能缺 OS / DB / 凭据                |
| conditional   | Workflow / Nx affected / collector 声明了有条件执行    |
| not-confirmed | 当前证据未能确认阶段绑定，不能推断该测试一定不会被执行 |

PR / Main 非 E2E 以 CI 脚本与 Suite 选测规则判断可能归属；E2E 以 Inventory V3 主 collector
及 e2e-ownership 的自动化绑定判断。Nightly 仅对确有对应自动化或覆盖率测量绑定的文件标记 conditional。
Nightly coverage measurement **不等于**整套 Unit 测试重跑。
Release 不能由 Release Workflow 存在就自动推断每一个测试已参与发布验收。
任何阶段的 conditional 都不是 GitHub Run / SHA / Shard Receipt / 测试报告证据。

例如跨端同步的 goal-sync-regression.spec.ts 主归属是 specialized E2E，PR 与 Nightly 均未在该元数据中
确认自动绑定，不能当作普通 PR 的 required Web Flow 证据。

## 3. 初始统计（2026-10-30 于本分支实测，语义均为自动候选）

基线：main@30618e2db。运行 `node tools/test-system-v2/architecture.mjs --summary` 得到。

Primary Suite **完全未变**：unit 1147、integration 58、smoke 3、
boundary 18、e2e 41、perf 2、governance 89；总计 **1358** 个文件。

| 语义 Test Type               |   文件数 |
| ---------------------------- | -------: |
| Unit                         |      795 |
| Component                    |      171 |
| Contract                     |       68 |
| Integration（含 Smoke）      |       65 |
| Boundary                     |       14 |
| E2E                          |       37 |
| Performance                  |        2 |
| **有主语义类型的小计**       | **1152** |
| 辅助 Role：Governance        |       89 |
| 辅助 Role：Source-constraint |      117 |
| **Primary Files 总计**       | **1358** |

Verification Dimensions 可重叠，数量不可求和：
Functional 1152、Accessibility 57、Visual 9、Security 131、Reliability 250、AI Evaluation 1。
后五项为静态候选，不能将其计为已人工验证的测试覆盖。

Storybook 另外有 71 个 Stories，4 个文件检测到 play 函数。
Stories 单独索引，不包含在 1358 个 Primary Files，也不自动算作 PR 成功的组件测试。

## 4. 行为风险矩阵与治理契约

权威矩阵文件：tools/test-system-v2/behavior-risk-matrix.json（v2）。
包含风险 ID、严重度、行为、失败影响、期望四维、采样测试文件、审核状态、
具体 behaviorClaim、verifiedDimensions、knownGaps；查询可见缺失的维度、类型、环境或阶段。

初始 11 个关键风险场景：登录、Goal 草稿、任务无障碍、跨端同步、Agent 审批、
Desktop IPC、桌面更新、数据库迁移、Owner 隔离、视觉布局、AI Evaluation。
当前全部保留明确待确认项；这 **不是** 全业务风险目录，也不等于发现 11 个产品缺陷。

特别关注：

1. Web/Desktop 同步 E2E 有真实双向流程断言，却无声明的常规 PR/Nightly 自动归属。
2. Visual Test 需要区分几何断言、图片快照比较和纯留存截图。
3. AI Eval 现有 Dataset + Recorded Replay 与质量比较，缺真实模型的评测阶段验证。
4. Data Migration 缺本矩阵已映射和人工核验的完整旧版本到新版本 DB 验收证据。

### 可用查询

从仓库根目录执行（可用 package script pnpm test:architecture，以下避免依赖启动副作用，直接用 node）：

    node tools/test-system-v2/architecture.mjs --summary
    node tools/test-system-v2/architecture.mjs --type component --domain goal
    node tools/test-system-v2/architecture.mjs --dimension accessibility --environment simulated-dom
    node tools/test-system-v2/architecture.mjs --dimension visual --environment real-browser
    node tools/test-system-v2/architecture.mjs --dimension ai-evaluation --evaluation-mode recorded-replay
    node tools/test-system-v2/architecture.mjs --role source-constraint
    node tools/test-system-v2/architecture.mjs --phase pr --phase-status conditional
    node tools/test-system-v2/architecture.mjs --phase nightly --phase-status not-confirmed
    node tools/test-system-v2/architecture.mjs --risk AI-EVAL-QUALITY
    node tools/test-system-v2/architecture.mjs --stories --domain task
    node tools/test-system-v2/architecture.mjs --check
    node tools/test-system-v2/inventory.mjs --check

查询实时读取 Inventory、测试源文件、Vitest 配置、CI/Nightly Workflow 和风险矩阵，
不长期持有独立的 1358 行影子数据副本。
architecture --check 检查元数据、分类、风险路径与一致性，明确保留 open risk gaps，
**不会把缺口评为通过的业务质量**。原 Inventory V3 继续核实 primary ownership 和 E2E ownership。
二者接入原 test-system-v2:test:governance；未变更 GitHub Actions。

## 5. T2 审查建议和范围边界

本阶段完成：四维词表、完整文件归类、可查询索引、审计风险矩阵、校验规则与回归测试。
本阶段**尚未**完成人工逐项复核全部文件，不改变任何测试实际运行的 executor/target。

T2 优先逐项审查：Component 在 Happy DOM vs Browser Mode 的边界；
Visual 像素快照与几何约束；A11y 键盘、焦点、axe 与实际交互；
AI Eval 录制回放 vs 真实模型与质量门禁；
Source-constraint 的行为覆盖替代；同步、迁移、授权、安装升级等 P0 边界的实际 CI 证据。

先证明替代测试行为等价，再移除旧测试；先验证新流水线能拦截原错误，再退休旧门禁。
T1 不重构 Storybook、没有 Live Model 调用，也不修改 GitHub Actions。
