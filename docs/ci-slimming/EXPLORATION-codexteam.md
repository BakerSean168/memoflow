---
tags: [analysis, ci, testing]
description: CI/CD 与测试精简探索；固定 SHA、删除/迁移边界、成本模型与可独立合并的实施阶段
created: 2026-10-22T00:00:00Z
updated: 2026-10-22T00:00:00Z
---

# MemoFlow CI/CD 精简方案（只读探索）

## 0. 决策摘要

**主要问题不是 Nx 不够快，而是 PR 同时承担了业务回归、UI 展示矩阵、coverage/perf 和一套多层测试治理运行时。发布侧又把必要的身份校验与不必要的重复准备混在一起。** 换 Turbo、加更多 shard 或继续把字符串改成 AST，都不是本轮解法。

建议按三条线实施：

1. **删除源码锁，而不是搬家。** 204 个 surface 文件逐个退出这个命名/保障模式；其中真实行为保留。60 个残余文本锁退出；334 条 AST 规则不能因为叫 AST 就自动留下。仅为权限、持久化、协议边界补少量真正有语义的行为/类型/依赖检查。
2. **UI 只留一个 Storybook 执行面。** 迁入组件交互、焦点/键盘、视觉回归；真实登录、持久化、跨进程、密钥安全继续用真实集成/E2E。Web 的 13 份 Playwright 配置最终变为 **3 份**，不是把后端集成伪装成 story。
3. **PR 只证明本次风险；发布只验证交付特有风险。** 删除七个非权威 Oracle job；coverage/perf 和宽矩阵出 PR；既有 affected、缓存预算、main 证据复用按现状收尾，不重复立项。

**测算目标而非已实现结果：** 阶段 1 PR 约 11–14 分钟 / 56–63 job-min；阶段 2 约 9–11 分钟 / 38–44 job-min；阶段 3 普通 affected PR 约 7–10 分钟 / 30–35 job-min（相对 72 降 51–58%）。发布日的机器执行链预算 38–45 分钟。全仓冷启动/根依赖变更不能凭现有证据承诺相同上限，必须单独验收，不能靠跳过高风险检查凑数字。

## 1. 证据边界与口径

- 工作区：`/home/dev/projects/memoflow-lane-ci`；分支：`docs/ci-slimming-exploration-20261022`。
- 固定分析基线：`origin/main@5bc516e0228a399b1d6e56ffa4947d0b6b608212`。所有文件数量/清单均指此 SHA。
- 耗时基线直接采用用户已核验的 2026-10-22 数据：17 workflows / 4269 行，CI 750 行；CI 近十次 wall 11.6–28.4 分钟、典型约 15；单轮约 72 job-min；Candidate 7–38.6 分钟。不重新计算这组统计。
- 下文 **F=代码/API事实，B=用户实测基线，E=估算/预算，U=尚未验收**。文件数不等于测试 case 数，不按“删 20% 文件就快 20%”推算。
- 只执行读取、Git/GitHub 查询和报告验证；没有触发 Actions、清缓存、改 ruleset、改 Issue、建 PR、部署或修改产品/测试/workflow。
- CodeGraph / nx-mcp 在本会话工具发现中未提供可用查询工具；改为读取 owner 配置和实现，未假称做过图工具验证。未运行有输出副作用的 inventory 生成器来“刷新”证据。

### 1.1 活状态与旧说明的冲突

GitHub API 本轮查询：17 个仓库 workflow 均 `active`；main ruleset `9183921` active，但规则仅 deletion / non_fast_forward，**没有 required CI Check**。这与 AGENTS 临时冲刺条款“CI 停用”和 10 月 20 日 Issue 评论已不一致。最新历史示例：

