---
tags:
  - plan
  - active
  - ci
  - cd
  - architecture
description: CI/CD Platform V2 解耦、可扩展交付平台的一次性重构计划
created: 2026-08-05T00:00:00Z
updated: 2026-08-05T12:45:00Z
---

# CI/CD Platform V2 一次性重构计划

## 状态与范围

- **计划状态**：**Archived（2026-08-19）**。Architecture implementation and PR cutover complete；运营证据窗口已关——baseline-v1（7 同范围 run）已采集并记录偏差，DoD 性能项确认未达标，按偏差接受归档（不占用更多 CI run 强优化）。
- **目标 ADR**：[ADR-041: CI/CD Platform V2 解耦与可扩展交付平台](../../architecture/adr/ADR-041-ci-cd-platform-v2.md)
- **目标架构**：[CI/CD Platform V2](../../architecture/ci-cd-platform-v2.md)
- **前置决策**：[ADR-040: Test System V2](../../architecture/adr/ADR-040-test-system-v2.md)
- **实施方式**：单一重构分支、一个最终切换 PR；分支内允许可回退的小提交，但旧 workflow 不进入 main。
- **不在本计划内**：产品功能、业务测试行为、降低 coverage、删除 E2E、引入 Nx Cloud 作为硬依赖。

本计划不是“继续逐个优化 job”的 backlog，而是一次把 CI/CD 重新分层的实施方案。每个 work package
都有明确的输入、输出和验收，不允许通过临时 YAML 分支形成新的隐性双轨。

## Branch Implementation Ledger

本分支已经把平台契约和主流程一次性收敛到以下边界；剩余项目是验证和切换证据，不是再设计一轮
workflow：

| Work package               | 当前状态                                                        | 证据                                                                                                           |
| -------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| W0 baseline/capacity       | 已采集 7 次 comparable run（2026-08-16），DoD 性能项未达标      | `reports/ci-cd-platform-v2/baseline-v1.json`：墙钟 P50 10.66min（目标 7-8）、runner-min P50 49.88（目标 42.3） |
| W1 contracts/schema        | 已实现                                                          | `tools/ci-cd-platform/schemas/`、digest negative tests                                                         |
| W2 workspace/capabilities  | 已实现                                                          | `setup-nx-affected-job`、`workspace-receipt-v1`                                                                |
| W3 control/risk/DAG input  | 已实现                                                          | `generate-delivery-manifest`、`create-lane-input`                                                              |
| W4 immutable artifacts     | 已实现                                                          | artifact registry、content/source digest verifier、API runtime closure、Docker prebuilt checks                 |
| W5 lane execution          | 已实现                                                          | lane registry、lane result、stable Oracle workflow                                                             |
| W6 isolation contract      | 已实现/保留真实隔离                                             | boundary/integration/Web 独立 PostgreSQL service 与 lane policy                                                |
| W7 observation/budget data | 已实现                                                          | lane/run summary、GitHub run metrics adapter、fail-closed observation、`compare-timings` P50/P95               |
| W8 nightly audit           | 已接入；main scheduled evidence 待执行                          | coverage/performance full workflow 复用同一 manifest/input contract                                            |
| W9 release promotion       | 已实现                                                          | production artifact closure、promotion manifest、verified download                                             |
| W10 governance/security    | 已实现                                                          | ruleset check、最小权限、fail-closed verifier                                                                  |
| W11 shadow/fault injection | 本地矩阵与 PR #210 evidence 已通过；main scheduled audit 待执行 | `run-fault-injection.mjs`、`ci-platform-audit.yml`、22 项平台测试                                              |
| W12 cutover/archive        | PR #210 cutover 已完成；长期指标后归档                          | required context 已同步、旧入口清理和最终运营证据                                                              |

W11/W12 不会产生第二套实现；它们只验证已经完成的契约，并在证据充分后把本计划归档。

## 运营证据窗口偏差记录（2026-08-19 归档前）

`reports/ci-cd-platform-v2/baseline-v1.json` 已采集 7 次同范围 comparable run
（2026-08-16），作为最终运营证据：

