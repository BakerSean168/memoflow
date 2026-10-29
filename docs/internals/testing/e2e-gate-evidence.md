---
tags:
  - testing
  - e2e
  - ci
  - evidence
description: MemoFlow 11 项业务风险的 E2E 执行责任、门禁归属与真实 Run 收据
created: 2026-10-29T00:00:00+08:00
updated: 2026-10-29T00:00:00+08:00
---

# 关键 E2E 执行门禁与证据矩阵

本页记录 Issue #608 的 11 项业务风险在**真实 Workflow 中**的执行责任与 Run 收据。机器可读的执行归属以 `tools/test-system-v2/e2e-ownership.json` 为准绳：collector 级 `automation` 条目声明哪个 GitHub Workflow 以哪个 Nx target 执行该 collector。

**文件存在、YAML 中声明、条件 skip 都不构成验证。** 本页只登记已核对的 Run（含 job/step 结论）或明确缺口。

## 证据等级

| 等级           | 含义                                                       |
| -------------- | ---------------------------------------------------------- |
| `verified-run` | 存在针对精确 git SHA 的成功 Run，且已核对 job 与 step 结论 |
| `gate-only`    | 门禁已接线并会在对应阶段执行，但尚无该 SHA 的成功 Run 收据 |
| `no-gate`      | 没有任何 Workflow 在该阶段执行该场景，属执行责任缺口       |

## 矩阵

