---
tags:
  - testing
  - architecture
  - quality
description: MemoFlow T2 第一批行为测试审查与保留、补测、迁移候选的证据
created: 2026-10-24T00:00:00+08:00
updated: 2026-10-24T00:00:00+08:00
---

# T2：测试行为审查与迁移/退休决策（第一批）

> **当前 T2 阶段结论：[E2E 认证前置条件与 PR #602 测试退休审查](./test-architecture-t2-decision.md)。**
> [原 1,336 文件全量 AST 静态审查参考](./test-architecture-t2-full-audit.md)。
> 本文保留前 31 份实际人工抽样核对的证据。后续 1,305 文件已通过自动程序扫描，但不能因此算作人工逐项审定。

基线：2026-10-24 WSL main@88d452338；延续 [T1 四维架构](./test-architecture-t1.md)。
本批直接阅读测试源码、主要断言、业务边界与 Storybook play，形成抽样审查记录。
**本阶段没有删除或重写旧测试，没有修改 Test Inventory V3 的主要执行归属，没有修改 GitHub Actions。**

## 1. 审查证据的持久化与可信程度

权威审查记录：tools/test-system-v2/architecture-review-registry.json（v1）。

每一项包括：

- 文件路径、SHA-256 源码指纹。
- 明确的抽样审查范围 representative-assertions；**不代表全文件每个断言都完整审核**。
- 实际被测行为、代表断言、主语义分类与处理决策及其理由。
- 明确确认的真实依赖（例如数据库）；与仅推断的数据库依赖分开。
- replacement.status = none-verified：**当前没有任何通过等价证明的退休许可**。

工具会对文件指纹过期进行警告，并将该文件的人工分类和风险结论降级为机器候选。
审查清单元数据错误、非法分类、引用未收集文件、未经验证的退休申请会导致 Governance 校验失败。

四类决定：retain（保留）、supplement（补充覆盖）、browser-candidate（浏览器迁移候选）、
rework-source-assertions（后续用契约/AST 验证改良源码文本断言）。
其中后三项不等于本次已迁移或批准删除。

## 2. 抽样审查范围（第一批）

| 指标                            |                   数量 |
| ------------------------------- | ---------------------: |
| 原 Primary Inventory 文件       |                   1336 |
| 已抽样核验主要行为              |                     31 |
| 待审/过期                       |                   1305 |
| 单独核对的 Storybook Story 文件 | 2（共 6 个 play 场景） |
| 跨层重叠/互补/缺口分组          |                      6 |
| 明确修正的自动类型推断          |                      5 |
| 保留（retain）                  |                     25 |
| 需要补测（supplement）          |                      3 |
| Browser 候选                    |                      1 |
| 改良源码断言候选                |                      2 |
| **实际删除或批准退休**          |                  **0** |

### 2.1 五个 T1 误分类

| 文件（省略部分路径）            | T1 推断           | T2 确认     | 理由                                                             |
| ------------------------------- | ----------------- | ----------- | ---------------------------------------------------------------- |
| local-agent-runtime.spec.ts     | Source-constraint | Integration | 本地 SQLite、Agent Driver、仓储、缓存恢复；readFile 读运行时数据 |
| mastra-workflow.runtime.spec.ts | Source-constraint | Integration | Mastra/LibSQL 审批/恢复；readFile 读事件文件                     |
| ProfileSnapshotService.spec.ts  | Source-constraint | Unit        | 模拟 fetch、校验和、磁盘恢复，不是读取源码                       |
| repository.handlers.spec.ts     | Source-constraint | Contract    | HTTP Adapter 行为断言 + 1 项源文件单轨约束                       |
| authenticated-ipc.spec.ts       | Contract          | Unit        | 断言 IPC Auth wrapper 的本地异常与 Result 映射，不是 Schema      |

纠正的只是四维索引中的人工审核语义；以上 Primary Suite 仍然不变。

## 3. 真实边界 vs 模拟依赖

- apps/api/src/**tests**/integration/agent-gateway-write.integration.test.ts
  通过真实 Prisma/PostgreSQL 测试写入回执、冲突、跨 identity 拒绝。
- packages/database/src/schema/account-setting-cutover.integration.test.ts
  使用 pg Client 建立临时真实 Postgres 旧表，验证数据保留、幂等、失败回滚和锁等待。
- apps/api/src/**tests**/integration/express-auth-closure.integration.test.ts
  使用真实 Express/Supertest 调用链，但数据库是 Stub，**不属于真实 PostgreSQL 集成**。
- apps/desktop/src/main/database/**tests**/powersync-lifecycle.spec.ts
  PowerSync SDK 与 Electron 都是 Mock，只保护 Main 进程清理逻辑。
- apps/web/e2e/sync/goal-sync-regression.spec.ts
  真 Web/Desktop 双向同步与重启，属 specialized lane，缺常规 PR/Nightly 的自动化证据。
- apps/desktop/e2e/workspace-ipc.spec.mts
  真实 Windows Electron IPC；非 Windows 系统运行时会跳过，不可视为 Linux CI 已验证。
- packages/ai/src/evals/eval-runner.spec.ts
  Recorded Replay 下 Eval Dataset/质量回归/成本 p95；并非真实模型输出验收。

原 DATA-MIGRATION 风险矩阵遗漏了真实 PostgreSQL 的 Account/Setting Cutover Integration，
现已补回。这证明部分迁移测试已存在；**完整旧生产库升级链路及 Release 执行阶段仍未证明**。
OWNER-ISOLATION 也补充了真实 DB Agent write 的跨身份拒绝断言，但不能推出全模块已隔离。

## 4. 六组断言对比关系

| 关系                                                             | 结论                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| GoalDialog Happy DOM / Storybook / Web CRUD E2E                  | 分别保护草稿领域状态、浏览器 panel 交互、真实后端持久化；互补       |
| 任务选择器 aria-pressed / TaskPlanForm Storybook / Task CRUD E2E | **有缺口**：周期选项完整 Tab、Enter、Space 键盘操作未由现有样本证明 |
| PowerSync mocked 生命周期 / Web-Desktop Sync E2E                 | 主进程错误路径与真实数据同步不可互相替代                            |
| Migrator 命令列表 / Label 标准化 / PostgreSQL Cutover            | 配置编排、纯数据转换、真实旧表迁移回滚各自独立                      |
| Agent Gateway Postgres write / Agent Goal Approval fixture E2E   | 真实写入隔离与模拟 UI 审批互补，不代表真实 Provider 可用            |
| Visual geometry/ARIA / Task visual-grammar screenshot            | 几何断言不等于像素比较；后者为 reference lane，不能当 PR 必跑       |

两份 Storybook 文件各 3 个 play：
GoalDialog 的 panel 创建、验证恢复、保存失败草稿保留；
TaskPlanForm 的标题编辑、Escape/focus、只读和空态。
这些交互仍无法替代所有领域规则和端到端后端验证。

**所有六组 retirementDecision 均为 blocked-no-equivalent-replacement。**

## 5. 下一批优先队列

| 维度                           | 当前总文件 | 已抽样审查 | 待审 |
| ------------------------------ | ---------: | ---------: | ---: |
| Component                      |        167 |          2 |  165 |
| Contract                       |         84 |          2 |   82 |
| Integration                    |         58 |          7 |   51 |
| Boundary                       |         18 |          2 |   16 |
| E2E                            |         69 |          8 |   61 |
| Unit                           |        737 |          7 |  730 |
| Performance                    |          2 |          0 |    2 |
| Source-constraint（辅助 Role） |        125 |          3 |  122 |
| Governance（辅助 Role）        |         76 |          0 |   76 |

按 P0 证据、Source-constraint 误分类风险、交互需不需要浏览器、Contract 与真实 Integration 边界优先处理。
查询命令（仓库根目录）：

    node tools/test-system-v2/architecture.mjs --summary
    node tools/test-system-v2/architecture.mjs --reviews --limit 100
    node tools/test-system-v2/architecture.mjs --review-queue --type component --limit 30
    node tools/test-system-v2/architecture.mjs --review-queue --role source-constraint --limit 30
    node tools/test-system-v2/architecture.mjs --review-status pending --type contract --limit 30
    node tools/test-system-v2/architecture.mjs --decision browser-candidate
    node tools/test-system-v2/architecture.mjs --overlaps
    node tools/test-system-v2/architecture.mjs --risk DATA-MIGRATION
    node tools/test-system-v2/architecture.mjs --check

审查记录在清单中按源码路径定位；即使审查进展更新，测试 Primary Suite、Nx Target 和 CI 运行职责仍遵循
Test System V2 / Inventory V3 的已有契约。

## 6. 当前 T2 完成范围

完成第一批真实源代码审查、可追踪结果、五项纠错、风险矩阵修正、两份 Storybook 场景审查、
六组重复/互补判定和自动待审队列。

**T2 全量尚未完成**：需持续抽样升级至全面覆盖的 1305 个文件，确认旧源码断言的替代方案、
真实浏览器交互与真实模型/数据库验收的覆盖缺口，必要时建立相关补测任务。
任何测试删改仍须先证明新验证能等价替代旧断言，任何 CI 调整都需等 T5 门禁故障注入验收。

按单 worktree 严格串行继续；GitHub Issue 为任务与验收进展唯一真源。
