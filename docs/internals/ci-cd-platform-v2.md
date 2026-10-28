---
tags:
  - architecture
  - ci
  - cd
  - delivery
description: CI/CD Platform V2 的目标架构、边界与稳定契约
created: 2026-08-05T00:00:00Z
updated: 2026-10-28T00:00:00Z
---

# CI/CD Platform V2

> 决策来源：[ADR-041: CI/CD Platform V2 解耦与可扩展交付平台](./decisions/ADR-041-ci-cd-platform-v2.md)
>
> 实施入口：[CI/CD Platform V2 一次性重构计划](https://github.com/BakerSean168/memoflow/blob/7a45112e1840950ead1ba98b748fc70fa1b38344/docs/plan/archive/2026-08-05-ci-cd-platform-v2-refactor.md)

## 1. 目标

CI/CD Platform V2 解决的不是单个测试命令的速度，而是从代码变更到发布的完整交付链路：

- 变更只被解释一次，所有下游 lane 使用同一份 scope 和 risk manifest。
- workspace 准备、构建、测试、发布彼此解耦，可以独立替换和扩展。
- 同一个 commit 的可验证构建产物只构建一次，后续通过 immutable artifact 晋级。
- 测试环境彼此隔离，但构建依赖和只读产物可以复用。
- PR、nightly、release 使用不同的质量目标，不把昂贵的全量审计塞进每个 PR。
- 每个 lane 输出统一的结果、耗时、缓存和失败分类，成本可以持续度量。

## 2. 非目标与不变量

本架构不通过以下方式换取速度：

- 删除关键测试、降低 coverage threshold 或扩大 skip。
- 对确定性断言增加 retry。
- 在需要隔离的 integration/E2E lane 之间共享数据库状态。
- 用不可信的 remote cache 隐藏环境依赖。
- 让发布重新构建一份未经过 PR/main 验证的源码副本。

以下是不变量：

1. 所有工作都绑定到明确的 commit SHA、scope manifest 和 artifact digest。
2. 所有 required Oracle 和最终 `Delivery Observation` 始终出现；动态 child 只能由 Oracle 聚合，不直接成为规则入口。
3. 测试 lane 不拥有 scope 解释权；scope 只能由控制平面生成。
4. 执行平面不拥有发布权限；发布平面只能晋级已验证 artifact。
5. 任何新 lane 必须声明输入、输出、环境隔离、cache policy、failure policy 和 owner。

## 3. 分层架构

```text
                            +----------------------+
                            | GitHub event / manual |
                            +----------+-----------+
                                       |
                               Control Plane
                    scope -> risk -> policy -> DAG manifest
                                       |
             +-------------------------+-------------------------+
             |                         |                         |
       Workspace Plane           Artifact Plane             Policy Plane
       toolchain/deps            build/test artifacts        rules/oracles
             |                         |                         |
             +-------------+-----------+-------------------------+
                           |
                    Execution Plane
        validate | boundary | integration | web | coverage | perf
                           |
                    Observation Plane
       timing | cache | JUnit/JSON | failure | cost | summary
                           |
                     Release Plane
       promote digest -> deploy -> smoke -> rollback/attestation
```

### 3.1 Control Plane

Control Plane 是唯一的编排来源，负责生成 versioned `delivery-manifest-v1.json`。它组合：

- `scope`：受影响项目、可用 target、测试能力和根配置变化；Nx graph 仍是项目关系的唯一事实源。
- `risk`：docs、package、API、database、runtime、release 等变更等级。
- `policy`：当前事件允许的 PR、nightly 或 release lane 集合。
- `dag`：稳定 Oracle 与动态 child 的依赖关系。

下游 job 只消费 manifest 的 risk/policy 和 base/head 边界；需要 Nx graph 执行 target 时只能使用
manifest 注入的 base/head，不得自行选择另一套范围。manifest 必须包含 base/head SHA、
生成器版本、规则版本和输入摘要，避免同一 run 出现多个事实源。
job 是否创建由 manifest 的 lane policy 决定；docs-only 可以跳过执行 lane 而保留 governance，root、release
和 full audit 则显式打开相应的完整 lane。

### 3.2 Workspace Plane

Workspace Plane 只负责准备可执行环境，不运行业务测试：

- 固定 Node、pnpm、Python、uv、Playwright 和原生工具链版本。
- 使用 lockfile-keyed pnpm store 和 Playwright cache。
- 生成可复用的 workspace preparation receipt，包括版本、cache 命中和安装耗时。
- 只为实际需要 Python/uv 的 lane 启用对应工具链。

Workspace Plane 可以在不同 runner 上重复执行，但重复必须是廉价、可观测和可证明等价的；不能把
环境准备逻辑复制到每个 workflow YAML 中。

### 3.3 Artifact Plane

Artifact Plane 管理三类产物：

| 类型             | 例子                                                         | 生命周期        | 是否可跨 lane 复用   |
| ---------------- | ------------------------------------------------------------ | --------------- | -------------------- |
| Build artifact   | API/Web/desktop build output、API runtime dependency closure | 当前 commit/run | 是，digest 固定      |
| Test evidence    | JUnit、JSON、trace、coverage                                 | 当前 run        | 是，只读             |
| Release artifact | OCI image、desktop package、SBOM、attestation                | tag/release     | 只能晋级，不重新构建 |

artifact 名称必须包含 commit SHA 或 digest。缓存允许被丢弃，artifact 不能被静默覆盖；下载后必须
校验 manifest、digest 和构建来源。

API 不是只有 `apps/api/dist` 一个运行时输入。Control/Build Plane 会从 `apps/api/package.json`
递归解析 workspace dependencies，生成 `api-runtime-closure`，只收集这些包的 `packages/*/dist`。
Web shard 与 Docker deploy 在使用 API 前必须校验 closure 的内容 digest、source manifest digest 和
完整目录集合，再恢复到 workspace；缺少任一传递依赖会 fail closed。这样不会把整个 `packages` 源码树
上传，也不会让某个具体包名成为隐藏的特殊分支。

### 3.4 Execution Plane

Execution Plane 由可插拔 lane 组成。每个 lane 只做一类工作：

- `validate`：lint、typecheck、unit、build。
- `boundary`：Desktop boundary、smoke 和环境契约。
- `integration`：真实数据库和跨模块集成。
- `web`：独立数据库的 Playwright shards。
- `coverage`：受治理的 affected 或 full measurement。
- `performance`：确定性 PR budget 或 nightly experiment。

lane 使用统一 `lane-input-v1.json` 和 `lane-result-v1.json`，不得通过约定的 shell 输出互相传递隐含状态。
真实数据库、浏览器和性能采样的 cache policy 固定为 disabled；只有确定性编译和 unit 结果允许 Nx cache。

### 3.5 Observation Plane

每个 lane 输出相同的结构化字段：

- queue、workspace setup、artifact download、execution、upload/post 时间。
- cache restore、local hit、remote hit/miss。
- test/spec 数、skip 数、retry 数和最慢项目。
- `assertion`、`infrastructure`、`process-crash`、`timeout`、`flaky` 分类。
- base/head、manifest digest、runner image 和 toolchain 版本。

Observation Plane 只读消费 lane receipt，不改变 lane 成败；manifest、evidence 或 summary 缺失时自身
失败，不会把“没有观测到”解释成成功。`compare-timings.mjs` 对同一 lane 集合计算 P50/P95，避免用单次
最快结果做预算结论。GitHub Actions 的执行适配器通过 `collect-github-run-metrics.mjs` 从 run/jobs
API 收集真实 start time 和 runner-minutes，再以标准输入交给 `observe-run.mjs`；API 失败、分页不完整或
时间字段非法都会 fail closed。这样以后替换 GitHub Actions、增加成本报表或接入 metrics backend，不需要
修改测试实现。

### 3.6 Release Plane

Release Plane 采用 build-once, promote-many：

1. PR 生成并验证可选 preview artifact。
2. `main` 对合并 commit 生成受信任 artifact 和 attestation。
3. release tag 只选择、签名和晋级已验证 digest。
4. 部署后执行 smoke、迁移检查和健康检查。
5. 失败时按 digest 回滚，不重新从工作区构建一份“修复版”。

生产 API 和 migrator 继续作为一个兼容版本单元发布；生产 promotion 的 artifact closure 包含 `api`、
`api-runtime-closure`、`web`、`migrator`、`database` 和 `database-runtime`。部署权限只授予 Release
Plane，PR job 不拥有生产写入权限。Desktop 安装包是 OS/ABI 相关的例外：Windows 和 Linux 在 release
tag 上各自只构建一次，使用 tag 自身的源码和版本，不把不可移植产物跨 runner 复用；任一平台失败都禁止
上传部分 release assets。

## 4. 变更风险与 lane 选择

控制平面根据 Nx graph、文件分类和配置输入生成 risk manifest：

| 风险等级   | 典型变化                            | PR lane                           |
| ---------- | ----------------------------------- | --------------------------------- |
| `docs`     | docs、注释、非执行 metadata         | governance + Oracle               |
| `package`  | 单一 package/domain                 | affected validate + coverage      |
| `runtime`  | API、database、Prisma、IPC          | validate + boundary + integration |
| `web-flow` | Web route、adapter、UI flow         | validate + web shards             |
| `root`     | lockfile、Nx、CI、toolchain、Docker | full affected + governance        |
| `release`  | tag、release config、deployment     | release validation + promotion    |

风险选择是增量优化，不是质量豁免。nightly full audit 继续覆盖 affected 漏检；root 变化默认进入最重
的验证路径。

## 5. 可扩展性契约

新增 lane、平台或发布目标必须提供：

```json
{
  "kind": "lane-input-v1",
  "lane": "example",
  "commit": "<sha>",
  "manifest": "<digest>",
  "inputs": [],
  "outputs": [],
  "environment": { "isolation": "dedicated", "database": "none" },
  "cache": { "read": [], "write": [] },
  "failurePolicy": { "retry": "infrastructure-only", "timeoutMinutes": 30 },
  "owner": "team-or-module"
}
```

新 lane 不得直接修改其他 lane 的状态；跨 lane 依赖只能通过 immutable artifact、manifest 或 Oracle
结果表达。这样新增移动端、desktop release、contract audit 或 preview deployment 时，不需要复制整套
workflow。

## 6. 目标指标

验收使用至少 5 次同范围 Actions run 的 P50/P95，不使用单次最快结果：

- docs-only PR：P50 维持约 90 秒量级，并且所有稳定 Oracle 成功。
- 普通 affected PR：P50 相比当前同范围基线下降，且不扩大测试 skip。
- full affected：墙钟 P50 进入 7–8 分钟级；runner-minutes P50 不高于约 42.3 分钟。
- Web shard：最长与最短差距小于当前约 25 秒的实测水平，异常时由 timing 数据解释。
- release：同一 commit 的生产 artifact 不发生第二次源码构建。
- required Oracle 绕过、未绑定 artifact、缺失 lane receipt 和未分类失败均为 0。

这些是验收指标，不是通过更改测试语义强行达成的预算。

## 7. 失败与恢复模型

- assertion：直接失败，不自动重试。
- infrastructure/process startup：只允许一次准备阶段重试，并保留原始失败。
- timeout：默认失败，进入诊断，不自动转换为 flaky。
- flaky：隔离、登记 owner 和过期日期，不允许无限 retry。
- artifact mismatch、manifest 缺失、权限错误：fail closed，不跳过下游门禁。

所有 Oracle 使用相同状态机：合法未受影响为成功，应执行但 skipped/cancelled/failed 为失败，
detector 或 manifest 失败为失败。

## 8. 安全边界

- PR 使用最小 `contents: read` 权限，不拥有生产发布或写入 cache 的权限。
- Release Plane 使用环境保护、OIDC/短期凭据和可审计的 promotion 权限。
- cache key 绑定 lockfile、runner/toolchain 和必要的安全输入；不接受 fork 的可写共享 cache。
- artifact 和 image 必须关联来源 commit、构建 workflow、SBOM 和 attestation。
- 紧急 bypass 只允许管理员并必须留下审计记录。

## 9. 迁移原则

迁移允许在分支内短暂并行验证，但不允许旧新工作流长期同时作为门禁。完成切换前必须：

1. 新平台在 shadow mode 生成与旧结果的对照报告。
2. 通过故意失败、detector failure、artifact mismatch、取消和权限失败测试。
3. 将 required contexts 一次切换到稳定 Oracle。
4. 删除旧 workflow、旧 artifact 命名和兼容入口。

详细顺序和 Definition of Done 见实施计划。

## 10. 当前实现映射

| 平面        | 当前入口                                                                                       | 关键不变量                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Control     | `generate-delivery-manifest.mjs`、`lib/risk.mjs`                                               | 每次 run 只生成一个带 self-digest 的 manifest                                                    |
| Workspace   | `setup-nx-affected-job`、`write-workspace-receipt.mjs`                                         | capability 驱动，receipt 绑定 toolchain/cache/setup timing                                       |
| Artifact    | `create-artifact-manifest.mjs`、`verify-artifact.mjs`                                          | 内容 digest、commit、source manifest digest 缺一不可                                             |
| Execution   | `lane-registry.mjs`、`run-command.mjs`                                                         | lane input/result 版本化，NX base/head 从 manifest 注入                                          |
| Observation | `observe-lane.mjs`、`observe-run.mjs`、`collect-github-run-metrics.mjs`、`compare-timings.mjs` | 多 job 同 lane 聚合、真实墙钟/runner-minutes、缺失证据 fail closed、P50/P95 只能比较同 lane 集合 |
| Release     | `promote-artifact.mjs`、`release-publish.yml`、`publish-images.yml`                            | production 必须同时具备六种 artifact（含 API runtime closure），禁止 source rebuild promotion    |
| Governance  | `ruleset-check.mjs`、`.github/rulesets/main.json`、`ci-platform-audit.yml`                     | `CI Check` 是唯一 required context；单人维护者不强制 approving review；故障矩阵定期运行          |

新增 lane 或 artifact 类型必须先更新 registry、对应 schema、负向测试和 adapter；workflow 只能消费
这些注册信息，不能重新声明一套隐含契约。

## 11. PR 证据复用与发布信任链（#508）

日常验证发生在 PR；发布只补发布特有验收。`CI Check` 继续是 PR 唯一 required check，
不修改 main Ruleset。main push 不再无条件重跑普通验证；无法证明等价时才运行 Full Audit。

### 被测身份与摘要

`pull_request` 的默认 checkout 是 `refs/pull/N/merge`，`GITHUB_SHA` 是 synthetic merge commit；
workflow run/jobs API 的 `head_sha` 则是 PR head。两者必须分别记录，不能把 API head SHA 当成
checkout SHA。`prepare-ci-manifest.mjs` 以实际 checkout commit 生成 affected manifest，并输出
`ci-evidence-v1`，记录 run ID/attempt、PR head/number、实际 commit/tree、配置输入摘要及完整 manifest。

仓库使用两父 MERGE COMMIT。main 上 `lib/ci-evidence.mjs` 按以下顺序证明等价：

1. commit→associated PR API 必须返回且只返回一个 PR；重新读取 PR，核对已合并、main、同仓库且非 fork。
2. main parents 必须是 push 的 `before` 和 PR 当前 head。查询该 head 的最新 CI run，不能越过失败或取消的
   新 run 去捡旧绿。API 核对 run ID、attempt、head SHA、event、仓库、非 fork、workflow ID/path、
   completed/success，以及该 attempt 唯一成功的 `CI Check`。分页不完整也拒绝复用。
3. 只在上述身份验证之后读取 run 的 evidence artifact。artifact ID/run/head/过期状态和 ZIP SHA-256
   必须与 GitHub API 一致；API 不提供 digest 也拒绝。证据在 main run 开始时不得早于七天。
4. API 与本地 Git 均核对 synthetic merge 的两个 parents。使用
   `git rev-parse <tested-sha>^{tree}` 与 `git rev-parse <main-sha>^{tree}` 重新计算并比较树，
   同时核对 API tree。被测 base 必须等于 main 第一父提交；base drift、跨多个 merge 的 push 都回退。
5. 在等价树的工作区，以原 PR base、tested merge SHA、event/ref 重新运行 manifest generator，比较
   完整 delivery-manifest digest。另对受保护输入的 tracked path、mode、blob ID 排序计算 SHA-256，
   比较 tested/main/evidence 的 inputsDigest。不能仅验证 JSON 自带摘要。

受保护 CI 输入显式定义在 `isCiInput`：全部 `.github/**`、`tools/**`、根目录文件、
`deployment/**`、`docker/**`、Dockerfile/compose，以及任意层级的 package/project manifest、
lockfile、tsconfig、`*.config.*`、Python 配置、requirements 与工具链版本文件。PR 改动这些输入时
强制 Full Audit，即使 tree 相同。此集合刻意保守；扩展配置能力时同时更新该函数与负向测试。

任一步 API 错误、来源错误、缺失/过期/失败/取消证据、错误 SHA/tree/manifest/配置摘要、direct push、
多个关联 PR 或不可读取的 synthetic commit，main 都回退全量。首次合并本改动也会全量，因为修改 CI 输入。
生成 manifest 或执行 full suite 失败则 `CI Check` 失败，不把异常变成绿灯。

### 执行与晋升

复用成功的 main manifest 明确禁用普通测试/治理 lanes，非 docs 仍要求 Build 成功。`CI Check`
根据经过摘要校验的 execution policy 强制检查 Build，缺失、失败、取消或意外跳过都失败。
`run-command.mjs` 在 `manifest.full=true` 时将标准 Nx affected 调用变为 run-many，确保 Full Audit
真跑全部项目。nightly `CI` 在每日 03:00 UTC 的 main HEAD 运行所有 lanes，其 `CI Check`、Actions
失败状态和 run summary 都可见；独立的扩展 Web Flow Audit（#503）和 nightly Coverage 继续保留。
Coverage 删除重复的 main push 触发。

发布信任链为：**main tree → API 认证的测试 run ID + head/实际 tested SHA + manifest → main build
artifact ID/ZIP digest → 内容摘要 + provenance → candidate-set digest → OCI digests → release evidence**。
main 构建新产物，绑定 main manifest；复用的是测试证明。`verify-ci-promotion.mjs` 在 Candidate/Release
写入前重新验证 main 的 CI Check、证据 artifact、tree/config、PR proof（或全量 main 证明）与构建
artifact 身份。晋升时年龄按原 main run 时间判定；artifact 已过期、被删除或 run 后来失效则阻止晋升。
Candidate 的 build archive 经 API digest 硬校验后才解压，并继续验证六种内容 manifest/runtime closure；
不能依赖 download-artifact 的 digest warning。canonical candidate-set 的 self-digest 包含 `ciEvidence`。
Docker release 读取 Candidate artifact 前再次验证其 API run 身份与 archive digest，并重验证完整 source chain。
Desktop release 同样必须先证明 main 测试链，才进入平台构建和安装验收。

威胁模型包含 fork/其他 workflow 冒充成功、旧绿覆盖新红、篡改 JSON/ZIP/tree、跨 base 复用、缺失产物和
API 不可用。信任根仍是 GitHub 同仓库 API、受保护 PR gate 与仓库内受审查的 workflow；本机制不声称抵抗
已控制仓库管理员或 GitHub 本身的攻击者。PR/main 使用只读 contents/actions/pull-requests 权限；只在
实际发布 job 授予 registry/release 写权限，无 `pull_request_target` 执行不受信代码。

任何 chain 缺口在晋升阶段都直接停止，不能通过重跑普通 unit tests 补成一个新来源。只保留已有安装、
首次启动、N→N+1 升级、签名、跨平台 packaging 和 migrator/data acceptance。docs-only main 的
execution.candidate=false，Candidate resolve 成功 no-op，不创建镜像、runtime 或 staging promotion。
无法读取 push before/range 时仍回退 Full Audit，并阻止 Candidate；缺少 token 的 API client 初始化错误同样回退全量。
staging mutation 和公开 Release 前再次验证来源链，避免长时间原生验收期间 run/attempt 或证据失效后继续晋升。
Candidate/Release Publish/Prepare Release 的 GitHub manually-disabled 状态不在本改动中启用；前两者的
workflow_dispatch 新增默认 true 的 dry_run，执行只读链验证并阻止所有发布 job。

### 合并后运营验收与边界

后续至少五次具有等价 PR/main 树的普通合并收集 run ID、tree、manifest/evidence digest、reuse/full 原因、
queue/setup、wall-clock、runner-minutes。对照改动前至少五次相同 workload 的 main Full Audit，按 workload
分组报告 P50/P95（docs 与 runtime 不混算）；不把首次 CI 配置改动的 fallback 当作普通复用样本。
使用 run/jobs API 与 `collect-github-run-metrics.mjs`、`compare-timings.mjs` 的同 lane 约束，分别比较
同策略的样本，再报告策略间差值；不能伪造不同 lane 样本符合旧比较器。

禁用状态下先用 mocked API 正负契约和只读 CLI 验证；由 owner 后续恢复调度后执行 Candidate/Release
端到端 drill，保留 candidate-set、CI chain、双 registry digest、Desktop 安装/升级/签名与 migration receipts，
并故意注入错误摘要证明阻止晋升。该测量与实际发布 drill 只能在合并后观察，当前 PR 不宣称完成。
启用 workflow、生产 rollout、Ruleset 修改及 #501/#504/#506/#507 等优化均不属于 #508。

参考：[GitHub pull_request 事件语义](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)、
[Artifacts API（含 digest/run identity）](https://docs.github.com/en/rest/actions/artifacts?apiVersion=2022-11-28)。

### Unit job partitioning

`tools/ci-cd-platform/unit-test-durations.json` records the #501 baseline (12 affected CI
runs plus the first successful #518 Full Audit, with workload kinds kept separate,
per-project uncached timings, setup and cache observations). The scope
producer uses those project P50 weights for deterministic LPT assignment to three
fixed jobs. `app-vue:test`, the measured dominant task, contributes two Vitest
file shards; other projects retain their complete Nx `test` target. Unknown
projects use the median weight. Each runner executes its assigned targets in
sequence. app-vue shards have an explicit budget of two Vitest workers so CPU
contention does not consume the native lifecycle tests’ unchanged deadlines.
Vitest shard/worker arguments participate in the Nx task hash. No primary
test ownership changes. Dynamic job counts are left to #506.

The signed delivery manifest includes `unitShards`. Its executable contract
requires all three job IDs and exact, nonduplicated coverage of the selected
project tasks, including both app-vue halves. `CI Check` directly requires each
selected physical job; only a manifest-disabled or empty job may be skipped.
Observation also requires evidence for every assigned command, so lint/build
success cannot mask a missing Unit shard. Evidence reuse and promotion verify
physical Unit job identities and conclusions from the authenticated run/attempt
API, in addition to the existing aggregate check, tree and digest proofs.

The three explicit job IDs give each runner its own existing Nx cache namespace
and evidence artifact. Cache snapshots include both `.nx/cache` and the matching
SQLite index (`.nx/workspace-data/*.db*`); artifacts alone are unrecognized by Nx.
Both directories are pinned and the daemon is disabled so closed-process snapshots
remain coherent; graph snapshots, locks and daemon state are excluded.
Unit commands disable automatic infrastructure retries and
preserve the first failure. Cache restoration and actual Nx task hits are distinct;
measure both from real logs rather than cached Vitest output. The manual quality
shadow benchmark follows the same six logical children (static, three Unit jobs,
typecheck, build), preserving command parity and rejecting incomplete receipts.

### Nx Cloud Ultracache：文件级 Affected 与按需录制（2026-10-28）

PR 的 `Changes` 仍由 `tools/ci-cd-platform/lib/task-selection.mjs` 统一生成
`delivery-manifest-v1`，并继续使用既有的 risk、Unit 分片、Build+Typecheck、
测试收据和 CI Check 门禁。它直接调用 Nx 24 的 Task-based Affected 选择器；
现在还从 Nx 原生 `runnerInputsForSelection` 获取 Ultracache 配置与
`selectivelyHashTsConfig`，避免 CI 使用与 `nx affected` 不同的输入规划。

- `nx.json` 的 `nxCloudId` 连接远程缓存。常规 PR/main CI 不调用
  `nx-cloud start-workers`，仍在现有 GitHub Actions Runner 上运行任务。
  Changes 在独立规划前以 `nx-cloud start-ci-run --no-distribution` 注册当前
  checkout 的 CI 上下文，供配置读取使用；该命令不启动 Workers。
  `scope.selection.ultracache` 保留加载状态、配置提交/数量，以及各任务实际使用或
  回退的诊断；`fetched` 但 `tasks: 0` 不能作为优化生效的证据。
- Ultracache **只在有有效文件读取记录时**缩小 Affected；没有记录、Cloud 不可用或显式
  `NX_NO_CLOUD=true` 时，Nx 回到原始 `inputs` 和 `^production`，
  不以空任务清单代替缺失证据。升级 Nx 时必须回归内部适配接口。
- `Build + Typecheck` **暂时例外**：现有混合目标调度器直接调用 Nx 内部
  `runTasksForCommand`，接入 Nx Cloud 后在任务显示成功时仍可能不退出。
  为防止 CI 卡住，此 Job 保留 `NX_NO_CLOUD=true`（使用原有 GitHub
  Nx 缓存）并设置 40 分钟超时；其他单测/契约任务和 Changes 继续使用 Cloud。
  后续跟踪 [#687](https://github.com/BakerSean168/memoflow/issues/687)。
  这是一个待单独修复的兼容性问题，不等于构建已经获得远程缓存提速。
- Workers 只用于按需采集记录：手动选择可信分支触发
  `.github/workflows/nx-ultracache-recording.yml`，使用 3 个
  `linux-medium-js` Worker，执行 4 个领域 Contract 的 `test:contract`
  及其真实前置 Build。绝不作为日常 PR 质量门禁或自动定时任务。
  **不要加 `--skip-nx-cache`**：跳过 Nx 缓存同时会跳过 Cloud 记录。
  录制命令传入 Vitest 的 default + JSON reporter 和每个 Run/Attempt 唯一的
  `.tmp-ultracache-*.json` 输出路径。这是实际命令输入变化，完整执行同一测试集，
  不更改业务代码、断言或远程缓存设置。前置 Build 可继续命中缓存。
  录制门禁要求真实 Cache Miss、执行任务的 Worker、`processed > 0`、零拒绝和
  配置生成；全命中缓存会失败。日志作为 Actions artifact 保存。
  随后的独立 CI 上下文加载发布后的配置，对比原生 Nx 与正式 Manifest/Dispatch
  在无关文件和 Task Workspace 契约变化下的任务集合；缺少配置或没有减少任务会失败。
- Cloud Workers 的最小数量为 3；`NX_CLOUD_AUTO_TASK_PACKING=false`
  避免 Hobby 环境的 Valkey / continuous assignment 限制。即使录制成功，
  是否节省端到端 CI 时间仍须用同一任务集合和完整墙钟时间验证。

2026-10-28 隔离实证：
[手动分布式试验](https://github.com/BakerSean168/memoflow/actions/runs/40664287272)
中 12 项小任务的本地执行为 13 秒，Cloud Workers 为 122 秒，说明不应将 Workers
加入轻量日常 CI。随后只修改未被测试实际读取的探针文件，
[Ultracache Affected 验证](https://github.com/BakerSean168/memoflow/actions/runs/40664908542)
使 `test:contract` 的受影响目标从 32/37 缩至 28/37；真正修改 Task Workspace
契约的正向对照仍选中 4 项，未观察到漏选。该收益只发生在已录制覆盖的任务；
并不等于全量 CI 都会获得相同比例的减少。

可在隔离环境用 `NX_NO_CLOUD=true` 与默认 Cloud 模式分别执行
`nx affected -t test:contract --files=<changed-file> --explain=stdout`，
比较原生选择结果。生产追踪应保留普通 Nx 缓存、监控免费额度，不使用
`nx-cloud start-workers` 改写现有的分片与产物验证策略。