| 指标       |  实测 P50 | DoD 目标 |               偏差 |
| ---------- | --------: | -------: | -----------------: |
| wallClock  | 10.66 min |  7–8 min | **-26%（未达标）** |
| runner-min |     49.88 |     42.3 | **-15%（未达标）** |

瓶颈定位（PR #245 run 32213541128 实际 job 墙钟）：总墙钟 10.6 min 由
`Scope → Unit Tests(6.3) → Verification Children(6.5) → Web Flow 4×shard(各 6.4) → Oracle`
串行链决定；runner-min 大头是 Web Flow 4 parallel shard（≈4×6.4 = 25 runner-min）。

**归档决定（Alex 2026-08-19）**：DoD 性能项确认未达标，但接受为按偏差归档——不强行为此
优化 CI（Unit/Typecheck 并行化、Web shard 拆分等会占用大量 GitHub Actions run 时间且引入
workflow 回归风险），架构/契约/运营闭环已全部验证。CI 性能优化如有需要可作为独立 backlog
记录，不纳入本计划。W8/W11 的 main scheduled audit 亦按证据已足归档（契约已由本地矩阵与
PR #210 evidence 通过）。

## Remote Evidence Checkpoint

最终切换 PR [#210](https://github.com/BakerSean168/memoflow/pull/210) 的 fresh-run
[Actions run 31005675536](https://github.com/BakerSean168/memoflow/actions/runs/31005675536) 绑定 commit
`1f5d6bd388809ae786897a0a8ba09a4ea0ff588a`，结果为 success。七个稳定 Oracle、四个 Web shard 和
`Delivery Observation` 全部通过；`run-summary-v1` 记录 7 个 lane、`missingLanes: []`、无 failures，
manifest digest 为 `b13809e6885089a4aa0a3993eac2c3e5e3e1266a2c935b8e29d7efcdebac5dff`，summary digest 为
`fcdb431a0436e5363eb1439e443b247de09020ddf0442b5b227c607807a42157`。setup 为 `382,139 ms`，lane
execution 为 `1,890,704 ms`，最长 lane 为 `285,367 ms`；四个 Web shard execution 合计 `1,124,792 ms`，
且 evidence artifact 名称带唯一 `shard-0..3` suffix。

该 fresh-run 证明最终切换 PR 的 manifest、artifact closure、Oracle 和 evidence observation 闭环工作，不证明
长期 P50/P95 或 runner-minute 预算已经达标。此前下载的历史 run summary 由旧 adapter 生成，
`wallClockMs`/`runnerMinutes` 不完整，因此不作为 comparable timing 输入；修复后的 adapter 从后续 fresh run
开始建立新的基线，避免把缺失指标当成 0 或伪造数据。

### 历史实现参考（非 comparable timing 输入）

前一轮 PR run [30998745996](https://github.com/BakerSean168/memoflow/actions/runs/30998745996) 绑定
commit `c17b9c2d26e75198a7365ab8fc5365b8387c363b`，结果为 success。四个 Web shard 均完成
`api-runtime-closure` 恢复、API/Web/Database artifact digest 校验、数据库初始化和 Playwright；
`Delivery Observation` 的 `run-summary-v1` 记录 7 个 lane、`missingLanes: []`、无 failures，
manifest digest 为 `6765b888d8eaed32786f8584056c1efcc632581fcce79266cc5c762a0e953e16`，summary digest
为 `69f7af0590a5c6e99569cb46c336a34ae9b6470ac25bb52ebabff87b7af92484`。setup 为 `270,994 ms`，lane
execution 为 `1,079,501 ms`，最长 lane 为 `283,413 ms`；Actions 墙钟约 11:15，Web shard job 为
5:41、5:43、5:44、6:02。

本地使用该 run 的 immutable build artifacts，并补齐 main/release 才会生成的 database-runtime artifact，
执行了 production promotion dry-run；receipt digest 为
`12470f0f5d104adc4d2faa3c310ed061f63691c3d6d9559a73d41b2d3fa26174`，六件 artifact closure 全部通过
`promotion-manifest-v1` 校验。该 dry-run 不代表已向真实生产环境发布。

该证据证明本次结构性重构在 fresh runner 上闭环工作，不证明长期 P50/P95 或 runner-minute 预算已经
达标。计划剩余的验收证据是：

- 至少 5 次同范围 run 的 queue/setup/execution/post、artifact download、Web shard balance 和 runner-minute 对比；完成后才生成 `reports/ci-cd-platform-v2/baseline-v1.json`。
- 合并到 main 后的 scheduled fault audit：detector failure、artifact mismatch、closure entry 缺失、取消和权限
  失败必须 fail closed；本地与 PR #210 已先验证同一契约。
- 远端 ruleset `9183921` 已同步 8 个 required contexts；单人维护者 review 数保持为 0，thread resolution、
  禁止删除 main 和禁止 non-fast-forward 仍然强制。

## 设计不变量

1. Control Plane 只生成 manifest，不执行业务测试。
2. Workspace Plane 只准备工具链和依赖，不解释 scope。
3. Execution Plane 只消费 lane input，不修改其他 lane 状态。
4. Artifact Plane 只保存带 SHA/digest 的不可变产物；cache 不能替代 artifact。
5. Release Plane 只晋级已验证产物，不从同一 commit 的源码重复构建。
6. 所有 lane 都有 owner、timeout、retry、cache、isolation 和 failure policy。
7. Oracle 名称稳定，动态 child 可变化但不能绕过聚合门禁。

## 目标交付拓扑

```text
event -> scope/risk manifest -> policy DAG
                         |
          +--------------+---------------+
          |                              |
   prepare/toolchain                 build/package
          |                              |
          +---------- immutable artifacts
                         |
      validate | boundary | integration | web | coverage | perf
                         |
          Oracle -> evidence -> cost/provenance summary
                         |
            main/tag -> promote -> deploy -> smoke/rollback
```

## Work Packages

### W0：冻结基线、边界和容量模型

**目标**：建立可比较的事实，确认当前成本究竟来自测试、准备、构建、artifact 还是 queue。

**任务**：

- 采集至少 5 次同范围 PR run 的 queue/setup/execution/post、runner-minutes 和 cache 命中。
- 分别记录 docs-only、普通 package、runtime/database、Web flow、root/lockfile 和 full affected。
- 给当前 `.github/workflows/*`、`.github/actions/*`、Docker/release workflow 建立 ownership map。
- 记录 API/Web/Desktop build 输入、产物路径、是否可重现和当前重复构建点。
- 标出所有 secret、environment protection、artifact retention 和 cache writer。

**交付物**：

- `reports/ci-cd-platform-v2/baseline-v1.json`（机器可读）。
- 当前 workflow/lane/artifact/permission map。
- 成本模型：不可消除的测试执行成本 vs 可优化的平台成本。

**验收**：同一 SHA 的 run 可区分 queue、setup、execution 和 post；没有用 billing API 的 0 值替代 runner-minute。

### W1：冻结平台契约和 schema

**目标**：先定义解耦接口，再实现 workflow，防止 YAML 重新成为隐式接口。

**任务**：

- 定义并版本化 `delivery-manifest-v1`、`lane-input-v1`、`lane-result-v1`、`artifact-manifest-v1`。
- 定义 `scope`、`risk`、`policy`、`dag`、`provenance`、`cache`、`isolation` 和 `failure` 字段。
- 编写 JSON schema、TypeScript 类型、生成器和 unknown/missing/invalid 的负向测试。
- 规定 schema version、generator version、input digest 和 commit SHA 的绑定。

**交付物**：`tools/ci-cd-platform/` 契约库、schema、fixtures、README 和 governance target。

**验收**：manifest 缺字段、SHA 不匹配、artifact digest 错误和未知 lane 都 fail closed。

### W2：建立 Workspace Plane 和可复现 toolchain

**目标**：把 Node/pnpm/Python/uv/Playwright/原生依赖准备从 workflow YAML 收回平台 action。

**任务**：

- 将 setup action 改为显式 capability 输入，而不是所有 lane 默认安装 Python/uv。
- 固化 Node、pnpm、Python、uv、Playwright 和 runner image 版本。
- 设计 lockfile-keyed pnpm store、Playwright cache、Nx cache 的 key、restore、失效和安全策略。
- 生成 `workspace-receipt-v1`，记录版本、安装、cache 和 native module ABI。
- 评估 workspace artifact 与重复 install 的真实 timing，禁止凭感觉上传巨大 `node_modules`。

**交付物**：可复用 composite action、workspace receipt、cache policy 和 setup 单测。

**验收**：Web lane 不再启动不需要的 Python/uv；同一输入在两个 runner 上 receipt 等价；cache miss 仍可从零完成。

### W3：Control Plane、risk classifier 和 DAG manifest

**目标**：把 scope detector 从测试专用脚本提升为交付控制平面。

**任务**：

- 扩展现有 Scope Detector，生成完整 delivery manifest，而不改变 Nx graph 的事实来源。
- 增加 docs/package/runtime/database/web-flow/root/release risk 分类。
- 由 manifest 选择 PR、nightly、release 的 lane 集合和稳定 Oracle。
- 给 root config、lockfile、Dockerfile、workflow、schema、Prisma、API route 建立显式 inputs。
- 为每个 risk 类别写 positive/negative fixture，验证不漏跑也不过度运行。

**交付物**：`delivery-manifest-v1.json` 生成器、risk registry、DAG fixtures 和控制平面 job。

**验收**：下游 job 不再独立调用 Nx affected 解释 scope；detector failure、空 manifest 和版本漂移均失败。

### W4：Build Plane 和 immutable artifact fan-out

**目标**：构建一次，测试和发布复用同一份产物。

**任务**：

- 为 API、Web、Desktop 和 Docker 输入定义 build target 与 artifact manifest。
- 将 API build 从 Web shard 启动链路中拆出，上传带 SHA/digest 的 artifact。
- 从 `apps/api/package.json` 递归解析 workspace dependencies，生成 `api-runtime-closure`；只上传
  `packages/*/dist`，恢复前校验内容 digest、source manifest digest 和完整目录集合。
- Web shard、integration smoke 和 preview 消费 build artifact；数据库仍独立初始化。
- 为 artifact 增加 manifest、checksum、source SHA、toolchain、SBOM/attestation 字段。
- 通过故意篡改、缺失、过期和跨 SHA 下载测试 fail closed。

**交付物**：build/package lanes、artifact registry adapter、下载校验 action 和 provenance report。

**验收**：同一 commit 的 API/Web 在 PR 中只构建一次；API 的传递 workspace runtime closure 与主构建
一同生成并被 Web/Docker 消费；下游日志能证明消费了正确 digest；artifact 失败不会被当作 skipped。

### W5：重构 PR Execution Plane

**目标**：在不改变测试语义的前提下，按 lane 解耦执行并稳定聚合。

**任务**：

- 将 Validate、Boundary、Integration、Web、Coverage、Performance 迁移到统一 lane adapter。
- 每个 lane 只消费 manifest 和 lane input，输出 lane result 与 evidence index。
- 保留真实数据库和 Web shard 隔离；只复用 build artifact、工具链和浏览器 cache。
- 评估 static/typecheck/build 的 validation pool，分别测量墙钟与 runner-minutes 后决定是否合并。
- Oracle 只聚合 lane result，不读取 job 内部 shell 约定。

**交付物**：新的 PR workflow、lane registry、Oracle adapter、稳定 required contexts。

**验收**：docs-only、package、runtime、Web、root 五类变更都走正确 lane；所有 Oracle 始终出现。

### W6：测试环境工厂和隔离策略

**目标**：把 PostgreSQL、seed、ports、API/Web runtime 的准备变成可替换的 environment provider。

**任务**：

- 定义 `environment-provider-v1`：database、ports、secrets、seed、cleanup、health 和 receipt。
- 将 boundary、integration、Web shard 的环境准备从 job YAML 收回 provider。
- 为每个 shard 生成独立 lane identity 和数据库 namespace。
- 记录 setup、health wait、migration/Prisma push 和 cleanup timing。
- 增加错误数据库、端口占用、服务启动 crash 和 cleanup 失败测试。

**交付物**：PostgreSQL provider、Web runtime provider、environment receipt 和隔离治理测试。

**验收**：lane 之间没有共享可变数据库状态；环境失败被分类为 infrastructure；清理失败不会静默成功。

### W7：Observation Plane、预算和诊断

**目标**：让性能优化变成可验证的系统能力。

**任务**：

- 统一收集 queue/setup/artifact/execution/post、cache、spec、retry 和 failure 字段。
- 生成 run summary、lane summary、最慢 spec、artifact provenance 和 cost report。
- 建立 5-run P50/P95 比较脚本，不使用单次最优值。
- 为 runner-minute、墙钟、setup 占比、artifact 复用率和 flaky 分类设预算。
- 失败时保留最小 JSON/JUnit；trace/video 仅在失败时上传。

**交付物**：`ci-cd-summary-v1`、timing parser、预算检查、报告 artifact 和趋势数据格式。

**验收**：任意 lane 可以单独解释其成本；assertion/infrastructure/crash/timeout/flaky 可区分；报告缺失会被治理检查发现。

### W8：Nightly full audit 和质量回归

**目标**：用完整审计兜底 risk classifier 和 affected graph，避免 PR 变快后出现漏检。

**任务**：

- 将 full coverage、完整 integration、Web full manifest 和 performance experiment 接入同一控制平面。
- Nightly 不使用 PR affected manifest，但使用相同 lane contracts 和 Oracle 状态机。
- 增加故意 coverage regression、target removal、scope omission、artifact mismatch 场景。
- 将 nightly failure 按代码、治理、环境、平台和成本分类，建立 owner/过期时间。

**交付物**：nightly full workflow、audit report、regression fixtures 和 failure triage policy。

**验收**：root/lockfile/Nx/CI 输入变更能被 nightly 捕获；coverage 阈值原样保留；false-green 为 0。

### W9：Release Plane、promotion 和回滚

**目标**：让 release 和 deployment 晋级已验证 artifact，而不是再次从源码构建。

**任务**：

- release-please 只产生版本和 release intent，不直接决定未验证构建。
- main CI 生成受信任的 API/Web/Docker 输入 artifact、OCI digest、SBOM 和 attestation；Desktop 由 release
  tag 上的 Windows/Linux 矩阵分别生成带 tag provenance 的不可移植安装包。
- tag/release workflow 选择 artifact digest，执行 promotion、签名和环境发布。
- 部署后执行 migrator/API/Web smoke、health 和 rollback receipt。
- 设计跨平台 Desktop 的分别构建与统一 provenance，不强行共享不可移植产物。

**交付物**：promotion manifest、release adapter、deploy provenance、rollback procedure 和权限矩阵。

**验收**：API/Web/Docker 等 main artifact 对同一 SHA 不发生第二次源码构建；Desktop 每个目标 OS 在
release tag 上只构建一次；错误 digest 无法发布；回滚只需选择已知 digest。

### W10：安全、权限和供应链治理

**目标**：解耦不能以扩大权限和 cache 污染为代价。

**任务**：

- PR workflow 统一最小只读权限；发布使用 protected environment 和 OIDC/短期凭据。
- 禁止 fork 写入共享 cache；cache key 绑定 lockfile、toolchain 和必要输入。
- artifact/image 绑定 source SHA、workflow、SBOM、attestation 和 retention。
- 审计 artifact 下载、promotion、bypass 和管理员恢复。
- 将权限、cache、artifact、环境保护纳入 governance target。

**交付物**：permission matrix、security policy、artifact provenance check、bypass audit guide。

**验收**：普通 PR 无发布权限；未绑定 provenance 的 artifact 无法 promotion；权限负向测试通过。

### W11：Shadow mode、故障注入和切换

**目标**：在一次切换前证明新平台与现有质量语义一致。

**任务**：

- 新平台 shadow mode 与当前 CI 并行生成结果对照，但不产生第二套 required gate。
- 注入 detector failure、lane skipped/cancelled、assertion failure、process crash、timeout、artifact mismatch、
  cache miss、service startup failure 和 permission denial。
- 对照 test count、spec manifest、coverage、failure classification、artifact digest 和 timing。
- 完成 docs-only、普通 affected、full affected、nightly full 和 release dry run。
- 逐步将 ruleset contexts 切换到稳定 Oracle，保留管理员恢复步骤。

**交付物**：shadow comparison report、故障注入报告、cutover checklist、rollback checklist。

**验收**：所有负向场景 fail closed；没有 required Oracle bypass；对照报告解释所有差异。

### W12：一次性切换、清理和归档

**目标**：删除 V1 双轨，完成平台重构闭环。

**任务**：

- 删除旧 workflow、重复 setup、旧 artifact 命名、旧 build/release 入口和无效文档。
- 更新 ADR-041 状态为 Implemented，补充最终 manifest、run、成本和发布证据。
- 更新 CI、release、deployment、testing 和 architecture 导航。
- 运行 governance、format、actionlint、schema、target sync、相关测试和完整 CI。
- 将本计划移动到 `docs/plan/archive/`，记录未达标指标和后续非阻塞优化。

**交付物**：最终切换 PR、文档、治理报告、Actions evidence、归档计划。

**验收**：旧入口不存在；required contexts 与 Oracle 完全一致；主分支只保留一套平台契约。

## Definition of Done

### 解耦性

- [x] scope、workspace、execution、artifact、observation、release 六个平面有独立输入输出。
- [x] workflow YAML 不再包含业务 scope 推断和重复环境准备实现。
- [x] 执行 job 只消费 manifest lane policy；docs-only 不占用 validate runner，root/release/full 显式打开完整 lane。
- [x] lane 之间只通过 manifest、receipt、artifact 或 Oracle 结果通信。
- [x] release 不直接依赖 PR runner 的工作区状态。

### 可扩展性

- [x] 新增 lane 只需注册 capability、schema、owner、policy 和 adapter。
- [x] 新增平台/部署目标不复制整套 workflow。
- [x] schema 有版本、兼容策略和负向治理测试。
- [x] GitHub Actions 之外可实现另一个 execution adapter 而不改业务测试。

### 质量与安全

- [x] 所有 required Oracle 稳定出现且 fail closed。
- [x] 真实 DB/E2E/performance 隔离和不缓存语义保持不变。
- [x] assertion、infrastructure、crash、timeout、flaky 分类准确。
- [x] PR 无生产写权限；artifact provenance 和 promotion 可审计。
- [x] nightly full audit 能捕获 affected 漏检和 coverage regression。

### 性能与成本

- [ ] docs-only P50 约 90 秒量级。
- [ ] full affected 墙钟 P50 进入 7–8 分钟级。
- [ ] full affected runner-minutes P50 不高于约 42.3 分钟。
- [ ] Web shard 平衡和 artifact 复用由至少 5 次 comparable run 证明。
- [x] 成本下降来自 setup/build/artifact 架构，不来自删除测试、阈值或 retry 语义。

## 风险与预案

| 风险                      | 预防                                           | 触发后的动作                                   |
| ------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| artifact 下载抵消构建节省 | W0 记录 upload/download/setup                  | 按数据决定复用粒度，必要时只复用 API/Web build |
| risk classifier 漏检      | root inputs + nightly full + negative fixtures | 临时提升 risk 等级，修复 classifier 后再降级   |
| cache 污染或 ABI 不匹配   | lock/toolchain/runner key + receipt            | 失效 cache，从零准备；不得扩大 skip            |
| lane 解耦导致状态丢失     | versioned receipt + Oracle contract tests      | fail closed，修复 adapter，不人工标绿          |
| release provenance 缺失   | promotion manifest + digest check              | 禁止发布，使用最近已知 digest 回滚             |
| GitHub Actions 限制       | 执行器适配层和 artifact plane 解耦             | 迁移到新 runner/平台，不改业务测试契约         |

## 验证命令

实施期间至少保持以下验证入口：

```bash
pnpm nx run memoflow:governance-check
node tools/test-system-v2/inventory.mjs --check
node tools/test-system-v2/ruleset-check.mjs
node --test tools/test-system-v2/__tests__/*.test.mjs
```

新增平台契约后补充：

```bash
pnpm nx run ci-cd-platform:contract
pnpm nx run ci-cd-platform:governance
pnpm nx run ci-cd-platform:failure-matrix
pnpm nx run ci-cd-platform:fault-injection
pnpm nx run ci-cd-platform:timing
```

上述新 target 在 W1/W2 创建前不得伪造为已存在的命令；计划中的命令必须在对应 work package 交付时落地。
