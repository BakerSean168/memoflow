# CI 测试与反馈性能

当前 PR workflow 是 `.github/workflows/ci.yml`。`Scope Detector` 使用统一 `NX_BASE` / `NX_HEAD`
生成 versioned `delivery-manifest-v1.json` artifact；后续 child 只消费并校验同一份 manifest，不重新解释 affected 范围。
job 的执行条件也只消费 manifest 的 lane policy：docs-only PR 只保留 governance，ro../release-tools/full policy
则显式开启对应的完整 lane，避免 scope 输出与实际门禁分叉。

稳定 required Oracle 始终出现：`Governance Oracle`、`Validate Oracle`、`Boundary Oracle`、
`Integration Oracle`、`Web Flow Oracle`、`Coverage Oracle`、`Performance Oracle`。
最终的 `Delivery Observation` 也属于 required context；它校验 manifest、lane evidence 和 run summary
完整存在，避免所有 child 通过但观测证据缺失时仍然 false-green。

`CI Check`（#488）是单一聚合 gate：`if: always()`，needs 全部 lane job（scope-detector、governance、
static-analysis、unit、typecheck、build、verification-children、web-flow-shard），读取 delivery manifest，
由 `tools/ci-cd-platform/lib/ci-check.mjs` 判定。只有 manifest 关闭的 lane 允许 skipped（unit 另需
`scope.unit` 为空）；failure、cancelled、意外 skipped、被关闭却运行的 lane，以及 manifest 缺失、digest
不一致、needs 漂移都判红。`main` Ruleset 只要求 `CI Check` 这一个 status check（2026-10-19 切换）；七个 Oracle 和
`Delivery Observation` 仍然运行并输出诊断，但不再是 required check。

Oracle 使用 `tools/test-system-v2/lib/oracle.mjs` 的同一状态机：未受影响且 child skipped 是成功，
应执行但 skipped/cancelled/failed 是失败，detector failure 会 fail closed。GitHub ruleset 的 active
required context（仅 `CI Check`）由 `.github/rulesets/main.json` 声明，并由 `ruleset-check` 校验名称一致性。

Validate children（static analysis、unit、typecheck、build）并行执行。Desktop IPC 和 main 在一个
prepared Boundary runner 内分别执行；integration、smoke 和每个 Web shard 使用独立数据库环境。
真实数据库、浏览器和性能 target 均关闭 Nx cache。

Web Flow 的核心 spec 由 `apps/web/web-flow-specs.mjs` 唯一列出。
`tools/test-system-v2/web-spec-durations.json`（version 2，含 `generatedAt`、`observedAt` 与 `source`）保存多次 CI
run 的逐 spec 中位耗时；`run-web-shard.mjs <i>/<n>` 在每个 shard 现场用 `lib/shard-balance.mjs` 的确定性
LPT 计算分片，缺少历史的 spec 取中位数。`observedAt` 来自报告的 `stats.startTime`，保留各 spec
及整体最早参与统计的观测时间；刷新时间 `generatedAt` 不会使旧数据变新。观测超过 21 天、日期缺失/
无效/处于未来或缺项时输出 `::warning::`；刷新工具拒绝无效或未来的报告日期。
`web-shards.test.mjs` / `shard-balance.test.mjs` 校验无遗漏、无重复、最慢 N 个分布在不同 shard、
结果与输入顺序无关。刷新：下载 `web-flow-*-results` artifact 后运行
`node tools/test-system-v2/refresh-web-spec-durations.mjs --source "<runs>" <results.json...>`。

`tools/test-system-v2/run-command.mjs` 输出结构化 timing/report，并使用
`failure-classification.mjs` 区分 assertion、infrastructure、process-crash、timeout 和 flaky；只有
明确 infrastructure 或 process crash 才自动重试一次。成功 run 不上传大体积浏览器证据，失败时保留
trace、video、screenshot 和 JSON report。

