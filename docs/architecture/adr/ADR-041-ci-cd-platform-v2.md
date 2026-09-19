---
tags:
  - adr
  - architecture
  - ci
  - cd
  - delivery
description: CI/CD Platform V2 解耦、artifact 晋级与可扩展交付平台决策
created: 2026-08-05T00:00:00Z
updated: 2026-08-05T12:45:00Z
---

# ADR-041: CI/CD Platform V2 解耦与可扩展交付平台

**Status:** Accepted

**Date:** 2026-08-05

**Refines:** ADR-001、ADR-013、ADR-040，以及当前 release workflow 约定

## Context

Test System V2 已经统一了测试文件归属、Nx targets、Scope Detector、Oracle 和 required checks，但
CI/CD 仍然存在平台层问题：

- 每个 job 都重复 checkout、toolchain setup、pnpm install 和 workspace 准备。
- workflow YAML 同时承担 scope 解释、环境准备、业务执行、结果聚合和发布逻辑，边界不清晰。
- Web shard 为隔离性重复启动数据库、API 和浏览器；API 构建结果没有成为明确的可验证 artifact。
- Nx cache、pnpm store、Playwright cache 和 build artifact 的语义混杂，无法知道何时可以安全复用。
- PR、nightly、release 的质量目标不同，但当前流程仍以“每条 workflow 自己准备并运行”为主。
- release 和 Docker deploy 仍可能重新安装依赖、重新构建，而不是晋级已经验证的 commit 产物。
- 现有 timing 证明墙钟约 8.5 分钟，但 runner-minutes 约 49–51 分钟，高于约 42.3 分钟目标。

继续在单个 workflow 中添加 cache、job 或条件判断，只会扩大隐式耦合，无法形成可扩展的平台契约。

## Decision

采用 CI/CD Platform V2，并把交付链路拆成六个逻辑平面：

1. **Control Plane**：一次生成 versioned delivery manifest，负责 scope、risk、policy 和 DAG。
2. **Workspace Plane**：统一 toolchain、依赖和可复现准备，不包含业务测试逻辑。
3. **Artifact Plane**：管理带 commit/digest 的 build、evidence 和 release artifact。
4. **Execution Plane**：以可插拔 lane 执行 validate、boundary、integration、web、coverage 和 performance。
5. **Observation Plane**：统一 timing、cache、failure classification、cost 和 summary。
6. **Release Plane**：采用 build-once, promote-many，验证过的 artifact 才能进入 main、tag 和生产。

### 1. 稳定契约优先于 workflow 细节

所有 plane 通过 versioned JSON manifest/receipt 连接。lane 不重新计算 affected scope，不通过隐含
环境变量传递状态，也不直接修改其他 lane。GitHub Actions 只是第一种执行适配器，不能成为架构接口。

### 2. 构建一次，产物晋级

同一 commit 的 API、Web 和 Docker 输入只构建一次；下游测试和部署消费 immutable artifact。Desktop
安装包是 OS/ABI 相关的例外：每个目标 OS 在 release tag 上各自只构建一次，并绑定 tag provenance，
不把不可移植产物跨 runner 复用。
Artifact 必须包含来源 commit、manifest digest、工具链版本、SBOM/attestation（适用时）和校验摘要。
缓存可以失效，artifact 不能静默覆盖。

### 3. 测试隔离与构建复用分离

真实数据库、浏览器状态、integration/E2E 数据仍按 lane 或 shard 隔离；只读 build artifact、依赖缓存
和 Playwright 浏览器可以复用。不得为了 runner-minutes 共享会改变测试结果的数据库或账号状态。

### 4. 风险驱动的 PR 选择与 nightly 兜底

Control Plane 根据 Nx graph、文件分类和 root inputs 生成 risk manifest，选择最小但完整的 PR lane。
docs-only、单包、runtime/database、Web flow 和 root/toolchain 变化使用不同验证集合；nightly full audit
继续发现 affected 漏检。风险选择不能降低对已经选中 lane 的质量门禁。
workflow 只读取 manifest 的 lane policy；它不能根据旧的 scope 输出重新决定是否创建 job。