| 风险 ID                | 负责 Workflow / Runner                                                                     | 触发阶段           | 平台                          | 外部 DB / Provider 准入                                                     | 目标 SHA + 最近成功 Run                                                                        | 等级                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ | ------------------ | ----------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| `WEB-DESKTOP-SYNC`     | `nightly-audit.yml` / Specialized E2E（`web:e2e:sync`）                                    | Nightly            | Linux + xvfb + Secret Service | Docker: postgres-test + powersync-test；签名键来自仓库内 `.env.development` | 接线后待取证                                                                                   | `gate-only`                             |
| `DESKTOP-UPDATE`       | `release-assets.yml`；`desktop-update-e2e.yml`                                             | Release / 手动     | Linux、Windows                | 无（真实打包安装态）                                                        | `9934705d5` → [39088705384](https://github.com/BakerSean168/memoflow/actions/runs/39088705384) | `verified-run`                          |
| `DESKTOP-IPC`          | `desktop-update-e2e.yml`（Windows 安装态套件）                                             | Release / 手动     | Windows                       | 无（真实安装态）                                                            | `c2d92705e` → [39783670101](https://github.com/BakerSean168/memoflow/actions/runs/39783670101) | `verified-run`                          |
| `AUTH-LOGIN`           | `desktop-update-e2e.yml` / Desktop auth job（`desktop:e2e`）；Web 认证组件/单元在 `ci.yml` | Release / 手动；PR | Linux + xvfb；Linux           | 无外部凭据（spec 自带本地 auth server）                                     | 接线后待取证                                                                                   | `gate-only`                             |
| `GOAL-DRAFT`           | `ci.yml`（component）；`playwright.goal-reference` 手动                                    | PR                 | Linux                         | 无                                                                          | `8fcdb1eea` → [40731442600](https://github.com/BakerSean168/memoflow/actions/runs/40731442600) | `verified-run`                          |
| `TASK-RECURRENCE-A11Y` | `ci.yml`（component a11y）；reference collector 手动                                       | PR                 | Linux                         | 无                                                                          | `9a97c9130` → [40804738576](https://github.com/BakerSean168/memoflow/actions/runs/40804738576) | `verified-run`                          |
| `AI-APPROVAL`          | `ci.yml`（Test Server Unit / shards）                                                      | PR                 | Linux                         | 无（确定性 fake）                                                           | `9a97c9130` → [40804738576](https://github.com/BakerSean168/memoflow/actions/runs/40804738576) | `verified-run`                          |
| `AI-EVAL-QUALITY`      | `nightly-audit.yml`（`web:e2e:ai-provider`）                                               | Nightly            | Linux                         | Recorded Replay 确定性；Live Provider 仅 opt-in                             | `2e7484026` → [40285774452](https://github.com/BakerSean168/memoflow/actions/runs/40285774452) | `verified-run`（replay）/ 缺口（live）  |
| `OWNER-ISOLATION`      | `nightly-audit.yml`（`web:e2e:ai-provider` P0 跨 owner 用例）                              | Nightly            | Linux                         | 真实 Postgres + 本地 API                                                    | `2e7484026` → [40285774452](https://github.com/BakerSean168/memoflow/actions/runs/40285774452) | `verified-run`                          |
| `DATA-MIGRATION`       | `ci.yml`（DB 集成 shard）                                                                  | PR                 | Linux                         | 真实 PostgreSQL 容器                                                        | `9a97c9130` → [40804738576](https://github.com/BakerSean168/memoflow/actions/runs/40804738576) | `verified-run`（集成）/ 缺口（cutover） |
| `VISUAL-LAYOUT`        | `ci.yml`（Test Web Visual）                                                                | PR / Main          | Linux（Noble + CJK 字体）     | 无                                                                          | `9a97c9130` → [40804738576](https://github.com/BakerSean168/memoflow/actions/runs/40804738576) | `verified-run`                          |

## 逐项记录

### WEB-DESKTOP-SYNC

- Spec：`apps/web/e2e/sync/goal-sync-regression.spec.ts`（3 个用例：desktop→web、web→desktop、重启后保留）
- Collector / target：`apps/web/playwright.sync.config.ts` / `web:e2e:sync`
- 前置：`configurePowerSyncTestEnv()` 在缺少 `POWERSYNC_*` 签名键时 **throw**（fail-closed，不会静默跳过）；`start-powersync-test-service.ts` 自行 `docker compose --profile test --profile sync-test up`；global setup 构建桌面应用；Electron 在 headless Linux 需 xvfb **与真实 Secret Service**
- 修复前：ownership 中该 collector 无 `automation`，target 无 `dependsOn`，任何 Workflow 都不执行 → 真实缺口
- 现状：已接入 `nightly-audit.yml` 的 Specialized E2E job（见下文「接线」），`automation` 元数据同步登记

### DESKTOP-UPDATE

- Spec：`apps/desktop/e2e/packaged-runtime/packaged-runtime.spec.ts`（+ `provider-layout-window.spec.ts`）
- Target：`desktop:test:packaged-smoke`，由 `MEMOFLOW_PACKAGED_EXECUTABLE` 指向**真实打包安装态**
- 收据：[run 39088705384](https://github.com/BakerSean168/memoflow/actions/runs/39088705384) @ `9934705d5cec13feda0d7ba94036b08d24ddf360`（`release-assets.yml`，workflow_dispatch，2026-10-18，success）：`Build linux-x64 Assets` 中 `Run packaged Desktop runtime smoke` 与 `Run installed Linux Debian runtime smoke` 均 success
- 同 Run 中 `Desktop Installed Update Gate` 为 skipped（该次 dispatch 未进入 release 上下文），因此 **N→N+1 安装态更新**证据以 `desktop-update-e2e.yml` 为准（见 DESKTOP-IPC）

### DESKTOP-IPC

- Spec：`apps/desktop/e2e/workspace-ipc.spec.mts`
- 执行：`desktop-update-e2e.yml` `Windows NSIS N to N+1` job 的 `Run one installed Windows Workspace and Native acceptance suite` 步骤
- 收据：[run 39783670101](https://github.com/BakerSean168/memoflow/actions/runs/39783670101) @ `c2d92705ed4ea2155e40a58859479fe922ddd241`（workflow_dispatch，2026-10-22，success），该 job 含 `Run Windows packaged runtime smoke`、`Run installed Windows updater proof`、安装态 Workspace/Native 套件全部 success
- 该 Run 为分支 dispatch，不是 release tag；release 路径由 `release-assets.yml` → `workflow_call` 承载

### AUTH-LOGIN

- 真实 Electron Profile + 认证流：`apps/desktop/e2e/authentication/desktop-auth-flow.spec.mts`（5 个用例，自带本地 auth HTTP server，无外部凭据、无条件 skip）
- 修复前：`desktop:e2e` 未被任何 Workflow 引用 → `no-gate`
- 现状：已接入 `desktop-update-e2e.yml` 的 Desktop auth job（Linux + xvfb + 真实 keyring），见「接线」
- `lastActiveAt` 的断言口径：该字段只由 `ProfileRegistry.touch` 写入，唯一调用点是 `activatePreparedProfile`（打开/切换 Profile 时），因此「重新激活过的 Profile」其值必然前进。`a second guest …` 用例自身会在中途切回第一个 guest，故该用例按「其余字段严格相等 + `lastActiveAt` 为合法数值且不早于快照」比较，而不是钉死整个快照
- Web 侧认证组件/单元断言仍在 `ci.yml` 的 PR lane 内

### GOAL-DRAFT

- `packages/app-vue/src/layouts/shell/PanelErrorBoundary.spec.ts`（#607）：断言 retry 后草稿子树实例不重建、草稿数据保持
- 收据（引入该断言的 PR）：`ci.yml` [run 40731442600](https://github.com/BakerSean168/memoflow/actions/runs/40731442600) @ `8fcdb1eea4714deb033e525ab573a667224e20db`（PR #694，2026-10-28，success），`Test Web (Unit 1/2)`、`Test Web (Unit 2/2)` 与 `CI Check` 均 success
- 收据（main 全量）：[run 40804738576](https://github.com/BakerSean168/memoflow/actions/runs/40804738576) @ `9a97c9130`，`Test (1/3)`–`Test (3/3)` 与 `Test Web (Unit 1/2)` 均 success
- 浏览器侧：`playwright.goal-reference.config.ts` 属 manual lane，不作为门禁

### TASK-RECURRENCE-A11Y

- #605 的键盘/焦点断言：`apps/web/e2e/goal/reference/goal-business-panel.spec.ts`（WeekdaySelector / MonthDaySelector 键盘可达性）属 reference collector，manual lane
- 门禁侧覆盖来自组件层 a11y 断言，随 `ci.yml` PR lane 执行；收据同上 run 40804738576
- 缺口：真实 Chromium 的 recurrence 键盘验收没有自动门禁（reference lane 手动）

### AI-APPROVAL

- 断言位置：`packages/ai/src/server/mastra/runtime/mastra-workflow.runtime.spec.ts`、`local-agent/*-driver.spec.ts`、`assistant-history.service.spec.ts`
- 门禁：`ci.yml` `Test Server (Unit)` / `Test Server (1-3/3)`
- 收据：run 40804738576 @ `9a97c9130`，上述 job 全部 success

### AI-EVAL-QUALITY

- 门禁：`nightly-audit.yml` `audit` job 的 `Run secure AI Provider acceptance`（`web:e2e:ai-provider`）
- 收据：run 40285774452 @ `2e74840269645b553683598023cafa366e64972e`（schedule，main，2026-10-26，success），该 step success
- **边界**：`provider-onboarding.spec.ts` 的 `[opt-in] direct compatible Endpoint credential and live catalogue` 在缺少 `E2E_MODEL_SERVICE_BASE_URL` / `E2E_MODEL_SERVICE_API_KEY` 时 `test.skip`。Nightly 只证明 Recorded Replay / 本地 mock 的确定性行为，**不等于真实 Provider 评测**；真实 Provider 无自动门禁

### OWNER-ISOLATION

- 断言位置：`apps/web/e2e/ai/provider-onboarding.spec.ts` 的 `[P0] Agent Registry rejects native Web drivers, stale revisions and cross-owner mutation`
- 收据：run 40285774452 @ `2e7484026`（Nightly，真实 Postgres + API），step success
- 补充：跨 owner 的服务端约束另有 `packages/ai` 单元断言，随 `ci.yml` PR lane 执行

### DATA-MIGRATION

- 已有：Schema SQL 单元测试（如 `packages/database/src/schema/task-shared-label-migration.spec.ts`）+ `ci.yml` 的 DB 集成 shard（真实 PostgreSQL 容器，`database:prisma-push` 后执行）
- 收据：run 40804738576 @ `9a97c9130`，`Test Server (1-3/3)` success
- **缺口**：真实 PostgreSQL **旧版完整 Schema Cutover / 恢复演练**没有 Workflow，也没有一次性可执行演练脚本；不得以 Schema SQL 单元测试或 `prisma push` 冒充

### VISUAL-LAYOUT

- 门禁：`ci.yml` `Test Web (Visual)`，PR 跑代表性 grep 子集，push/schedule 跑完整 `web:e2e:visual-regression`
- 收据：run 40804738576 @ `9a97c9130`（push main），`Test Web (Visual 1/1)` success（完整审计）
- 平台约束：`ubuntu-24.04` + 固定 `fonts-noto-cjk` / `fonts-wqy-zenhei`，字体 preflight 不匹配即 `::error::` 失败

## 接线

### WEB-DESKTOP-SYNC → Nightly Audit `Specialized E2E (Web/Desktop Sync)`

- Workflow：`.github/workflows/nightly-audit.yml`，job `sync-e2e`，`ubuntu-24.04`，cron `0 2 * * *` 与 `workflow_dispatch`
- 环境：`docker compose --profile test --profile sync-test up -d --wait postgres-test powersync-test`；`database:prisma-push`；`playwright install chromium`；`apps/web/scripts/run-linux-sync-e2e-with-keyring.sh`
- Keyring：该 lane 会启动真实 Electron，`apps/web/e2e/sync/helpers/desktop.ts` 在 `safeStorage` 为 `basic_text`/`unknown` 时抛错，因此 job 装 `dbus-x11 gnome-keyring libsecret-tools libglib2.0-bin`，由包装脚本在 Xvfb 内起 `dbus-run-session` + `gnome-keyring-daemon`（login/start 生命周期 + sentinel 读写自检）。keyring 通过 `XDG_DATA_HOME` 隔离而**不**改 `HOME`：Playwright 的浏览器缓存按 `HOME` 解析，且该 collector 的 `webServer` 会调用 `corepack pnpm`
- Electron 测试开关：Playwright 的 Electron 启动器会自带 `--password-store=basic` / `--use-mock-keychain`；collector 在 `MEMOFLOW_E2E_USE_GNOME_KEYRING=1` 时把桌面车道已有的 `real-keyring-playwright-loader.cjs` 传给 Electron 仅移除这两个测试默认值，helper 的 `backend` 断言保持原样
- 准入：PowerSync 签名键取自仓库内 `.env.development`（已跟踪），不新增 Secret；缺失时 collector 抛错
- Target 闭包：`web:e2e:sync` 现在声明 `cache: false` 与 `dependsOn: ["^build"]`，由 `tools/nx-test-system` 的 `sync-test-targets` 生成器维护（`e2e:sync` 不在 `CI_TARGETS` 内，因此不会把 `app-vue:build` / `desktop:build` 拉进 test-only PR，符合 #700 的图层口径）。该 target 由生成器拥有，`apps/web/project.json` 必须与 `nx sync` 输出一致，否则 Lint 车道的 `nx sync:check` 失败
- 归属：`e2e-ownership.json` 中该 collector 的 `automation` 指向该 workflow 与 `web:e2e:sync`
- 取证状态：**待触发**（本分支尚未合并到默认分支，`workflow_dispatch` 只认默认分支上的 workflow 定义）。首次接线后的 [run 40811627810](https://github.com/BakerSean168/memoflow/actions/runs/40811627810) 三个 spec 均死于缺少 Secret Service（`backend=basic_text`），本分支已补齐 keyring 会话，需合并后重新 dispatch 取证

### AUTH-LOGIN → Desktop Update Installed E2E `Desktop Auth Flow`

- Workflow：`.github/workflows/desktop-update-e2e.yml`，job `desktop-auth-flow`，`ubuntu-latest`
- 触发：`workflow_dispatch` 与 `workflow_call`（由 `release-assets.yml` 在 release 阶段调用），即 desktop/release 车道
- 执行：`apps/desktop/scripts/run-linux-electron-e2e-with-keyring.sh e2e/authentication/desktop-auth-flow.spec.mts`，在 Xvfb + 真实 Secret Service（gnome-keyring）下启动真实 Electron 与真实 profile 目录
- 准入：spec 自带本地 auth HTTP server，无外部云凭据；`safeStorage` 后端为 `basic_text`/`unknown` 时 spec 直接抛错
- 归属：**不**在 `e2e-ownership.json` 声明 collector 级 `automation` —— 该 collector 只有这一个 spec 在此车道执行，声明整组会自动会夸大覆盖
- 取证状态：**待触发**（同上）

## 已知缺口与下一步

| 缺口                                        | 原因                                                                           | 下一步                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 两条新门禁无 Run 收据                       | 分支未合并，`workflow_dispatch` 需要默认分支上的 workflow 定义                 | 合并后在默认分支 dispatch 一次 `Nightly Audit` 与 `Desktop Update Installed E2E`，回填 Run URL + SHA |
| 真实 Provider 评测无门禁                    | `[opt-in]` 用例需要 `E2E_MODEL_SERVICE_BASE_URL` / `_API_KEY`，仓库无此 Secret | 决定是否引入受控 Secret 与独立 job；在此之前只声明 replay 结论                                       |
| 旧版 Schema Cutover / 恢复演练无门禁        | 无演练脚本与环境契约                                                           | 另开任务定义演练镜像、数据夹具与验收判据                                                             |
| `TASK-RECURRENCE-A11Y` 的真实 Chromium 验收 | reference collector 属 manual lane                                             | 若要提级，需在 Nightly 增加该 collector 的 job 并补 `automation`                                     |

## Fail-closed 决策

| 场景                          | 条件不满足时的行为                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `WEB-DESKTOP-SYNC`            | 缺 `POWERSYNC_*` 签名键或容器未就绪 → target 抛错、job 失败，不降级为 skip                                                |
| `WEB-DESKTOP-SYNC`（keyring） | 无 Secret Service（`safeStorage` 报 `basic_text`/`unknown`）→ 包装脚本在 sentinel 自检或 helper 断言处失败，不降级为 skip |
| `AI-EVAL-QUALITY`（live）     | 缺 `E2E_MODEL_SERVICE_*` → `test.skip`；Job 仍是绿色，故**不得**据此宣称真实 Provider 已验证，只能引用 replay 结论        |
| `DESKTOP-*`                   | 打包/安装失败 → job 失败；不允许用未打包 smoke 替代                                                                       |
| `DATA-MIGRATION`（cutover）   | 无环境 → 保持缺口，不以单元测试替代                                                                                       |