CI/CD Platform V2 现在把平台事实收敛到 `tools/ci-cd-platform/`：`lane-registry` 声明每个 lane 的
capability、输入输出、隔离、cache、owner 和失败策略；`create-lane-input.mjs` 把同一份 delivery
manifest 转换为可验证的 `lane-input-v1`。workspace action 先消费 manifest，再严格按 lane capability
决定是否安装可选工具链，并生成带 digest 和 setup timing 的 `workspace-receipt-v1`。Web lane 在
Mastra-native cutover 后只需要 Node/pnpm/Playwright/Postgres，不再为已退役的 Python runtime 安装 Python/uv。

每条命令输出唯一的 `lane-result-v1`，`publish-lane-evidence` 生成 `lane-summary-v1`；CI 末尾的
`Delivery Observation` 递归聚合各 job 的证据为 `run-summary-v1`。这些对象都绑定 commit、manifest
digest 和上游对象 digest，来源不一致或证据缺失时 fail closed；Observation 不再通过跳过聚合产生
false-green。API、API runtime dependency closure、Web、
Migrator、Database、Database Runtime 属于同一 production artifact closure；closure 由 API workspace
dependencies 递归计算。Web shard 和 `publish-images.yml` 都会在使用前验证每个内容 digest、source
manifest digest 以及 closure 目录集合。

Coverage 是测量而非门禁（2026-10-25 起）：PR/Main CI 不做覆盖率仪表化，旧 `Coverage Oracle`
期望已删除；`nightly-audit.yml` 的 schedule/manual 车道继续执行完整 configured project lists，
上传覆盖率报告作为 affected 图漏检的独立观测。PR `test:perf` 只执行固定
seed 的排序/service budget；真实 GC、memory 和长采样在 `performance-experiment` nightly 车道，
并明确要求 `--expose-gc`。

本地对应入口：

```bash
node tools/test-system-v2/inventory.mjs --check
node tools/test-system-v2/ruleset-check.mjs
node --test tools/test-system-v2/__tests__/*.test.mjs
node tools/ci-cd-platform/schema-check.mjs
node tools/ci-cd-platform/registry-check.mjs
node --test tools/ci-cd-platform/__tests__/*.test.mjs
node tools/ci-cd-platform/run-fault-injection.mjs
node --test tools/ci-cd-platform/__tests__/timing.test.mjs
pnpm nx run desktop:test:boundary
```

仓库只有一名维护者时，`.github/rulesets/main.json` 保留 active 的 `CI Check` required context 和 required thread resolution，
但 `required_approving_review_count`、code-owner review 和 last-push approval 均为 `0/false`；门禁是
自动化 `CI Check`，不是给自己制造一个无法产生第二人的 review 阻塞。

## 2026-08-05 V2 验收测量

本节同时记录历史容量数据和当前 PR fresh-run；历史数据仅用于成本对照，当前分支证据见下方 PR #209 段落。

当前 PR #209 的最终 [Actions run 31002955215](https://github.com/BakerSean168/memoflow/actions/runs/31002955215)
绑定 `30bf0da88b6541c9e5fe0c08410c5fd51ff1275d`，七个稳定 Oracle、四个 Web shard 和 Delivery Observation
全部通过。`run-summary-v1` 的 setup 为 `368,804 ms`，lane execution 为 `1,965,337 ms`，最长 lane 为
`284,813 ms`，`missingLanes: []`；四个 Web shard 为约 5:56、5:42、5:51、5:46，证据 artifact 使用唯一
`shard-0..3` suffix。该 run 是当前分支 fresh-run 证据，但仍不足以替代至少五次 comparable timing 的
P50/P95 与 runner-minute 统计。