### 5. 稳定 Oracle 与可插拔 child

GitHub ruleset 继续只依赖稳定 Oracle。新增 lane、平台或部署目标只需要注册能力、输入输出和 owner，
由对应 Oracle 或聚合器接入，不修改所有 workflow 的隐含分支。

### 6. 最小权限与 fail closed

PR 使用只读权限；生产 promotion 使用受保护环境、短期凭据和可审计身份。manifest 缺失、artifact
mismatch、权限错误或 detector failure 均 fail closed。只有明确 infrastructure/startup failure 才能
自动重试一次。

## Consequences

### Positive

- Scope、构建、测试和发布互相解耦，替换 GitHub Actions 或增加新 lane 的成本下降。
- 重复 workspace 准备和重复 API/build 工作可被测量并逐步消除。
- release 不再从未验证的工作区重复构建，回滚变成 digest 选择。
- 质量门禁、artifact 来源、失败分类和成本都有统一事实源。
- 新增 mobile、preview、contract audit 或新部署平台不需要复制整套 workflow。

### Negative

- 需要维护 manifest schema、artifact registry、lane adapter 和更严格的权限边界。
- artifact 上传/下载会引入网络和存储成本，必须用真实 timing 决定是否值得复用。
- build-once 要求构建产物在不同 runner/OS 上可重现；Desktop 多平台仍需分别构建。
- 风险分类错误会导致漏跑或过度运行，因此必须由 nightly full audit、治理测试和故意失败场景兜底。
- 迁移期需要 shadow mode 和一次性 required context 切换，不能长期保留双轨。

## Rejected Alternatives

### 继续只优化测试命令

拒绝。Web E2E 的真实执行、数据库隔离和单 worker 是主要下限；单独调整 Vitest/Playwright 参数无法
解决跨 job 的重复准备、artifact 重建和发布链路重复工作。

### 只增加 GitHub runner 或更激进并行

拒绝。它可以减少墙钟，却会增加 runner-minutes、资源竞争和状态隔离复杂度，不能解决构建与发布重复。

### 所有 job 共享一个数据库或一个长生命周期 runner

拒绝。共享状态会制造污染和非确定性；长生命周期 runner 又会引入不可见环境依赖和安全风险。

### 直接引入 Nx Cloud/第三方 CI 平台作为前提

拒绝。平台迁移不是当前问题的必要条件；先建立与执行器无关的 manifest、artifact 和 lane 契约，之后再
根据真实成本决定是否接入 remote cache 或其他执行平台。

### PR 始终运行全量测试

拒绝。它无法解决发布重复，也浪费单人维护者的反馈时间；risk-driven affected + nightly full 是更清晰的
质量模型。

## Enforcement

- `delivery-manifest-v1`、`lane-input-v1`、`lane-result-v1` 和 `artifact-manifest-v1` 必须有 schema、
  生成器和负向测试。
- 每个 lane 必须声明 owner、输入、输出、timeout、retry、cache 和 isolation policy。
- required Oracle 不能直接依赖未聚合的 matrix child。
- `Delivery Observation` 必须是 required context；它对 enabled lane evidence 缺失使用 fail-closed 语义。
- 生产发布只能消费已验证 artifact digest；release workflow 不得直接从源码重复构建同一 commit。
- 每次 run 必须产出 timing、cache、failure classification 和 manifest/artifact provenance。
- nightly full audit 必须定期验证 risk classifier 没有漏检 root、database、Web 和 release 输入。
- 新增 lane 或 artifact 类型必须更新本 ADR 关联的 registry、schema 和治理测试。
- 单人维护仓库的 branch ruleset 不要求 approving review；自动化 required Oracle、Delivery Observation、thread resolution
  和管理员审计仍然保留。该策略由 `ruleset-check` 作为治理契约校验。

## Implementation State

本分支已落地以下实现：

