---
tags:
  - architecture
  - ci
  - cd
  - delivery
description: CI/CD Platform V2 的目标架构、边界与稳定契约
created: 2026-08-05T00:00:00Z
updated: 2026-08-05T00:00:00Z
---

# CI/CD Platform V2

> 决策来源：[ADR-041: CI/CD Platform V2 解耦与可扩展交付平台](./adr/ADR-041-ci-cd-platform-v2.md)
>
> 实施入口：[CI/CD Platform V2 一次性重构计划](../plan/archive/2026-08-05-ci-cd-platform-v2-refactor.md)

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
| Governance  | `ruleset-check.mjs`、`.github/rulesets/main.json`、`ci-platform-audit.yml`                     | 稳定 Oracle 必须 active；单人维护者不强制 approving review；故障矩阵定期运行                     |

新增 lane 或 artifact 类型必须先更新 registry、对应 schema、负向测试和 adapter；workflow 只能消费
这些注册信息，不能重新声明一套隐含契约。
