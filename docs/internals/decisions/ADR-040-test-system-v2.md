---
tags:
  - adr
  - architecture
  - testing
  - ci
  - developer-experience
description: 测试唯一归属、Nx 执行契约、稳定 CI Oracle 与一次性切换决策
created: 2026-08-04T00:00:00+08:00
updated: 2026-08-05T10:00:00+08:00
---

# ADR-040: Test System V2 单一归属与稳定门禁

**Status:** Accepted

**Date:** 2026-08-04

**Implementation:** Implemented in PR [#204](https://github.com/BakerSean168/memoflow/pull/204)
**Refines:** ADR-013 的测试组织、执行入口与覆盖率门禁部分

## Context

MemoFlow 已经具备 unit、coverage、integration、smoke、Desktop IPC、Desktop main-process、
Web E2E 和 performance 等测试能力，也通过 Nx affected、Web 分片和 Boundary Oracle 将完整
PR 反馈时间从约 31 分钟降至约 10 分钟。

现有系统仍缺少一套贯穿测试文件、Nx target、CI job、GitHub ruleset 和质量报告的统一契约：

- 同一 Desktop 测试文件可能同时被 `test`、`test:ipc` 和 `test:main` 收集。
- suite 名称与实际收集范围不一致；IPC suite 会收集 database、AI、utils 和 bootstrap 测试。
- `Validate` 串行执行 lint、typecheck、test 和 build，成为完整 affected PR 的关键路径。
- 很短的 Boundary suite 分别承担 checkout 和依赖准备成本，增加 runner-minutes。
- coverage 只在 `main` push、nightly 和手工触发时运行，回退可能在合并后才暴露。
- 完整 governance target 已存在，但 PR 只运行 test-target governance。
- performance workflow 没有历史基线，且输出、阈值和实际被收集的 benchmark 不一致。
- GitHub `main` ruleset 曾处于 disabled，要求的旧 check context 已不存在；当前 Oracle 并非真正
  强制的合并门禁。

继续逐项修补会保留模糊边界，并让 workflow、target 和文档继续分叉。项目仍处于快速开发期，
不需要为旧测试入口或旧 CI check 保留兼容层。

## Decision

### 1. 每个测试文件只有一个主要 suite

- 每个测试文件必须被恰好一个主要执行 target 收集。
- `test` 是默认快速测试，只承载不需要真实外部边界的 unit、component 和 contract 行为。
- 数据库、HTTP 装配、IPC、Electron main-process 和浏览器流程必须进入专门 target。
- coverage 可以重新运行其所治理的快速测试，但它是质量测量，不构成第二个主要 suite。
- 测试归属使用明确的目录或文件后缀表达，不再依赖宽泛的 `**/__tests__/**` 推断语义。

### 2. Nx target 是唯一执行契约

标准 target vocabulary 为：

- `test`
- `test:coverage`
- `test:integration`
- `test:smoke`
- `test:boundary`
- `test:perf`
- `test:governance`
- `e2e`

项目可以保留内部子 target，例如 Desktop 的 `test:ipc` 和 `test:main`，但 CI 和跨项目编排只依赖
标准 target。项目脚本、文档和 CI 不直接把底层 Vitest 或 Playwright 命令作为公共入口。

### 3. affected scope 只计算一次

- CI 使用单一 Scope Detector 从同一 `NX_BASE` / `NX_HEAD` 计算受影响项目和可用 target。
- detector 输出结构化 scope，后续 jobs 不再各自重新解释影响范围。
- 根配置对项目的影响由 Nx inputs 契约表达；不使用临时 paths 条件绕过项目图。
- nightly 和手工 full run 不使用 affected 结果，负责发现项目图或 inputs 漏检。

### 4. 稳定 Oracle 是 GitHub 合并契约

CI 子任务可以按 affected scope 跳过或使用 matrix 扩缩，但以下 Oracle 名称保持稳定并始终出现：

- `Governance Oracle`
- `Validate Oracle`
- `Boundary Oracle`
- `Integration Oracle`
- `Web Flow Oracle`
- `Coverage Oracle`
- `Performance Oracle`

Oracle 必须区分合法跳过、成功、失败、取消和 detector 失败。合法未受影响时成功；应执行但没有成功
时失败。GitHub `main` ruleset 只依赖这些稳定 Oracle，不直接依赖动态 matrix 子任务。

### 5. PR affected 门禁与 nightly full 审计并存

- PR 运行 affected unit、boundary、integration、smoke、E2E 和 coverage。
- governance 始终运行，因为它同时验证仓库级规则和 scope 契约。
- nightly 运行完整 coverage、全量关键集成测试和环境敏感性能实验。
- `main` push 保留最终审计，但不代替 PR 合并前门禁。

### 6. 缓存只覆盖确定性任务

- lint、typecheck、build、unit 和确定性 coverage 可以使用 Nx cache。
- integration、E2E、真实网络、真实数据库和性能采样默认不缓存。
- remote cache 只在明确凭据、保留期限、写入信任和污染恢复策略后启用。
- 不通过缓存掩盖 flaky test 或环境依赖。

### 7. 性能预算与性能实验分离

- PR 只强制确定性、可重复、容忍共享 runner 噪声的 performance budget。
- 真实数据库、内存、GC、长时间采样和趋势比较进入 nightly/informational workflow。
- 所有性能阈值由测试或结构化基线定义；workflow 不重复维护另一套说明文本。
- 伪 HTTP、伪数据库等模拟测试不得命名为真实 E2E 或真实数据库 benchmark。

### 8. 一次性切换，不保留旧新双轨

- 在独立重构分支完成 inventory、配置、targets、workflows、ruleset 和文档。
- 主分支只接收完成后的 V2，不保留旧 workflow、旧 suite glob 或兼容别名。
- 分支内部允许小提交保持可审查和可回退；合并边界仍是一次原子切换。

## Consequences

### Positive

- suite 名称、测试文件归属和 CI 结果表达同一事实。
- 消除重复执行和因错误收集产生的虚假覆盖感。
- affected PR 保持快速，nightly full run 提供漏检保险。
- GitHub ruleset 真正强制质量门禁，Oracle 名称不受 matrix 和 affected scope 变化影响。
- CI 可以同时优化墙钟时间、runner-minutes、失败可见性和维护复杂度。
- 测试系统可以通过治理脚本自证完整性，而不是依赖人工记忆。

### Negative

- 需要一次性重命名或移动现有测试并重写多个项目 target。
- 大型 CI DAG 重构的初始审查和验证成本较高。
- 并行 Validate 可能重复依赖构建；必须以真实 runner 数据决定组合方式。
- 受影响覆盖率只能证明项目图识别到的范围，因此仍需 nightly full 审计。
- 启用 ruleset 后，任何 Oracle 配置错误都会阻止合并，需要保留管理员级紧急恢复流程。

## Rejected Alternatives

### 继续局部修补当前 workflow

拒绝。它不能消除 Desktop suite 重叠、target vocabulary 漂移和未强制 ruleset 等根因。

### 每个测试类型拆成独立 job

拒绝。短任务的 checkout/install 成本可能远高于实际测试，最大并行度不等于最低成本。

### 所有 PR 始终运行全量测试

拒绝。它忽略 Nx 项目图的价值并显著增加反馈时间；nightly full run 是更合适的完整性保险。

### 保留 V1 与 V2 长期双轨

拒绝。项目不要求兼容旧测试入口，双轨会制造重复执行、冲突门禁和长期清理债务。

### 仅使用 GitHub paths filter

拒绝。paths filter 不理解 Nx 依赖图，且被过滤掉的 required workflow 可能产生永久 pending check。

## Enforcement

- 测试治理必须验证未归属文件、重复归属、target 缺失、配置漂移和非法缓存策略。
- CI workflow 必须通过 actionlint、结构化 Oracle 单元测试和合法跳过场景验证。
- ruleset required contexts 必须与当前 Oracle job name 完全一致。
- 新增测试类型前先扩展标准 vocabulary 或在 ADR 中说明例外。
- 任何 target 或 suite 边界变化必须同步更新 `docs/test` 的 canonical 说明。

## References

- [Test System V2 目标设计](../testing/test-system-v2.md)
- [Test System V2 一次性重构计划与验收记录](https://github.com/BakerSean168/memoflow/blob/7a45112e1840950ead1ba98b748fc70fa1b38344/docs/plan/archive/2026-08-04-test-system-v2-refactor.md)
- [ADR-013: Standard Testing Strategy](./ADR-013-standard-testing-strategy.md)
- [CI 测试与反馈性能](../testing/ci-validation.md)