- `delivery-manifest-v1`、`lane-input-v1`、`lane-result-v1`、`lane-summary-v1`、`run-summary-v1`、
  `workspace-receipt-v1`、`artifact-manifest-v1`、`promotion-manifest-v1`、`timing-report-v1` 和
  `fault-injection-report-v1` 均有生成器、schema 和负向/正向测试；digest 会校验对象内容，而不是只
  校验格式。
- lane/artifact registry、capability-driven workspace action、artifact closure、Web/production
  source manifest 验证和 run-level observation 已接入 workflow。
- API runtime dependency closure 会从 workspace manifest 递归计算，只收集 `packages/*/dist`，并在
  Web shard 和 Docker deploy 中校验 digest、source manifest digest 以及完整目录集合后恢复。
- production promotion 强制 `api`、`api-runtime-closure`、`web`、`migrator`、`database`、
  `database-runtime` 六种产物；API prebuilt Docker path 同时检查 API、传递 workspace runtime
  closure、Migrator、Database runtime 和 Database package。
- `Delivery Observation` 对 manifest、lane evidence 和 run summary 使用 fail-closed 语义；缺失证据不会
  通过条件跳过。`run-fault-injection.mjs` 覆盖 detector、取消、manifest、artifact、runtime closure 和
  provenance/权限失败，`compare-timings.mjs` 只接受同 lane 集合且至少五次 comparable run。
- GitHub Actions adapter 通过 `collect-github-run-metrics.mjs` 读取 run/jobs 元数据，向 Observation 提供
  真实 `wallClockMs` 和 `runnerMinutes`；API 分页不完整、时间字段非法或权限不足均失败，不会回退为伪造的 0。

最终切换 PR [#210](https://github.com/BakerSean168/memoflow/pull/210) 的 fresh-run
[Actions run 31005675536](https://github.com/BakerSean168/memoflow/actions/runs/31005675536) 绑定 commit
`1f5d6bd388809ae786897a0a8ba09a4ea0ff588a`，Scope Detector、七个稳定 Oracle、四个 Web shard 和
`Delivery Observation` 全部通过。`run-summary-v1` 的 manifest digest 为
`b13809e6885089a4aa0a3993eac2c3e5e3e1266a2c935b8e29d7efcdebac5dff`，summary digest 为
`fcdb431a0436e5363eb1439e443b247de09020ddf0442b5b227c607807a42157`，`missingLanes: []`、无 failures；
setup 为 `382,139 ms`，lane execution 为 `1,890,704 ms`，最长 lane 为 `285,367 ms`。四个 Web evidence
artifact 使用唯一的 `shard-0..3` suffix，Web execution 合计 `1,124,792 ms`。

本地契约测试、schema/registry 检查、7 个 fail-closed 故障场景和 Test System V2 inventory/ruleset 检查也已通过；
远端 ruleset `9183921` 已同步为 8 个 required contexts（含 `Delivery Observation`），并保留单人维护者
`required_approving_review_count: 0`。仍需至少五次 comparable timing、一次 `main` 上的 scheduled fault
audit，以及一次 production promotion dry-run，才能把单次 fresh-run 转化为长期成本、恢复和发布证据；这些是
运营验收，不是再次设计或局部重构。

## References

- [CI/CD Platform V2 目标架构](../ci-cd-platform-v2.md)
- [CI/CD Platform V2 一次性重构计划](../../plan/archive/2026-08-05-ci-cd-platform-v2-refactor.md)
- [ADR-040: Test System V2](./ADR-040-test-system-v2.md)
- [CI 测试与反馈性能](../../test/ci-validation.md)
- [Release 工作流](../../guides/development/release-workflow.md)

## Decision Gate

本 ADR 已在契约、registry、workflow adapter、PR #210 fresh-run 和远端 ruleset 同步后保持 `Accepted`。
后续只需在 `main` 的日常运行中收集至少五次同范围 timing、执行 scheduled fault audit，并完成一次
production promotion dry-run；这些是切换后的运营证据，不是第二轮架构设计。
证据齐备后再将状态更新为 `Implemented` 并归档 Action Plan。