[Actions run 30968872885](https://github.com/BakerSean168/memoflow/actions/runs/30968872885) 的七个
required Oracle 全部通过。workflow 从 `02:16:23Z` 到 `02:24:46Z`，墙钟约 8:23；所有 job 的
实际执行时间合计 2,981 秒，即 49.68 runner-minutes。该执行成本高于 42.3 分钟基线，因此不能视为
runner-minutes 目标已达成；公开仓库 billing API 返回的 0 billable milliseconds 是不同指标。

此前 run 的 Web shard 实际 job 时长为 6:48、7:29、5:53、7:11。由 JSON report 聚合的逐 spec baseline
重新分配后，四个 shard 估算测试时长为 253,478、254,607、257,794、254,664 毫秒，估算极差
4.32 秒，明显低于此前约 1:42 的观测极差。最终 run 的四个 shard 实际 job 时长为 6:44、7:03、
6:55、7:09，实际极差 25 秒。后续 run 应继续从 Actions artifact 记录墙钟、执行
runner-minutes、cache 命中和实际 shard 平衡，不把单次测量写成永久保证。

手动触发的完整 Coverage workflow [run 30970172037](https://github.com/BakerSean168/memoflow/actions/runs/30970172037)
历史性地验证过 full configured project selection 不再 false-green（当时还在 threshold 时代，
`schedule:test:coverage:use-cases` 的 branch coverage `56.33% < 60%` 使其失败）。2026-10-25 起
固定百分比门禁已删除，nightly audit 只测量与上传报告；测试行为失败仍 fail closed。

覆盖 nightly-audit 修复后的最终 PR head `c85759766` 由
[Actions run 30971373609](https://github.com/BakerSean168/memoflow/actions/runs/30971373609) 验证，七个
Oracle 全部通过；该 run 的墙钟约 8:43，job execution 合计 3,045 秒（50.75 runner-minutes）。

随后移除 Web shard 的重复 API build，并缓存 Playwright 浏览器；[run 30972424422](https://github.com/BakerSean168/memoflow/actions/runs/30972424422)
仍七个 Oracle 全部通过，但 execution 为 49.32 runner-minutes，未达到 42.3 基线。该实验保留在实现
中，因为它删除了真实重复工作，即使共享 runner 噪声使单次测量没有显著下降。

前一轮 main-based 重构 PR head `c17b9c2d2` 的 [run 30998745996](https://github.com/BakerSean168/memoflow/actions/runs/30998745996)
七个稳定 Oracle、四个 Web shard 和 `Delivery Observation` 全部通过。`run-summary-v1` 的 manifest digest
为 `6765b888d8eaed32786f8584056c1efcc632581fcce79266cc5c762a0e953e16`，summary digest 为
`69f7af0590a5c6e99569cb46c336a34ae9b6470ac25bb52ebabff87b7af92484`；setup `270,994 ms`，lane execution
`1,079,501 ms`，最长 lane `283,413 ms`，`missingLanes: []`。四个 Web shard job 为 5:41、5:43、5:44、
6:02。该 run 是 fresh-run 验证，不替代至少五次 comparable run 的 P50/P95 统计；runner-minutes 仍需从
同范围 Actions run 的 job receipts 计算，不能用 billing API 的 0 值替代。

前一轮 CI/CD Platform V2 head `49775316f` 的 [run 30995540184](https://github.com/BakerSean168/memoflow/actions/runs/30995540184)
再次通过全部稳定 Oracle、四个 Web shard 和 `Delivery Observation`。run summary 记录 setup `279,052 ms`、
lane execution `1,116,601 ms`、最长 lane `284,047 ms`，manifest digest
`615b3976e39aefb891d5f0f95083afd18497c91fa6d2b7cc1d64b83e1adce80c`，无 failures、无 missing lanes。
四个 Web shard 的实际 job 时长为 5:52、5:58、6:08、6:16，极差 24 秒；这证明 shard 平衡和登录
helper 修复在该 head 上有效，但仍不足以替代至少五次 comparable timing 的 P50/P95 验收。

## Actions cache 预算与清理（#504）

缓存是可丢弃的加速数据，构建产物和交付证据仍使用 artifacts。`setup-nx-affected-job`
通过 `restore-main-cache` 在所有 ref restore，只有 `refs/heads/main` 且非 PR 事件允许
`actions/cache` 在整个 job 成功后保存；PR、功能分支和 tag 不保存。uv 的自动缓存也仅 main
开启（其他 ref 不启用 uv 自动缓存）。禁止在 PR checkout 后授予缓存清理权限。

| 类别          | main 总预算（十进制 GB） | Key / 隔离维度                                                  | 清理                                           |
| ------------- | -----------------------: | --------------------------------------------------------------- | ---------------------------------------------- |
| Docker/buildx |                     1.00 | 每个 candidate component 独立 scope；`mode=min`，仅 main export | 超预算按最近访问时间从旧到新删除               |
| pnpm store    |                     2.00 | OS + arch + lockfile hash（所有 job/分片共享一份）              | 同上；不跨 lockfile fallback                   |
| Nx            |                     3.00 | OS + job + package/lockfile hash + arch + matrix variant + SHA  | 同上；fallback 仅限相同 job、variant、依赖版本 |
| Playwright    |                     0.75 | OS + arch + lockfile hash（所有 job/分片共享一份）              | 同上；不跨浏览器版本 fallback                  |
| uv            |                     0.25 | setup-uv action 自有依赖 key，仅 main 开启                      | 同上                                           |
| **合计**      |                 **7.00** | 为未管理条目预留 <1 GB；仓库稳态目标 **<8 GB**                  | 每日检查；这是 sweep 后预算，不是上传时硬配额  |

非矩阵 job 的 `cache-variant` 默认为 `single`；Web 使用稳定的 `strategy.job-index`
（`web-0..N-1`），shadow runner 使用 `matrix.child`，避免各分片的 Nx 快照争用同一个 immutable key。
pnpm store 与 Playwright 浏览器内容只由 lockfile 决定，所有 job/分片共享同一条目，不按 variant 复制；Nx 按 job + variant 隔离。
Docker 保留 GHA 后端，避免为小规模 final-stage 缓存增加 GHCR tag/生命周期管理。
`mode=min` 不保存全部中间构建层；是否影响真实构建时间须按下述计划观测。

`cache-cleanup.yml` 在 PR closed（包括 merge）和每日 03:23 UTC 运行，通过仓库变量
`ACTIONS_CACHE_CLEANUP_ENABLED=true` 显式启用。**2026-10-19 冲刺期间保持未启用，冲刺结束由编排者启用**。
workflow 级 permissions 为空，仅 cleanup job 有 `actions: write`、`pull-requests: read`、
`contents: read`；`pull_request_target` 只 checkout main，禁用 credential persistence，永不执行 PR 代码。
脚本分页读取全部 cache，查询实际 PR state，只删除确认 closed 的 `refs/pull/<n>/merge`，
然后按前缀预算删除 main 的最久未访问条目（包含旧 key 格式）；open PR、其他 branch、tag 和未知前缀
不会推断为可删除。PR closed 触发也执行相同幂等 sweep，定时 sweep 补偿遗漏事件。
删除/API 失败会使任务失败，不吞错或自动重试。清理前打印计划、清理后打印 usage；没有 all-cache 删除入口。

预算清理可牺牲旧快照和冷门 shard 的命中率。历史实验 branch 等未管理条目仍可能使总量超标，
以每日 usage 为准，超过预留空间时由 owner 逐 ref 确认处置，不能把预算视为已满足验收。
本次不手工批量删除既有缓存，也不在冲刺期间触发 workflow 或等待 GitHub CI。

真实 CI 验证待冲刺结束：启用 CI/清理后，连续 7 天每日保存 `gh cache list --limit 1000
--json key,sizeInBytes,lastAccessedAt,ref` 与 cache usage，要求每天 <8,000,000,000 bytes 且无驱逐压力。
至少采集变更前后各 5 次可比 PR run（相同 lockfile、affected lanes、runner OS），从
workspace receipt 按 job/shard 比较 pnpm/Nx/Playwright exact 命中率，并用 cache action 日志区分 fallback 与 cold miss。
从变更前后各至少 5 次可比 main candidate run 按 component 比较 Docker build step P50/P95，
分开 cold/warm，记录 Run URL、SHA、耗时和缓存状态；warm Docker P50 回退 >10% 时调查。
这些命中率、时间和一周稳态证据均延期至冲刺结束，不能用本地工具测试替代。