- [main CI 39618192736](https://github.com/BakerSean168/memoflow/actions/runs/39618192736)，基线 SHA，success。
- [Candidate 39620473716](https://github.com/BakerSean168/memoflow/actions/runs/39620473716)，同 SHA，三个镜像、runtime、staging promotion 均实际执行。
- [Release Publish 39622860524](https://github.com/BakerSean168/memoflow/actions/runs/39622860524)，**只有 resolve 成功，其余发布 lane skipped**。workflow success 不等于公开 release 已交付。

本报告不改变这些状态。实施前 owner 应确认冲刺是否结束、恢复 required check 的时点；不能用旧“disabled”记录解释今天的性能，也不能把 resolve-only run 当完整发布基准。

### 1.2 六项既有优化复核

| 项目 | 固定 SHA 的实际状态（F） | 本轮决策 |
|---|---|---|
| #502 source-lock | 34 entries / 60 locks；另有 334 条 `app-vue-structure-rules.json`；台账实际按 372 条旧锁归类，不是原 Issue 的 373 | 已落地，不是回退；但多数只是换形式，须再次按价值删除，不能再次提“迁成 334 条 AST” |
| #504 cache | `restore-main-cache`、PR 只读、Nx job/variant/SHA key、SQLite index、Docker gha `scope + mode=min` 已在代码中 | 预算仍未达标；本轮实时总量 11,206,469,724 bytes，522 entries，约 11.21 GB / 10.44 GiB。buildkit 约 7.52 GB、Nx 2.37 GB、pnpm 1.00 GB、浏览器 0.28 GB。优先把 Docker 层缓存移出 Actions，不再重复 PR 只读改造 |
| #505 retries | AI workspace 已 `retries: 0` + failOnFlakyTests；主 flow / audit / visual 均 0 | 已生效。范围外仍有 ai-provider=1、shell=1、desktop-screenshot=1、sync=2；按新项目入口统一零 retry，不把 #505 说成全仓已归零 |
| #506 动态 shard | 已有动态 matrix；target 397s（含 setup 97s），上限 8、fallback 4；receipt 校验实际文件覆盖 | 已落地，但只有变更文件全部是 canonical spec 本身才收窄，普通产品源码变化仍全集 fallback；视觉/Provider 附加工作不在 28-spec 时长模型内 |
| #507 Nx 23.3 | 升级及非阻塞 shadow 已在；scope 用 `nx show projects --affected --with-target`，不是一次 task-level 选集。Issue 的 36-case 回放不是 30 个真实 PR 观察 | 不重复升级。切换 task-based 需完成原观察与输入审计；不能把 lint 的 legacy 超选误判为新 selector 漏测 |
| #508 main 去重 | 已有 actual checkout/tree、PR evidence、digest 链、reuse 与 fail-closed Full Audit；Candidate/Release 已验证来源并复用 CI build | 不再提“新增 main 去重”。需核实真实 reuse 比例、fallback 理由，root/tools/config 变更仍应全量；不要求每次 merge 都能复用 |

缓存数是实时读数，前缀汇总与 usage API 不具备事务快照一致性；不作为精确计费结算。缓存不足也不是 CI 慢的唯一根因。

## 2. 三层成本地图

### 2.1 Workflow 层：17 份不等于 17 条串行发布链

| Workflow 文件 | 当前触发/职责（F） | wall / job-min（B/E；非实测者明确保留未知） | 目标 |
|---|---|---|---|
| `ci.yml` | PR/main/schedule/dispatch；scope、quality、verification、Web、gate | B 11.6–28.4 / ~72 | 保留 PR/main；nightly 全量移至一个 audit 入口 |
| `candidate-publish.yml` | successful main CI workflow_run；3 components 并行 → candidate-set → staging runtime → staging channel | B 7–38.6；E 总 job-min 不能由 wall 唯一确定，至少 wall，最多约各阶段 wall×并行宽度 | 保留；原生双架构构建/registry cache；避免每个普通 merge 无价值发布 |
| `release-please.yml` | 手工 Prepare Release PR | 未提供运行耗时；E 编排 ~1–2 / ~1–2 | 保留；人工等待不算机器执行预算 |
| `release-publish.yml` | Candidate workflow_run / dispatch；resolve → draft → desktop 与 Docker 并行 → postflight | U 真正 release 的 wall；resolve-only success 不计 | 保留唯一发布编排，不吞并权限边界 |
| `release-assets.yml` | workflow_call / dispatch；跨平台 build/sign/package/smoke/upload | U；E 预算最慢平台 15–18，job-min=各平台实测时长之和 | 保留 reusable；复用同一个安装包做安装/更新测试 |
| `desktop-update-e2e.yml` | call / dispatch；Windows NSIS 与 Linux AppImage N→N+1 | U；当前另行 build N+1，与 assets 重复 | 保留 reusable，改消费已构建 exact artifact；不得删除升级验收 |
| `publish-images.yml` | call / dispatch；按 candidate digest 晋升，不 rebuild | E 编排/复制 1–3，非重建预算 | 保留 reusable，不把它当第三次 Docker 构建 |
| `deploy-production.yml` | 手工验证公开 release → 选择 production manifest | U；E selection 1–2；不是主机实际 rollout | 保留手工权限；生产 watcher/迁移健康证据另算 |
| `coverage.yml` | schedule / dispatch；10 个 governed projects | U；E 与 unit 同量级起步、另加 coverage instrumentation，不能当免费 | 合并到 nightly-audit |
| `web-flow-audit.yml` | schedule / dispatch；5 个补充 spec + failure issue 通知 | U；E 按运行集合加 setup；目前不是 28 个 PR spec 的全量替代 | 合并到 nightly-audit，保留失败通知和完整集合 |
| `ci-platform-audit.yml` | schedule / dispatch；fault matrix | U；按每次实际 job wall计 | 合并到 nightly-audit 独立 job |
| `performance-experiment.yml` | schedule / dispatch；实验性 perf | U；不从 2 个 bench 文件推 wall | 合并到 nightly-audit，趋势监控而非普通 PR gate |
| `quality-runner-shadow.yml` | manual；split/consolidated 对照 | 无日常触发，删除本身不会省普通 PR 时间 | 阶段 3 删除，完成一次有界对照后不常驻 |
| `release-health.yml` | schedule / dispatch；release backlog 审计 | U；轻量 GitHub API 工作，不在关键路径 | 合并入 nightly-audit 的独立低权限 job |
| `cache-cleanup.yml` | schedule / dispatch | U；维护成本不等于产品测试 | 保留独立管理权限，限制频率与预算 |
| `mirror-runtime-images.yml` | main path-filter / dispatch；固定第三方 runtime 镜像镜像 | U；按需网络任务，不是每个 main 都必跑 | 保留，核对 pin/digest path filter，不删镜像来源校验 |
| `pages.yml` | main path-filter / dispatch；项目展示站 | U；独立网站发布 | 保留，不放入产品 release 的 needs |

#### 补充：非CI主基线的单次历史样本（F，非均值/SLO）

为补齐资源地图，只读查询各workflow最近8条记录中的一条success；elapsed取created→updated，job-min取非skipped jobs的execution wall之和，不含计费取整。**不同SHA、不同触发/平台，不可相加为一次端到端发布，也不覆盖用户给定的CI/Candidate统计。**

| Workflow | Run ID | elapsed min | job-min | 样本限制 |
|---|---:|---:|---:|---|
| Coverage | 39559347206 | 6.15 | 6.08 | 2026-10-21 |
| Web Flow Audit | 39551324725 | 8.55 | 8.48 | 5个补充spec，不是28全量 |
| CI Platform Audit | 39235196435 | 0.27 | 0.20 | 2026-10-19 |
| Performance Experiment | 39568186231 | 1.20 | 1.13 | 2026-10-21 |
| Quality Runner Shadow | 34008557924 | 8.38 | 18.27 | 2026-09-06旧拓扑，不能代替现状合job实验 |
| Release Health | 39208779840 | 0.15 | 0.08 | 2026-10-19 |
| Cache Cleanup | — | U | U | 最近8条无success，不臆测 |
| Mirror Runtime Images | 39551082589 | 1.65 | 1.58 | 2026-10-21 |
| Pages | 38429903089 | 0.40 | 0.30 | 2026-10-13 |
| Prepare Release | 39587711923 | 0.63 | 0.57 | 不含人审release PR等待 |
| Release Assets | 39088705384 | 11.85 | 11.75 | 仅linux-x64 recovery build，不含全平台/完整升级gate |
| Desktop Update E2E | 39557716545 | **23.73** | **23.63** | 仅Windows NSIS N→N+1；已足以挑战15–17min目标 |
| Publish Images | 39047626860 | 2.43 | 2.25 | digest promotion路径 |
| Deploy Production | 39630925990 | 3.22 | 3.03 | 仅验证/selection，不证明主机健康 |
| Release Publish | 39622860524 | 1.18 | 0.25 | resolve-only，其余skipped，不能用于发布SLO |

Run详情统一为 `https://github.com/BakerSean168/memoflow/actions/runs/<Run ID>`。尤其Windows样本说明：单artifact复用必须真实消除约7–9min重复准备，才可能达到发布预算；若节省不足，这个方案的45min全链目标仍未达成。不能拿linux recovery样本替代Windows安装升级。

**文件数目标 17 → 12：** coverage/web-flow-audit/ci-platform-audit/performance-experiment/release-health 五份合成一份 `nightly-audit.yml`（净减四）；删除 quality-runner-shadow（净减一）。其余 11 份保留。不要为了“少几个 YAML”把发布写权限提升到 PR workflow。以上 nightly job 并行，不应合成一个串行大 shell。

### 2.2 CI job 层与关键路径

现拓扑：`scope → {governance, lint, unit×3, typecheck, build, verification}`；`scope+build → web×N`。verification 在同一 runner **顺序**执行 boundary、integration、coverage、performance；多个 prisma-push 再准备。七个 Oracle 只读 child 状态，最终 CI Check 直接依赖原始 children，**根本不依赖这些 Oracle**。

| 块 | B wall（min） | E 单轮 job-min 分摊 | 主要成本/重叠 |
|---|---:|---:|---|
| Web×4 | 每片 6.7–11 | 约 32（范围 26.8–44；32 仅校准值） | 4×DB/browser/setup/字体；业务 flow 后再构建两种 visual fixture；首片额外 Provider |
| Unit×3 | 每片 5–6 | 16.5 | app-vue 占主导；许多源码扫描；与 coverage 重复跑 |
| Verification Children | 9.3 | 9.3 | 几种不同风险顺序相加，coverage/perf 拖延真实边界测试 |
| Typecheck | 3.8 | 3.8 | `^build` 闭包可能与 Build 在不同 runner 重复计算 |
| Governance | 2.8 | 2.8 | inventory/target checks + governance-check；根 target 又依赖同类检查及规则测试 |
| Build | 2.7 | 2.7 | affected + Web/API/database 保底闭包；给 Web 增加串行前置 |
| Static Analysis | 2.1 | 2.1 | 与其他 quality job 重复 install，非 type-aware lint 无需依赖扩散 |
| Scope、7 Oracle、gate、observation、shadow 等 | 非独立提供 | 约 2.8（72 减上列校准分摊） | 小 job 也有 checkout/排队；不得把这 2.8 当实际测得的 Oracle 总耗时 |
| **合计** | 不能把并行 wall 相加 | **72** | 分摊仅用来预算，非最慢 run 的精确重建 |

关键路径近似 `scope 0.7–1.2 + build 2.7 + slowest Web 6.7–11 + gate 0.2–0.5` = **10.3–15.4 分钟**；28.4 分钟尾部还可能有队列、冷缓存、外部安装/失败重试。只删几个 Oracle 不会把 15 变 5。

`delivery-observation` 当前 download-artifact 未按名称筛选，会下载所有 artifact，可能包括 build closure。应只取 lane evidence；与 CI Check 共用 runner/summary 步骤即可，**不能让可观测性的成功代替 gate**。

### 2.3 测试层：消除重复口径

| 统计 | F 固定 SHA 数量 | 解释 |
|---|---:|---|
| `*.spec.ts` / `*.test.ts` | 1324 | 对上用户 1324；不是所有扩展名总数 |
| 全 tracked spec/test（含 mjs/mts） | 1411 = 1324 ts + 78 mjs + 9 mts | inventory 含 bench，故 generated primary 为 1413 |
| inventory primary | unit 1192 / governance 78 / e2e 67 / integration 53 / boundary-main 10 / boundary-ipc 8 / smoke 3 / perf 2 | collector 88；这是已提交快照，不是本轮重新执行 collector 的证明 |
| surface 文件 | 204 | 186 含 readFileSync；18 不含。后者也含 existsSync/反射/真实行为，不能一键按后缀删 |
| 含 readFileSync 的 spec/test | 237：ts 216 / mjs 17 / mts 4 | 比背景约 212 多；基线/扩展名及混合文件口径不同；**读 fixture/结果不是读源码** |
| surface 与 read 的并集 | 255 = 204 + 237 − 186 | 非 surface 的 read 文件 51，附录逐一分类 |
| Web E2E spec | 56 | 28 canonical、5 nightly supplemental，其余分散在 local-docker/reference/visual/native 等 |
| Story 文件 | 68 = ui-vue-shadcn 56 + app-vue 12 | **0 个 `play:`**；当前 Storybook 不是测试体系 |
| app-vue spec/test | 251 | 162 引入 Vue Test Utils；其中约 130 是 render/组件/页面类候选，32 位于 composable/use* 路径，不能误删生命周期/异步状态测试 |

背景“106 个 Playwright 相关文件”不是 106 个 E2E 测试：tracked spec/test 中直接引用 `@playwright/test` 或 `playwright` 的为 66，另有 helpers/config/harness/baselines 等。报告保留背景 106 作为相关资产口径，不拿它计算可删除数量。

重要：inventory 的 duplicate=0 只表示 **primarySuite 不跨类别重复**。同一个文件被同 suite 的多个 config 收集、unit 再跑 coverage、UI 与 visual 重复覆盖，都不会因此消失。

## 3. 对照 T3 Code：快在哪里，哪些不能照抄

读取公开 `pingdotgg/t3code` 的 `.github/workflows/ci.yml`、`.github/actions/setup-ci-deps/action.yml`、根 `package.json`；对照快照 SHA `680152e27b2a961686389ca69a1557cbb2c55f08`。wall 采用用户近 12 次均值 4.3 / 最大 5.2 分钟；公开 main 是移动目标，不能保证它就是上述 12 次的版本。

| 维度 | T3 Code 当前事实 | MemoFlow 当前差距 | 采纳/拒绝 |
|---|---|---|---|
| 工具链 | `vp run` / Vite+，typecheck `--cache`；当前 workflow **没有 Turbo/Nx 调用** | Nx 已有 affected/task cache，范围选择却仍多次查 project graph | 不迁 Turbo。学习目标级选择与薄编排，不把 4.3 归因于 Turbo |
| runner | Linux 主要 blacksmith 8 vCPU，server shards 4 vCPU，detector/check 2 vCPU | `ubuntu-latest`/24.04；机器性能不等价 | 先少做工作。若采购更强 runner，单列费用，不把加核的 wall 收益冒充 job-min 减半 |
| 分工 | lint；build+typecheck 共 install 并发；packages test；web browser tests；server **8 shards**；Rust/native/release smoke按需 | verification 多种风险串行；Web 等 build；Oracle 多层 | 不是“job 越少越快”：保留长任务并行、合并便宜 setup，不盲目把所有 quality 串进一台 |
| affected | changes 读 package manifests/dependents，PR 跳过无关，检测失败全跑；server 自检避免等待 changes | scope 全 install 后多次 Nx；Web 普通源码变更全集 | 简化 detector，缓存/单次复用图；不另造一套 package graph 取代 Nx |
| checkout | sparse、常用 depth 2，排除 vendored assets | 多个 job `fetch-depth: 0` | scope 保留可证实 base；叶子按 exact SHA +必要 base 拉取；不能盲目 depth2 导致 affected 漏测 |
| install cache | Vite+ exact version cache；pnpm store；记录同盘 hardlink 比 sticky 跨盘更快 | Actions cache 被 Docker 层占去 ~7.52GB | 复用 pnpm/main只读已有策略；Docker迁 registry；不在多种存储间复制 node_modules |
| 浏览器 | pinned Playwright version +OS/arch cache；headless shell；缺共享库才 apt | lockfile cache；每 Web shard apt fonts，另起 visual Vite build | Chromium shell 能力逐项核对；把字体固定在 Storybook执行环境一次，而非所有业务 shard |
| 测试层 | web Chromium React tests、server integration；CI 无 MemoFlow 式完整产品 visual矩阵及 PostgreSQL Web CRUD lane | MemoFlow承担真实 DB/API、跨端、产品视觉与更多治理 | 不能声称相同覆盖下能无条件达到 4.3；保留后端风险，把 UI 降层 |
| gate | 一个 Check，校验 expected skip/cancel/failure；无多层 Oracle | 已有 CI Check，却还有七个不参与 gate 的 Oracle | 删除七个中间 job；保留正确的 fail-closed skip语义和矩阵覆盖证据 |
| trigger | PR + main，PR cancel；push 不被新 run 取消 | CI同文件还有 nightly；main/Candidate/Release 连续触发 | nightly 独立；PR cancel过期；发布 mutation不取消到一半；合并SHA身份不省 |

T3 的 8 server shards 可能消耗不少 runner-minutes，且 runner价格不同；没有它的同口径 job-min 数据，不以“4.3 vs15”推算费用优势，也不认为它没有深入集成测试。

## 4. 删除/改造/保留台账

### 4.1 Surface：204 个文件全部退出 surface 模式

动作指**断言去向**，不是净删除文件数。附录列出每个文件，防止只给一个模糊 glob。

| 类别 | 文件数 | 决策与替代 |
|---|---:|---|
| D：含源码读取的历史双轨、barrel、composition、keep-boundary等 | 143 | 删除文本/路径/注释/调用写法锁；混合文件中的运行时测试提取到普通 spec，不能连带删掉。仅为业务风险保留行为，不按旧实现逐句补 AST |
| M：含源码读取的安全、ownership、输入解析、envelope、RPC等 | 43 | 删除旧源码断言前，改成 identity A/B越权、序列化无秘密、无效/空/边界输入、持久化CAS/回滚、HTTP/IPC wire行为；RPC映射用 `satisfies`/类型穷尽性。附录指定完整集合 |
| D：不读源码但锁路径/空壳导出 | 4 | desktop-electron-contracts-path、ai-provider-config-barrel、goal-application-types-barrel、desktop-update-service。前三是历史文件存在性，末者只测 symbol；直接删 |
| M：不读源码但反射/自造类型样本 | 3 | AIConversation / AIProviderConfig repository surface 改为真实 A/B隔离读写；task-goal-contribution-v2 去 `as Binding` 自证，合并到现有 schema parse/type-negative用例 |
| K：真实行为 | 11 | OAuth env隔离、tokenize、clamp、date/datetime/time-range、plain-object、路由映射、IPC envelope、Goal assembly fail-closed、notification metrics；改普通文件名/合并相邻 spec，不删除语义 |
| **合计** | **204** | **D147 / M46 / K11**；D不代表147个文件可不看内容整删 |

D/M 分组是本报告的实施分流，不是声称逐个旧 assertion 已找到等价行为覆盖。批量执行规则：每个混合文件先保留运行时代码再删除源码锁；遇到真实安全/事务语义未被43文件列表覆盖，升为 M，不为了守住文件数量整删。**净删除文件数须由实施 diff给出，不能将204宣传为204个无价值测试。**

代表性证据：`packages/utils/src/shared/new-id-keep-boundary.surface.spec.ts` 既检查自身“Residual 1135”注释，又有 UUID runtime校验，前者删除后者保留；`packages/ai/src/server/infrastructure/__tests__/ai-provider-secret-ownership.surface.spec.ts` 混有真实序列化检查，必须保留/强化秘密不进入wire的行为。

### 4.2 #502 的60文本锁、334 AST：不把源码锁换壳留下

可复现分流按 manifest 的 `id` / `contract`，完整 ID 集合如下：

`task-authority`、`normal-planner-scheduler-boundary`、`scheduler-boundary`、`planner-owner-command-boundary`、`notification-authority`、`desktop-auth-api-key-dual`、`desktop-bridge-electron-bridge-dual`、`use-ai-chat-host-dispatch`、`use-data-portability`、`service-client-port-facade-keep-boundary`、`AISettings.provider-onboarding-v2`、`unverified-email-banner`。

| 资产 | 非上述ID | 上述ID | 最终旧锁保留 |
|---|---:|---:|---:|
| 60 text locks | **D52** | **M8** | **0** |
| 334 AST rules | **D302** | **M32** | **0** |

这是规则条目数，不是文件数，也不能与204相加。D中 UI状态/布局的有效验收进入 Storybook；D中退休文件/词语/指定方法名/指定class链直接放弃。M8/32不是40个新测试额度，而是合并为少数风险场景（权限/owner命令路由/密钥隔离/未验证状态），复用现有owner行为tests。

现有 AST rule 仍大量使用 requireIdentifiers(83)、requireElements(102)、requireAttributes(65)、expression regex等（同一rule可多种，不可相加）。**AST能忽略格式，但不等于能证明业务语义**；例如固定 DOM/class/identifier 仍会锁死正常重构。仅保留/扩展通用 ESLint依赖规则、类型穷尽检查、禁止跨server/client秘密依赖这类结构约束；不新建另一份逐文件baseline。

删除旧engine时一起删除其专用 fixture tests/manifest调用，保留治理中真正的通用边界规则。源码锁 engine 自测能证明“锁工作”，不能证明“锁值得存在”。`docs/analysis/2026-10-19-app-vue-source-lock-ledger.md` 保留历史并注明退休，不继续作为CI输入契约。

### 4.3 非 surface 的51个readFileSync文件

附录逐文件给动作与计数。总体原则：

- **留**读取生成产物、SQL执行fixture、日志/registry、规范化JSON fixture的行为测试。Desktop restart、watcher回滚、真实Prisma transaction不是源码锁。
- **改**混合文件，只删读取生产源码/检查字符串的子case；保留CAS、failure classification、migration事务等行为。Prisma schema约束以临时DB实际写入失败、跨owner访问失败证明，不把 SQL文本逐字符一致当正确性。
- **删**退休文件/双语JSDoc/历史架构宣言自证；release身份、digest、权限不能一并删。配置要验证则解析YAML/JSON做语义检查，或运行fixture；不是把toContain改成另一种字符串匹配。

特别保留 `packages/database/src/schema/ai-agent-registry.integration.test.ts` 与 `apps/api/src/__tests__/integration/agent-instance-registry.integration.test.ts` 的真实事务/隔离；即使项目不要求迁移兼容，当前生产初始化/升级还存在，就不能在CI精简中顺便去掉原子性测试。

### 4.4 Storybook承接范围与退出标准

当前 `.storybook` 实际在 `packages/ui-vue-shadcn/.storybook`；main 的两条 stories glob指向同一个 shadcn目录，**没有收集 app-vue 那12个stories**；comments/若干alias与当前目录也不一致。无 test-runner、无 build/test target、无 play函数。不能宣称“已有68个可直接运行的组件测试”。

实施只建一条原生链：`storybook build → serve static → test-runner(play + postVisit screenshot)`，通过 Nx target暴露；新增所需的官方test-runner/test工具，锁定与Storybook10兼容版本。不并建第二套Vitest浏览器模式或第三套私有visual runner。

1. 先修glob去重并纳入app-vue；实收story ID列表去重且有expected count，缺业务stories失败。清理失效alias、缺失mock路径；引入真实生产组件而不是复刻fixture UI。
2. 共享 DI/service doubles、fixed clock、theme/locale/viewport decorators；stories按真实 owner组织；每次运行清理teleport/router/provider状态。所有网络默认拒绝，MSW仅显式本地fixture；无真实DB/密钥。
3. `play`承接点击、键盘、焦点恢复、escape层级、错误/空/加载、retry UI。截图承接token/geometry/响应式。固定浏览器/OS/fonts/TZ/locale/motion；字体版本检查仍需，只执行一次。
4. app-vue 的 **130个render类文件为候选池**（并非130个整删许可）；32个composable/use*测试继续Vitest。优先ProductEditorFrame、ProductDateTimePicker、GoalDialog、TaskPlanForm、Schedule、AI composer，先Goal再Task验证可迁移，不另造参考业务。
5. 先迁9个独立browser fixture specs，后分owner迁上述130文件中的UI部分；每批证明原断言→story ID + play/screenshot映射、正常/错误/焦点/窄屏负控能红，再删重复spec与harness。业务提交/权限/并发测试保持Vitest/真实集成，不被story screenshot替换。
6. PR只跑受影响owner的交互与代表视觉state；shared token/primitive/global CSS变更扩展全部受影响stories。nightly跑完整theme×locale×viewport矩阵。不能按“只跑被改的story文件”选择。
7. 严禁自动更新baseline后直接绿；差异作为PR可审查产物，独立人工确认。浏览器依赖版本/字体变化单独PR重建baseline。

### 4.5 Web Playwright 配置：13 → 3（逐份处置）

| 当前配置（均在apps/web/） | 去向 | 删除/迁移的spec数与边界 |
|---|---|---|
| `playwright.config.ts` | **留**真实Web入口；projects区分 PR core / full / local-docker / real-oauth | 默认PR10个canonical spec；其余18 nightly；不同project显式env/server策略，不隐式启动多个环境 |
| `playwright.audit.config.ts` | 删，合并main的full project | 5个补充spec保留；不是无覆盖删除 |
| `playwright.ai-workspace.config.ts` | 删，使用main的AI project/过滤 | 7个goal-workflow文件已有canonical收集，删除重复collector不等于删7文件 |
| `playwright.ai-provider.config.ts` | 删，main的provider project | 2文件：onboarding真实安全路径保留，composer-states混合拆UI到story，真实reset/409保留集成 |
| `playwright.local-docker.config.ts` | 删，main的external-runtime project | 复用4个auth+goal及6个local-docker文件；globalSetup、URL校验与timezone不丢，不新增后端来冒充部署验收 |
| `playwright.oauth-real.config.ts` | 删，main的显式headed external project | 1文件保留手工；不能普通PR启动真人OAuth；无env时不可被意外收集 |
| `playwright.goal-reference.config.ts` | 删，Storybook | 2文件迁；production组件+double本就是story职责 |
| `playwright.task-visual-grammar.config.ts` | 删，Storybook | 1文件迁 |
| `playwright.schedule-presentation-authority.config.ts` | 删，Storybook | 3文件迁 |
| `playwright.visual-regression.config.ts` | 删，Storybook | matrix/scrollbar-gutter/composer-footer共3文件迁，保留焦点、inert、错误恢复等行为，不只搬PNG |
| `playwright.desktop-screenshot.config.ts` | 删，与shell同native project | 2文件中thesis/debug capture退出gate；真正Electron capture保留opt-in，不声称Storybook可证明原生壳 |
| `playwright.shell.config.ts` | **留**native入口，接收desktop capture project | 3 shell文件 + 2 capture文件；native smoke按desktop风险执行 |
| `playwright.sync.config.ts` | **留**跨端入口 | 1文件保留；真实PowerSync/IPC/进程重启不能用story替代 |

三份均retries=0；real OAuth、external runtime、native、sync不默认一起跑。main config的多个projects用不同outdir/报告/端口；先以 `--list` 验证 exact集合/无交叉收集，再做runtime验证。不能合并配置后变成“每次启动全部servers”。

**可退出E2E资产的确定迁移数：9个独立fixture specs（2+1+3+3）**，完整路径（以下均相对 `apps/web/e2e/`）：

- `goal/reference/goal-reference.spec.ts`
- `goal/reference/goal-business-panel.spec.ts`
- `task/visual-grammar/task-visual-grammar.spec.ts`
- `schedule/presentation-authority/task-quick.spec.ts`
- `schedule/presentation-authority/schedule-presentation-authority.spec.ts`
- `schedule/presentation-authority/collision-regression.spec.ts`
- `visual-regression/matrix.spec.ts`
- `visual-regression/composer-footer.spec.ts`
- `visual-regression/scrollbar-gutter.spec.ts`

另外canonical UI-heavy/混合文件只搬UI断言，不能按文件全删。对应基线PNG、fixture HTML/Vite配置在story证据通过后一起清除，不保留双轨。

### 4.6 PR core精确集合：28 → 10，补充Provider安全验收

保留canonical：`authentication/auth-flow.spec.ts`、`goal/goal-crud.spec.ts`、`task/task-completion-loop.spec.ts`、`schedule/planner-task-revert.spec.ts`、`notification/notification-inbox-loop.spec.ts`、`note/note-workspace.spec.ts`、`routine/routine-configuration.spec.ts`、`user-settings/data-portability.spec.ts`、`ai/goal-workflow/goal-agent-approval.spec.ts`、`ai/goal-workflow/knowledge.spec.ts`。

另保留Provider onboarding的真实secret/identity路径（纳入统一分片计划，不再first-shard尾挂）。其余18个canonical移nightly；其中auth-page-contract、responsive-sidebar、workspace-shell的纯UI部分迁Storybook后可删重复case；password/OAuth/persistence/CAS/多session/SSE等原有行为继续按相关owner风险触发或nightly，不是永远不跑。

这里“core10”是普通PR下限，不是安全白名单上限：auth/cloud-auth变更增加password/login/register/OAuth；AI runtime变更增加checkpoint/multi-session/sse/task-approval/multi-engine；Task plan写链变更增加task-plan-crud；schedule变更增加schedule-calendar；preferences变更增加persistence/notifications；密钥变更强制Provider/API集成。root/未知范围全量，**不能以10分钟为由关闭这些扩展**。18个文件减少PR频率而不是删除18个保障。

## 5. 目标流水线与保障边界

### 5.1 PR DAG（保留Nx，不建第二套执行平台）

`scope → 并行 {quality, unit shards, boundary/integration, storybook}`；`scope → build → core Web shards`；最终唯一 `CI Check`。Storybook不等API build/Postgres。

- **scope**：一次生成manifest、一次图/任务选择复用；base/head为真实checkout身份；未知/图失败不产空集，fail-closed走全量或明确失败。初期保留现有工具，而非冒险手写新detector。
- **quality**：先试把lint/typecheck/build合runner共享install、Nx cache，受控并行；不能把3.8+2.1+2.7串成8.6关键路径。若CPU竞争使Web build更晚，保留独立build，只合lint/typecheck。现有quality-shadow已能做对照，不另造benchmark框架。
- **unit**：先保留现有3片/只启动非空；Storybook迁移后按实际残余时长再降2片。不要先把3×5.5改2片而假称wall不变。
- **verification**：普通PR去coverage/perf。真实DB与desktop原生状态隔离；涉及owner的integration保留；仅当时长超过预算再拆boundary/integration成两个runner。不要并发共享同一个DB schema。
- **storybook**：一个构建/测试job，stable环境，目标3–5分钟；PR impacted states、nightly全矩阵。宽矩阵的几何回归是UI门禁，不与真实DB E2E耦合。
- **core Web**：优先2片；片数仍由现有LPT推算（不是固定2），把Provider纳入权重/receipt。保留重风险3–4片 fallback；跨账户数据独立后才考虑workers>1。
- **CI Check**：保留manifest digest、expected job/skip、cancel/missing失败、每片actual spec receipt、run/attempt身份。变更job布局须同PR更新schema/validator与负向tests，不能在workflow里删job却让manifest预期仍在。
- 删除 `governance-oracle`、`validate-oracle`、`boundary-oracle`、`integration-oracle`、`web-flow-oracle`、`coverage-oracle`、`performance-oracle`。这些不在ci-check.needs中，删除不削弱权威gate；同步审计是否有外部required-name消费者，本轮live ruleset没有它们。
- governance收缩为sync/配置合法性/依赖方向/收集覆盖/必要安全规则；删除重复调用的inventory/target检查，**保留一次**收集覆盖检查。旧test-system-v2的oracle入口退出CI，run-command退出码/timeout/信号处理保留，不整目录rm。

### 5.2 affected与缓存：完成现有优化，不重复实现

- #507剩余观察按原验收执行：至少两周或30真实PR、未解释少选=0；ground truth不是legacy输出本身。审查`^production`、生成文件、动态imports、config、全局样式、story依赖。root/config/lockfile变更全量。
- lint非type-aware，不因被依赖包源码变化就跑所有consumer lint；typecheck/test/build则声明真正依赖。Storybook target输入包含decorators、CSS/fonts/clock、MSW及真实组件依赖，不能只hash stories。
- #504现有main写/PR读、variant+SHA与Nx SQLite目录修复保持；不建议再给每片复制一份pnpm/browser缓存。浏览器key可改Playwright版本+OS/arch减少无关lockfile失效，但收益不计入主预算。
- **Docker gha层cache改registry cache**（当前仍gha mode=min，实占7.52GB）；迁完由owner授权清旧blob，否则只有新策略、没有腾预算。预算建议pnpm1.5GB、browser0.5、Nx4、其他1，共7GB，留1GB波动；一周使用量<8GB才算#504运营验收，不承诺PR首次就热。
- main evidence reuse优先保留；Nx SHA快照按保留窗口削减，后缀restore key不是共享远程任务cache。暂不引Nx Cloud/新服务。只有可证明成本回收时再评估remote cache/runner采购。
- 删除绝非等于启用危险缓存：DB/E2E/跨端/外部状态任务继续cache=false；typecheck无outputs；源码产物cache绑定toolchain/input digest。

### 5.3 nightly与main

- 一个nightly-audit workflow：全量unit/integration、coverage、全部Web（28+5+Provider）、完整stories视觉矩阵、sync/native按平台、perf/fault/release-health独立job。限定并发/频率，不能把PR消耗全部搬夜里后宣称总成本下降。
- nightly失败保留现有Issue去重通知，owner确认后阻断相关owner晋升；当前codepath改动仍在PR跑安全集成，不接受“等夜里再发现越权”。
- main继续#508 tree证据复用；证据不存在/过期/config变更/树不等价就全量。只做docs的main不产Candidate。合并后的新SHA构建/产物身份不因tree复用而省略。
- 普通main Candidate可选择只构建实际部署需要的平台，但这是owner产品支持决策，不在本方案默认删ARM64。建议保持linux/amd64+arm64，原生双arch build合manifest，避免QEMU慢尾；不要把不同架构混淆成相同digest。

## 6. 发布链：45分钟怎么成立

当前不是每条workflow必串行：release-assets与publish-images已并行，publish-images已经digest晋升；不重复提出这两项。真正长尾是Candidate双架构构建/双registry网络与desktop多平台build+installed-update另一次build。

### 6.1 建议改动

1. Candidate保留exact SHA、API/Web/Migrator一组一致性、双registry内容身份与staging写前main HEAD重验。registry cache+原生ARM64优先；重复触发先查询immutable candidate，已存在且digest一致直接复用（已有逻辑，观察命中，不再重写）。不能skip digest revalidation。
2. staging runtime OCI包装不应成为公开release的无关串行前置：只在staging确需时做；若release仍依赖它的provenance，则保留到依赖显式解耦，不能删needs造成未验证晋升。
3. Desktop每个平台**build/package一次**；同一artifact做首次启动、签名/metadata检查和N→N+1升级。installed gate消费release-assets生成的N+1，N读取已发布稳定版，保留digest。先build job上传后消费，最后draft附件晋升，不需要再打包一次。
4. 只在release commit进入真实发布lane。普通Candidate触发的resolve-only运行是噪音，可在已验证release eligibility输出后再call，不新增另一个事件总线。
5. Deploy Production仍是手工selection；主机watcher实际拉取、migrator、健康、revision/digest证据独立追踪。不得把selection成功写成生产rollout成功。

### 6.2 明确计时起终点与预算

定义“PR到发布≤45”：**release所需PR的最后一次绿色CI开始 → exact release SHA公开GitHub Release并完成要求的镜像/desktop证据**，包括merge后的CI/build/Candidate；不含人等review、Prepare Release等待、未给定长度的生产维护窗口。若还要求生产健康或两个独立PR周期均含在45内，现有数据不足，须另定SLO，不能偷偷改终点。

| 段（不重叠计时） | B当前 | E目标预算 | 推算/必要前提 |
|---|---|---:|---|
| 最后一次PR CI | 典型15，11.6–28.4 | 7–10 | 见第7节，并非复用旧SHA假绿 |
| merge/main CI | 当前有Full Audit/reuse两种 | 2–3（reuse）；全量回退另计 | #508已实现；新main产物与证据约束保留 |
| Candidate | 7–38.6 | 8–10 | 接近历史低段，不保证冷缓存；去QEMU长尾、registry cache和不可变复用需实测 |
| Release prepare + 并行desktop/Docker +postflight | 完整发布样本不足 | 18–19 | 其中最慢平台构建/安装/更新目标15–17，编排/复制/验证约2；同artifact不重复构建 |
| 调度/上传/事件间隙总预留 | 未提供 | 3 | 单列，不把runner wall当全部elapsed |
| **总计** | B整链远超45 | **38–45** | 上限10+3+10+19+3=45；需所有预算同时满足 |

若包括生产selection，再加1–2，需从上述预算扣回而非自动满足；主机rollout耗时U。若Full Audit回退、Windows签名/公证或Docker冷构建超预算，**本轮方案不能保证45**。设置准入：至少5个真正发布SHA的完整演练、每段都有起止/身份/状态；不能拿release resolve-only success验收。手工重跑增加的时间全部计入，失败样本不能从P95剔除。

## 7. 成本模型：收益是可证伪的预算

### 7.1 用现有时长权重，而不是文件数

`web-spec-durations.json` 的28个canonical first-attempt时长合计 **1141.124s=19.02min**，观察时间10月18日（旧权重，不是10月22新实测）。现有LPT约4×4.75min test，加4×97s setup=**25.49 job-min**，而Web实测6.7–11min/片说明visual/Provider/字体/额外启动是显著差额，不全是“分片不均”。

上述10个core按同权重合计约 **7.46min**；2片加setup=**10.70 job-min**，最长片约`3.73+1.62=5.35min`。Provider安全flow不在旧权重内，保守另留**1–2 job-min**，必须更新实测分片权重（不能只把它尾挂首片）。Web build仍2.7、scope约0.7–1.2，则普通core关键路径约**9–11min**；没有证据支持保证5分钟。

若Storybook完整构建+测试>5min、Provider>2min、或某个core spec不能均分，目标就会超支。这是方案验收失败，不是加retry/抬timeout的理由。

unit历史ranking中app-vue P50=301.96s，goal181.99、task158.92、desktop108.98；许多仅1样本且不是当前SHA。说明只删静态文本assert不一定显著缩短runtime，不能许诺“删204文件就少一半unit时间”。unit降到8–10 job-min依赖UI从Vitest迁出和真实task-based affected缩小，需同cohort实测。

### 7.2 三阶段预测与分账

| 阶段 | PR wall E | PR job-min E | 对72的累计下降 | release机器全链E |
|---|---:|---:|---:|---|
| 0 基线 | 典型15；11.6–28.4 | ~72 | — | >45 |
| 1 纯删除/降配 | 11–14 | 56–63 | 13–22% | 仍可能>45；不承诺达标 |
| 2 Storybook/UI与core分层 | 9–11 | 38–44 | 39–47% | 约43–55；Candidate/desktop长尾未解 |
| 3 affected/cache/发布收尾 | **7–10** | **30–35** | **51–58%** | **38–45，条件见6.2** |

阶段1约省9–16 job-min的推导：PR去coverage/perf约3–5（verification9.3内子项无step实测，故区间）；visual宽矩阵/字体降配约4–7（Web25.49理论底线与实测差额，仍保留代表UI保障/人工完整目标）；Oracle及重复治理准备约1–2；源码锁删除只计0–2，**不重复累计coverage和unit的文件数收益**。这些区间相关，采用总预算56–63而非简单取各自最大。

阶段2：core业务从19.02降7.46测试min（移频，非消灭），新增setup与Provider后Web约12–13；Storybook新增3–5；unit因迁出重复UI目标10–13；verification3–4；quality约8；gov/gate约2，得到约38–46，取需要验收的38–44工作区间。**阶段2本身不足以承诺job-min减半。**

阶段3普通affected PR的代表预算：scope+gate+summary1；lint/typecheck/build共享准备约7.5；unit8；boundary/integration3；Web12；Storybook3.5；治理并入quality或约0–0.5增量，合计**35–35.5**。到30依赖局部改动少跑一个owner/job，而非降低安全断言。全仓冷变更可能38–46以上；若项目要求每种PR均≤36，必须进一步拿真实profile削减成本或提高有代价的runner能力，不能假称现计划已证明。

每轮job-min = Σ实际job execution wall，另报队列elapsed、attempt与取消消耗；不是Σ Vitest worker Duration，也不是只计成功job。nightly新增消耗单独报：净日收益 = `PR数×(72−新PR成本) − 新增nightly成本 − 重跑成本变化`。例如仅作算式：每日10PR、每PR省37、nightly净增60，则净省310min；每日1PR则可能增成本。必须用真实频率验收，不能靠把成本搬夜里作弊。

## 8. 可独立合并的实施阶段

### 阶段1：纯删除与降配（低风险速赢）

- 删除七Oracle job；CI Check、来源/receipt负控完全不变；无新产品抽象。
- 删除D类源码/注释/退休路径断言，混合runtime部分原样保留；移除D52 text、D302 AST及专用自证test的对应条目。**先删低价值检查，不新建等量替代锁。** M类暂留至下一阶段。
- 普通PR去coverage/perf、宽visual笛卡尔矩阵降为代表集；完整现有visual target仍可手工运行，并将现有执行命令接入nightly审计，不改测试算法/不更新baseline。必须同PR修正manifest policy与工具测试的预期；这属于降配不是关闭失败检测。
- inventory与target governance去重，每种检查保留一次；observation只下载所需evidence；失败artifact保持。
- **验收**：相同fixture的cancel/missing/skip/receipt negative tests全红绿正确；inventory无漏收；改动工具tests、lint/typecheck、governance；5个配对cohort wall/job-min；不把workflow被跳过当省时。
- **回滚**：revert独立commit恢复job/选择策略；D类删除可从父SHA恢复，不回滚产品。若nightly覆盖未接通，不能合并移频部分。
- **E收益**：11–14min、56–63 job-min；不给发布SLO承诺。

### 阶段2：Storybook与真实业务层分离

- 2A：修现有Storybook收集/DI/环境，新增官方runner与Nx build/test target；先Goal后Task，迁9个独立UI fixture specs；对照原有负向验收通过后同批删除旧harness/config/baseline。
- 2B：按owner分批迁130个render候选中的UI部分，保留32个composable/use*与owner行为；清零M文本锁/AST，替代为真实边界场景。每个owner独立PR，不做全仓同时重写。
- 2C：13配置收敛3；PR core10+Provider及风险扩展；其余nightly；覆盖计划/schema/receipt同步。不要因减少config文件就扩大默认收集集合。
- **验收**：每条迁移断言有story ID/行为test映射；UI错误/焦点/inert负控能失败；密钥泄漏、A/B越权、CAS重复写、导入server-held disclosure负控失败；真实CRUD保存后reload跨API验证仍在。
- **回滚**：按owner revert，恢复对应旧测试与collector；禁止长留新旧双跑作为兼容层。baseline与runner版本一并回滚。
- **E收益**：9–11min、38–44 job-min。Storybook仅是承载工具，若其setup抵消收益要重审测试state数量，不能“再加一层Storybook gate”而旧层不删。

### 阶段3：完成既有优化与发布去重复

- 3A：完成#507真实观察后切task-level selector；删除shadow job/workflow与只为对照拓扑存在的测试。quality合并采用已存在的有界对照工具，wall不回退才降片/合runner。
- 3B：Docker移registry cache、授权清旧层、完成#504一周观察；双arch原生构建若无可用runner则明确阻塞，不默默删ARM64；审计#508 reuse/fallback真实比例。
- 3C：五nightly合一；Desktop exact-artifact单次构建供首次启动/更新；release workflow只做release特有验收，保留权限和draft postflight。涉及Docker/运行时先本地prod-like验证，再PR；本报告不执行这些动作。
- **验收**：至少30PR或两周selector观测、5个可比性能样本、5个真实release-SHA端到端演练；artifact digest/tree/config不匹配全部阻断。普通PR P95≤10min且job-min≤36；root/cold cohort另外公布，不混样本。
- **回滚**：selector回legacy保守选择；cache回旧backend只影响速度；平台构建回原策略；desktop恢复旧build+gate。来源验证不能随性能回滚被关闭。分3A/B/C独立合并，不等一个巨型PR。
- **E收益**：普通PR7–10min/30–35job-min；机器release38–45min。

## 9. 反对意见与不可删除的底线

| 质疑 | 自辩与止损条件 |
|---|---|
| 删source-lock会放回旧接口/旧路径 | 是，接受“仅退休名字复活”的非业务风险；依赖方向/secret禁止泄漏用通用lint/type检查。若旧入口真形成越权、双写或数据损失，则是M，写可触发失败的行为测试，不保留历史注释锁 |
| AST已经稳定为什么还删 | identifier/DOM结构锁仍与实现耦合；334条还含文本/表达式模式。只保留可解释的通用边界规则，不保留指定文件的指定写法 |
| Storybook mock会掩盖真实集成错误 | 正确，因此保留真实登录、owner写入后reload、跨账户、DB约束/事务、跨端sync、Provider安全和安装升级；Storybook只替换UI层，不替换真实业务链 |
| PR只留10个会漏密码/OAuth/SSE/planCRUD回归 | core不是上限；这些owner改动强制风险扩展。root/未知全量；nightly为兜底而非安全检查唯一位置；扩展导致超10min应诚实报告 |
| 删Oracle等于去掉门禁 | 这些job不在当前CI Check needs；真正权威是manifest+children+receipts。删前审计外部消费者，必须保留cancel/unexpected skip/missing shard失败测试 |
| inventory/governance太重，直接整个删掉 | 反对。配置合并时无collector/empty suite会假绿，必须保留一次真实收集覆盖/零测试失败检查；可删重复扫描、退休词句/JSDoc自证，不删除收集完整性 |
| 合job更省但变慢 | setup节省是次要收益；CPU/内存竞争影响build则维持拆分。T3也有8server shard，不以job数为KPI |
| nightly只是转移费用 | 用净日成本验收，宽矩阵降低频率/冗余state一起删，夜间不重复main reuse后又所有工作。夜间失败要有owner/阻断晋升规则，否则移频不成立 |
| digest/签名/tree验证太复杂也砍掉 | 反对。测试了A发布B、PR artifact替换、fork权限、attempt混淆、跨registry半套版本都是真事故。保留exact SHA/tree/config、不可变digest、签名、写前重验、draft后发布 |
| 可以删Desktop升级以确保45分钟 | 反对。保留N→N+1、首次启动、签名、native ABI；消除重复构建而不是删除这些验收。不满足预算就不宣称45达标 |
| GitHub green就能证明生产好了 | 反对。selection、registry晋升、主机rollout、migrator、health是不同事实；本报告不使用resolve-only success做交付证据 |

**最没把握的一处：** 完整release的跨平台安装/升级/签名与Candidate冷缓存长尾。用户的7–38.6min已经说明波动极大，本轮只有代码/历史run身份，不具备新原生ARM64/registry cache/单artifact更新链的计时证据。38–45是有条件预算，不是保证；如果这块不达标，PR瘦身仍有价值，但不得宣布全链目标完成。

## 10. 实施交付检查表

- [ ] 所有改变选集的提交同时改manifest/collector/expected-skip/negative tests；没有force green、skip或baseline自动批准。
- [ ] 204 surface去向、51非surface读文件去向和60/334条规则对账；净删除文件数与实际保留runtime case另报。
- [ ] 9个fixture迁移完成才删旧runner；130个候选按owner核对，非整批rm；stories实际收集包含app-vue。
- [ ] 17→12 workflows、13→3 Web configs；本来手工的shadow删除不计普通CI收益。
- [ ] 分别记录docs/package/UI/runtime/root、hot/cold、PR/main/release的wall/queue/job-min、失败/取消/重跑；原始run/attempt与exact SHA可追溯。
- [ ] PR P95≤10min、普通job-min≤36；全链真实发布≤45且5次演练；若不满足明示失败，不改指标口径。
- [ ] 所有权限/数据安全/持久化/来源校验负控通过；ruleset由owner恢复，不由分析报告默认变更。

## 附录 A：文件级执行清单

下表由固定SHA tracked文件集合生成。D=删除源码/路径/历史自证断言（混合行为保留）；M=语义迁移后删旧断言；K=保留真实行为/fixture读取。**这是实施清单，不是本轮已删除的结果。**

### A1. Surface：204文件（D147 / M46 / K11）

<details>
<summary>展开完整204文件列表</summary>

| 动作 | 路径 |
|---|---|
| D | `apps/api/src/bootstrap-module-names.surface.spec.ts` |
| M | `apps/api/src/modules/powersync/parse-json-like-string-keep-boundary.surface.spec.ts` |
| M | `apps/api/src/modules/powersync/powersync-schema-result-envelope.surface.spec.ts` |
| D | `apps/api/src/modules/powersync/user-preference-sync.surface.spec.ts` |
| D | `apps/api/src/runtime/compose-account.surface.spec.ts` |
| D | `apps/api/src/runtime/compose-ai.surface.spec.ts` |
| D | `apps/api/src/runtime/compose-data-portability.surface.spec.ts` |
| D | `apps/api/src/runtime/compose-goal.surface.spec.ts` |
| D | `apps/api/src/runtime/compose-notification.surface.spec.ts` |
| D | `apps/api/src/runtime/compose-repository.surface.spec.ts` |
| D | `apps/api/src/runtime/compose-routine.surface.spec.ts` |
| D | `apps/api/src/runtime/compose-schedule.surface.spec.ts` |
| D | `apps/api/src/runtime/compose-setting.surface.spec.ts` |
| D | `apps/api/src/runtime/compose-task.surface.spec.ts` |
| D | `apps/api/src/runtime/goal-reminder-fire.surface.spec.ts` |
| D | `apps/api/src/shared/contracts/api-module.surface.spec.ts` |
| D | `apps/api/src/shared/infrastructure/config/get-cors-origins-keep-boundary.surface.spec.ts` |
| K | `apps/api/src/shared/infrastructure/config/get-github-oauth-config.surface.spec.ts` |
| M | `apps/api/src/shared/infrastructure/http/controllers/info-result-envelope.surface.spec.ts` |
| M | `apps/api/src/shared/infrastructure/http/controllers/logs-result-envelope.surface.spec.ts` |
| M | `apps/api/src/shared/infrastructure/http/controllers/metrics-result-envelope.surface.spec.ts` |
| D | `apps/api/src/shared/infrastructure/load-workspace-env-keep-boundary.surface.spec.ts` |
| M | `apps/api/src/shared/infrastructure/middleware/error-result-envelope.surface.spec.ts` |
| D | `apps/desktop/src/main/desktop-bootstrapper-access.surface.spec.ts` |
| D | `apps/desktop/src/main/desktop-electron-contracts-path.surface.spec.ts` |
| D | `apps/desktop/src/main/desktop-shared-ipc-channels-dual.surface.spec.ts` |
| M | `apps/desktop/src/main/desktop-update-shell-ownership.surface.spec.ts` |
| D | `apps/desktop/src/main/ipc/system-handlers.surface.spec.ts` |
| D | `apps/desktop/src/main/lifecycle/window-manager.surface.spec.ts` |
| D | `apps/desktop/src/main/modules/ai/stable-knowledge-note-ref-boundary.surface.spec.ts` |
| D | `apps/desktop/src/main/runtime/compose-goal.surface.spec.ts` |
| D | `apps/desktop/src/main/runtime/compose-modules.surface.spec.ts` |
| D | `apps/desktop/src/main/runtime/compose-task.surface.spec.ts` |
| D | `apps/desktop/src/main/runtime/goal-reminder-fire.surface.spec.ts` |
| D | `apps/desktop/src/main/services/custom-notification.manager.surface.spec.ts` |
| D | `apps/desktop/src/main/services/desktop-notification-preference-wiring.surface.spec.ts` |
| D | `apps/desktop/src/main/services/notification.service.surface.spec.ts` |
| D | `apps/desktop/src/main/utils/ipc-cache.surface.spec.ts` |
| D | `apps/desktop/src/main/utils/memory-monitor.surface.spec.ts` |
| D | `apps/desktop/src/renderer/custom-notification-electron-bridge-dual.surface.spec.ts` |
| D | `apps/desktop/src/renderer/desktop-electron-bridge-window.surface.spec.ts` |
| D | `apps/desktop/src/renderer/host-electron-bridge-helper-dual.surface.spec.ts` |
| D | `apps/desktop/src/renderer/intervention-window/intervention-window-entry.surface.spec.ts` |
| D | `apps/desktop/src/renderer/platform/desktop-update-di.surface.spec.ts` |
| D | `apps/web/src/e2e-helpers/desktop-build-global-setup-dual.surface.spec.ts` |
| D | `apps/web/src/e2e-helpers/normalize-origin-dual.surface.spec.ts` |
| M | `apps/web/src/platform/read-json-keep-boundary.surface.spec.ts` |
| M | `packages/account/src/api/account-void-success-envelope.surface.spec.ts` |
| D | `packages/account/src/application-client/services/account-client-port-mapping-dual.surface.spec.ts` |
| D | `packages/account/src/electron/account-electron.surface.spec.ts` |
| D | `packages/account/src/server/infrastructure/__tests__/account-repositories.surface.spec.ts` |
| M | `packages/account/src/server/infrastructure/adapters/powersync/mappers/account-powersync-parse-json-keep-boundary.surface.spec.ts` |
| D | `packages/account/src/server/infrastructure/adapters/prisma/__tests__/account-auth-email-retirement.surface.spec.ts` |
| D | `packages/account/src/server/infrastructure/adapters/prisma/__tests__/account-clock-version-retirement.surface.spec.ts` |
| M | `packages/account/src/server/infrastructure/adapters/prisma/__tests__/account-ownership.surface.spec.ts` |
| D | `packages/account/src/server/infrastructure/adapters/prisma/__tests__/account-phone-retirement.surface.spec.ts` |
| M | `packages/ai/src/api/routes/ai-void-success-envelope.surface.spec.ts` |
| D | `packages/ai/src/electron/ai-electron.surface.spec.ts` |
| D | `packages/ai/src/infrastructure-client/adapters/__tests__/ai-provider-list-envelope.surface.spec.ts` |
| D | `packages/ai/src/infrastructure-client/adapters/__tests__/ai-transport-types.surface.spec.ts` |
| M | `packages/ai/src/infrastructure-client/adapters/read-string-keep-boundary.surface.spec.ts` |
| D | `packages/ai/src/server/application/ai-application-capabilities.surface.spec.ts` |
| D | `packages/ai/src/server/application/ports/knowledge-source-note.surface.spec.ts` |
| D | `packages/ai/src/server/domain/ai-provider-config-barrel.surface.spec.ts` |
| M | `packages/ai/src/server/infrastructure/__tests__/ai-provider-secret-ownership.surface.spec.ts` |
| D | `packages/ai/src/server/infrastructure/__tests__/ai-repositories.surface.spec.ts` |
| M | `packages/ai/src/server/infrastructure/adapters/__tests__/ai-conversation-repository.surface.spec.ts` |
| M | `packages/ai/src/server/infrastructure/adapters/__tests__/ai-provider-config-repository.surface.spec.ts` |
| D | `packages/ai/src/server/infrastructure/adapters/dual-registry.surface.spec.ts` |
| D | `packages/ai/src/server/infrastructure/adapters/fs/ai-evaluation-report-wire.surface.spec.ts` |
| M | `packages/ai/src/server/infrastructure/adapters/prisma/__tests__/ai-provider-config-ownership.surface.spec.ts` |
| D | `packages/ai/src/server/infrastructure/adapters/prisma/to-prisma-json-keep-boundary.surface.spec.ts` |
| K | `packages/ai/src/server/infrastructure/adapters/tokenize-keep-boundary.surface.spec.ts` |
| D | `packages/ai/src/server/mastra/ai-vnext-no-legacy.surface.spec.ts` |
| D | `packages/ai/src/server/mastra/mastra-vnext-architecture.surface.spec.ts` |
| D | `packages/ai/src/server/mastra/tools/owner-contracts.surface.spec.ts` |
| D | `packages/app-vue/src/di/__tests__/desktop-update-service.surface.spec.ts` |
| K | `packages/app-vue/src/layouts/shell/clamp-dual.surface.spec.ts` |
| K | `packages/app-vue/src/shared/utils/format-date-keep-boundary.surface.spec.ts` |
| K | `packages/app-vue/src/shared/utils/format-datetime-keep-boundary.surface.spec.ts` |
| K | `packages/app-vue/src/shared/utils/format-time-range-keep-boundary.surface.spec.ts` |
| K | `packages/app-vue/src/shared/utils/ipc/is-plain-object-keep-boundary.surface.spec.ts` |
| K | `packages/app-vue/src/views/dead-surfaces.surface.spec.ts` |
| D | `packages/contracts/src/electron/ipc-channels.renderer-events.surface.spec.ts` |
| D | `packages/contracts/src/modules/account/api/dual-registry.surface.spec.ts` |
| D | `packages/contracts/src/modules/account/empty-dual-barrel.surface.spec.ts` |
| D | `packages/contracts/src/modules/account/entities/account-entities-dual.surface.spec.ts` |
| D | `packages/contracts/src/modules/ai/api/dual-registry.surface.spec.ts` |
| D | `packages/contracts/src/modules/goal/api/dual-registry.surface.spec.ts` |
| M | `packages/contracts/src/modules/goal/protocol/goal-rpc-map.surface.spec.ts` |
| D | `packages/contracts/src/modules/goal/value-objects/dual-registry.surface.spec.ts` |
| D | `packages/contracts/src/modules/notification/api/dual-registry.surface.spec.ts` |
| D | `packages/contracts/src/modules/notification/protocol/asset-image-key-dual.surface.spec.ts` |
| M | `packages/contracts/src/modules/notification/protocol/notification-rpc-map.surface.spec.ts` |
| D | `packages/contracts/src/modules/notification/value-objects/dual-registry.surface.spec.ts` |
| D | `packages/contracts/src/modules/operations/operations-dist.surface.spec.ts` |
| D | `packages/contracts/src/modules/repository/aggregates/dual-registry.surface.spec.ts` |
| D | `packages/contracts/src/modules/repository/api/dual-registry.surface.spec.ts` |
| D | `packages/contracts/src/modules/schedule/api/dual-registry.surface.spec.ts` |
| D | `packages/contracts/src/modules/setting/legacy-deletion.surface.spec.ts` |
| D | `packages/contracts/src/modules/setting/preferences/product-feature-map-public.surface.spec.ts` |
| D | `packages/contracts/src/modules/setting/preferences/product-module-index-paths.surface.spec.ts` |
| D | `packages/contracts/src/modules/task/api/dual-registry.surface.spec.ts` |
| M | `packages/contracts/src/modules/task/protocol/task-rpc-map.surface.spec.ts` |
| D | `packages/contracts/src/modules/transport-cast-inventory.surface.spec.ts` |
| D | `packages/contracts/src/result/action-result-dual.surface.spec.ts` |
| K | `packages/contracts/src/result/ipc-envelope.surface.spec.ts` |
| D | `packages/contracts/src/result/is-record-keep-boundary.surface.spec.ts` |
| D | `packages/contracts/src/result/result-adr-alignment.surface.spec.ts` |
| D | `packages/contracts/src/shared/dtos/shared-dtos-dual.surface.spec.ts` |
| D | `packages/contracts/src/shared/dual-registry.surface.spec.ts` |
| D | `packages/data-portability/src/application-client/data-portability-client-port-dual.surface.spec.ts` |
| D | `packages/data-portability/src/application-client/ports/data-portability-api-client-port.surface.spec.ts` |
| D | `packages/data-portability/src/server/application/use-cases/__tests__/editor-persistence-retirement.surface.spec.ts` |
| D | `packages/data-portability/src/server/application/use-cases/__tests__/editor-portability-retirement.surface.spec.ts` |
| D | `packages/data-portability/src/server/application/use-cases/__tests__/portable-boundary-re-lock.surface.spec.ts` |
| M | `packages/data-portability/src/server/application/use-cases/__tests__/server-held-disclosure-not-importable.surface.spec.ts` |
| D | `packages/goal/src/__tests__/dual-registry.surface.spec.ts` |
| K | `packages/goal/src/api/__tests__/goal-api-module-gate.surface.spec.ts` |
| M | `packages/goal/src/api/routes/goal-parse-number-string-array-keep-boundary.surface.spec.ts` |
| M | `packages/goal/src/api/routes/goal-void-success-envelope.surface.spec.ts` |
| M | `packages/goal/src/api/routes/parse-boolean-dual.surface.spec.ts` |
| D | `packages/goal/src/application-client/goal-client-port-facade-dual.surface.spec.ts` |
| D | `packages/goal/src/electron/goal-electron.surface.spec.ts` |
| D | `packages/goal/src/infrastructure-client/adapters/ipc/goal-ipc-channels.surface.spec.ts` |
| D | `packages/goal/src/infrastructure-client/adapters/ipc/goal-ipc.adapter.surface.spec.ts` |
| D | `packages/goal/src/server/application/goal-application-types-barrel.surface.spec.ts` |
| D | `packages/goal/src/server/infrastructure/__tests__/goal-repositories.surface.spec.ts` |
| M | `packages/goal/src/server/infrastructure/__tests__/schedule-source-ownership.surface.spec.ts` |
| M | `packages/goal/src/server/infrastructure/adapters/prisma/__tests__/goal-ownership.surface.spec.ts` |
| D | `packages/goal/src/server/infrastructure/adapters/prisma/__tests__/goal-schema-projection.surface.spec.ts` |
| M | `packages/goal/src/server/infrastructure/adapters/prisma/__tests__/weight-snapshot-ownership.surface.spec.ts` |
| D | `packages/goal/src/server/infrastructure/build-task-name-keep-boundary.surface.spec.ts` |
| D | `packages/http-client/src/__tests__/result-http-client-interface.surface.spec.ts` |
| D | `packages/http-client/src/__tests__/result-http-envelope.surface.spec.ts` |
| D | `packages/ipc-client/src/__tests__/ipc-client-envelope.surface.spec.ts` |
| D | `packages/ipc-client/src/__tests__/result-ipc-client-interface.surface.spec.ts` |
| M | `packages/label/src/__tests__/label-registry-ownership.surface.spec.ts` |
| M | `packages/notification/src/api/notification-void-success-envelope.surface.spec.ts` |
| D | `packages/notification/src/application-client/notification-client-port-dual.surface.spec.ts` |
| D | `packages/notification/src/electron/notification-electron.surface.spec.ts` |
| D | `packages/notification/src/infrastructure-client/adapters/ipc/notification-ipc.adapter.surface.spec.ts` |
| K | `packages/notification/src/server/domain/services/notification-metrics-unified.surface.spec.ts` |
| D | `packages/notification/src/server/infrastructure/__tests__/notification-repositories.surface.spec.ts` |
| M | `packages/notification/src/server/infrastructure/adapters/prisma/__tests__/notification-ownership.surface.spec.ts` |
| M | `packages/notification/src/server/infrastructure/adapters/prisma/__tests__/notification-preference-ownership.surface.spec.ts` |
| D | `packages/notification/src/server/infrastructure/adapters/prisma/__tests__/notification-preference-schema-migration.surface.spec.ts` |
| D | `packages/notification/src/server/transport/notification-usecases-export.surface.spec.ts` |
| D | `packages/patterns/src/events/create-event-bus-adapter-dual.surface.spec.ts` |
| D | `packages/patterns/src/operations/operations-dist.surface.spec.ts` |
| M | `packages/repository/src/api/routes/knowledge-disconnect-void-envelope.surface.spec.ts` |
| M | `packages/repository/src/application-client/knowledge-write-request-ledger-contract.surface.spec.ts` |
| D | `packages/repository/src/application-client/repository-client-port-dual.surface.spec.ts` |
| D | `packages/repository/src/electron/repository-electron.surface.spec.ts` |
| D | `packages/repository/src/electron/vault-fs-guards-dual.surface.spec.ts` |
| D | `packages/repository/src/infrastructure-client/adapters/ipc/repository-ipc.adapter.surface.spec.ts` |
| D | `packages/repository/src/server/application/services/knowledge-projection-engine.surface.spec.ts` |
| D | `packages/repository/src/server/application/services/repository-note-mutation.surface.spec.ts` |
| D | `packages/repository/src/server/infrastructure/__tests__/repository-repositories.surface.spec.ts` |
| M | `packages/repository/src/server/infrastructure/adapters/prisma/__tests__/controlled-note-write-boundary.surface.spec.ts` |
| M | `packages/repository/src/server/infrastructure/adapters/prisma/__tests__/github-webhook-delivery-ownership.surface.spec.ts` |
| M | `packages/repository/src/server/infrastructure/adapters/prisma/__tests__/knowledge-remote-binding-ownership.surface.spec.ts` |
| M | `packages/repository/src/server/infrastructure/adapters/prisma/__tests__/knowledge-write-request-ownership.surface.spec.ts` |
| D | `packages/repository/src/server/infrastructure/adapters/prisma/__tests__/legacy-editor-repository-runtime.surface.spec.ts` |
| M | `packages/schedule/src/api/schedule-route-parsers-keep-boundary.surface.spec.ts` |
| M | `packages/schedule/src/api/schedule-void-success-envelope.surface.spec.ts` |
| D | `packages/schedule/src/application-client/schedule-client-port-facade-dual.surface.spec.ts` |
| D | `packages/schedule/src/electron/schedule-electron.surface.spec.ts` |
| D | `packages/schedule/src/infrastructure-client/adapters/ipc/schedule-ipc.adapter.surface.spec.ts` |
| D | `packages/schedule/src/server/infrastructure/__tests__/schedule-repositories.surface.spec.ts` |
| M | `packages/schedule/src/server/infrastructure/adapters/prisma/__tests__/schedule-event-ownership.surface.spec.ts` |
| M | `packages/scheduler/src/api/scheduler-route-parsers.surface.spec.ts` |
| D | `packages/scheduler/src/electron/scheduler-electron.surface.spec.ts` |
| D | `packages/scheduler/src/infrastructure-client/adapters/ipc/scheduler-ipc.adapter.surface.spec.ts` |
| D | `packages/scheduler/src/server/application/scheduler/patterns-scheduler-dual.surface.spec.ts` |
| D | `packages/scheduler/src/server/infrastructure/__tests__/scheduler-repositories.surface.spec.ts` |
| D | `packages/setting/src/application-client/ports/setting-api-client-port.surface.spec.ts` |
| D | `packages/setting/src/application-client/setting-client-port-dual.surface.spec.ts` |
| D | `packages/setting/src/electron/setting-electron.surface.spec.ts` |
| D | `packages/setting/src/infrastructure-client/adapters/ipc/setting-ipc.adapter.surface.spec.ts` |
| D | `packages/setting/src/server/infrastructure/__tests__/setting-repositories.surface.spec.ts` |
| D | `packages/task/src/api/routes/get-first-query-value-dual.surface.spec.ts` |
| M | `packages/task/src/api/routes/task-void-success-envelope.surface.spec.ts` |
| D | `packages/task/src/client/task-client-browser-boundary.surface.spec.ts` |
| D | `packages/task/src/electron/task-electron.surface.spec.ts` |
| D | `packages/task/src/server/domain/task-domain-events-barrel.surface.spec.ts` |
| D | `packages/task/src/server/domain/task-domain-simplification.surface.spec.ts` |
| M | `packages/task/src/server/domain/task-goal-contribution-v2.surface.spec.ts` |
| D | `packages/task/src/server/domain/task-occurrence-vnext.surface.spec.ts` |
| D | `packages/task/src/server/infrastructure/__tests__/task-repositories.surface.spec.ts` |
| M | `packages/task/src/server/infrastructure/adapters/prisma/__tests__/task-occurrence-ownership.surface.spec.ts` |
| M | `packages/task/src/server/infrastructure/adapters/prisma/__tests__/task-plan-ownership.surface.spec.ts` |
| D | `packages/task/src/server/infrastructure/normalize-runtime-contributions-dual.surface.spec.ts` |
| M | `packages/task/src/server/infrastructure/schedule-source-ownership.surface.spec.ts` |
| D | `packages/task/src/testing/an-identity-id-dual.surface.spec.ts` |
| D | `packages/utils/src/frontend/delay-dual.surface.spec.ts` |
| D | `packages/utils/src/frontend/format-file-size-keep-boundary.surface.spec.ts` |
| D | `packages/utils/src/result/default-extract-context-keep-boundary.surface.spec.ts` |
| D | `packages/utils/src/result/format-zod-errors-dual.surface.spec.ts` |
| D | `packages/utils/src/result/openapi-response-helpers-dual.surface.spec.ts` |
| D | `packages/utils/src/shared/dual-registry.surface.spec.ts` |
| D | `packages/utils/src/shared/format-date-to-input-keep-boundary.surface.spec.ts` |
| D | `packages/utils/src/shared/generate-uuid-keep-boundary.surface.spec.ts` |
| D | `packages/utils/src/shared/new-id-keep-boundary.surface.spec.ts` |

</details>

### A2. 非surface readFileSync：51文件（D5 / M29 / K17）

K含临时产物/SQL/日志/JSON与工具本身行为测试。K文件中若存在少量生产源码自证子case，也只删该子case，不删fixture/进程行为测试。M文件改造时保留原有全部运行时语义。

<details>
<summary>展开完整51文件列表</summary>

| 动作 | 路径 |
|---|---|
| K | `apps/api/src/__tests__/integration/agent-instance-registry.integration.test.ts` |
| M | `apps/api/src/runtime/compose-data-portability.spec.ts` |
| M | `apps/api/src/scripts/database-startup-chain.test.ts` |
| M | `apps/api/src/shared/infrastructure/config/web-origin.spec.ts` |
| K | `apps/desktop/e2e/antigravity-composer.spec.mts` |
| K | `apps/desktop/e2e/antigravity-login.spec.mts` |
| K | `apps/desktop/e2e/authentication/desktop-auth-flow.spec.mts` |
| K | `apps/desktop/e2e/packaged-runtime/packaged-runtime.spec.ts` |
| K | `apps/desktop/e2e/workspace-attention.spec.mts` |
| M | `apps/web/src/mocks/handlers/repository.handlers.spec.ts` |
| M | `packages/ai/src/api/routes/ai-provider-onboarding.routes.spec.ts` |
| M | `packages/cloud-auth/src/index.spec.ts` |
| M | `packages/cloud-auth/src/server/public-surface.spec.ts` |
| M | `packages/contracts/src/modules/task/api/task-plan.dto.test.ts` |
| K | `packages/database/src/schema/ai-agent-registry.integration.test.ts` |
| M | `packages/database/src/schema/cloud-auth-user-access-projection.spec.ts` |
| M | `packages/database/src/schema/goal-description.spec.ts` |
| M | `packages/database/src/schema/goal-record-authorship.spec.ts` |
| D | `packages/database/src/schema/repository-vnext-retirement.spec.ts` |
| M | `packages/database/src/schema/routine-activated-at.spec.ts` |
| D | `packages/database/src/schema/scheduler-vnext-retirement.spec.ts` |
| M | `packages/database/src/schema/task-goal-binding-constraint.spec.ts` |
| M | `packages/database/src/schema/task-plan-canonical-persistence.spec.ts` |
| K | `packages/database/src/schema/task-shared-label-migration.spec.ts` |
| M | `packages/goal/src/server/application/services/goal-review-signal-analyzer.spec.ts` |
| K | `packages/label/src/__tests__/label-service.spec.ts` |
| M | `packages/reminder/src/__tests__/package-root-owner-surface.spec.ts` |
| M | `packages/scheduler/src/scheduling/__tests__/scheduling-contracts.spec.ts` |
| M | `packages/setting/src/server/preferences/user-preference-service.spec.ts` |
| M | `packages/time/src/__tests__/facade.spec.ts` |
| K | `packages/time/src/__tests__/runtime-dependency-boundary.spec.ts` |
| M | `packages/time/src/__tests__/third-party-contract-boundary.spec.ts` |
| M | `packages/time/src/__tests__/time-context.spec.ts` |
| M | `packages/ui-core/src/styles/theme.semantic-tokens.spec.ts` |
| M | `tools/ci-cd-platform/__tests__/nightly-audit-failure.test.mjs` |
| K | `tools/ci-cd-platform/__tests__/nx-task-contract.test.mjs` |
| M | `tools/ci-cd-platform/__tests__/production-oauth-compose.test.mjs` |
| K | `tools/ci-cd-platform/__tests__/production-watcher.test.mjs` |
| D | `tools/ci-cd-platform/__tests__/quality-shadow.test.mjs` |
| K | `tools/ci-cd-platform/__tests__/release-tooling.test.mjs` |
| M | `tools/ci-cd-platform/__tests__/staging-watcher.test.mjs` |
| M | `tools/ci-cd-platform/__tests__/visual-font-workflow.test.mjs` |
| K | `tools/docker/local-compose.env-shadow.spec.mjs` |
| K | `tools/governance/__tests__/architecture-surface.test.mjs` |
| M | `tools/governance/__tests__/engineering-input-independence.test.mjs` |
| D | `tools/governance/__tests__/engineering-reference-policy.test.mjs` |
| K | `tools/governance/__tests__/engineering-rule-source.test.mjs` |
| M | `tools/governance/__tests__/i18n-key-completeness.test.mjs` |
| M | `tools/governance/__tests__/local-docker-product-validation.test.mjs` |
| D | `tools/governance/__tests__/public-surface-jsdoc.test.mjs` |
| K | `tools/test-system-v2/__tests__/failure-classification.test.mjs` |

</details>

## 附录 B：本报告验证

- 报告255条文件级清单全部存在、路径唯一、动作计数相符；core10旧权重合计7.4627min。
- `git diff --check`：通过；提交前再对staged diff检查；报告为唯一新增tracked交付文件。
- 按仓库规范执行 `NX_DAEMON=false timeout 300 pnpm nx run memoflow:governance-check`：**未通过**。`test-system-v2:test` 76 tests中74 pass、2 fail；`e2e-governance.test.mjs` 与 `inventory.test.mjs` 在调用 Vitest `list --filesOnly --config vitest.integration.config.ts` 时子进程被终止（code143/killed=true），没有stderr；root governance-check因依赖失败未执行。没有提高超时/重跑来获取绿色，没有擅自修工具。资源竞争/collector超时是待定位原因，不能从本条日志认定根因。
- 该命令的pnpm启动阶段自动进行依赖链接与Prisma生成/postinstall；仅开发缓存/忽略生成物发生变化，Git状态未出现产品、测试、workflow、lockfile改动。没有主动运行新的产品验收或触发Actions。
- 单独 `node tools/docs/check-docs-config.mjs`：通过（输出`[governance-check] passed`，**只是docs checker通过，不是Nx整套governance通过**）。
- 附录分类计数机械核对：surface D147/M46/K11=204；非surface D5/M29/K17=51；manifest text D52/M8=60、AST D302/M32=334；10个core时长由已提交权重求和。静态数据不冒充本轮runtime collection证明。
- 此失败也暴露测试治理的成本耦合：两个工具测试各自调用全仓真实collector，文档任务也要经该依赖链。方案应保留一个真实collector smoke，并把其余planner/归属算法用fixture测；但本报告不修改现状、不把失败标成无风险。
