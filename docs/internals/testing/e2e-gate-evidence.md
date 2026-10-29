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

本页是 [Test System V2](./test-system-v2.md) 中"关键业务风险的执行责任"落地记录，对应 Issue #608。

机器可读的执行归属以 `tools/test-system-v2/e2e-ownership.json` 为准绳：collector 级 `automation` 条目声明哪个 GitHub Workflow 以哪个 Nx target 执行该 collector。**文件存在、YAML 中声明、条件 skip 都不构成验证**；本页只登记真实 Run 收据或明确缺口。

## 证据等级

| 等级           | 含义                                                             |
| -------------- | ---------------------------------------------------------------- |
| `verified-run` | 存在针对精确 git SHA 的成功 Run，并已逐条核对 job 明细与结论     |
| `gate-only`    | 门禁真实接线且会在对应阶段执行，但尚无该 SHA 的成功 Run 收据     |
| `no-gate`      | 没有 Workflow 会在任何阶段执行该场景，属执行责任缺口             |

## 矩阵

| 风险 ID              | 负责 Workflow / Runner                          | 触发阶段        | 平台                          | 外部 DB / Provider 准入                    | 目标 SHA + 最近成功 Run | 等级          |
| -------------------- | ----------------------------------------------- | --------------- | ----------------------------- | ------------------------------------------ | ----------------------- | ------------- |
| `WEB-DESKTOP-SYNC`   | 待接线（当前无）                                | —               | Linux（Electron + xvfb）      | Postgres/PowerSync 容器                    | 待盘点                  | `no-gate`     |
| `DESKTOP-UPDATE`     | `release-assets.yml` → `desktop-update-e2e.yml` | Release         | macOS/Windows/Linux           | 无（打包安装态）                           | 待取证                  | `gate-only`   |
| `DESKTOP-IPC`        | `release-assets.yml` → `desktop-update-e2e.yml` | Release         | Windows                       | 无（打包安装态）                           | 待取证                  | `gate-only`   |
| `AUTH-LOGIN`         | 待盘点                                          | 待盘点          | 待盘点                        | 待盘点                                     | 待盘点                  | 待盘点        |
| `GOAL-DRAFT`         | 待盘点                                          | 待盘点          | 待盘点                        | 待盘点                                     | 待盘点                  | 待盘点        |
| `TASK-RECURRENCE-A11Y` | 待盘点                                        | 待盘点          | 待盘点                        | 待盘点                                     | 待盘点                  | 待盘点        |
| `AI-APPROVAL`        | 待盘点                                          | 待盘点          | 待盘点                        | 待盘点                                     | 待盘点                  | 待盘点        |
| `AI-EVAL-QUALITY`    | 待盘点                                          | 待盘点          | 待盘点                        | Replay 确定性 / Live opt-in 需区分         | 待盘点                  | 待盘点        |
| `OWNER-ISOLATION`    | 待盘点                                          | 待盘点          | 待盘点                        | 待盘点                                     | 待盘点                  | 待盘点        |
| `DATA-MIGRATION`     | 待盘点                                          | 待盘点          | 待盘点                        | 真实 PostgreSQL Cutover / 恢复演练         | 待盘点                  | 待盘点        |
| `VISUAL-LAYOUT`      | `.github/workflows/ci.yml`                      | PR              | Linux                         | 无                                         | 待盘点                  | 待盘点        |

## 逐项记录

### WEB-DESKTOP-SYNC

- Spec：`apps/web/e2e/sync/goal-sync-regression.spec.ts`
- Collector / target：`apps/web/playwright.sync.config.ts` / `web:e2e:sync`
- 当前归属：`e2e-ownership.json` 中该 collector 无 `automation` 条目；target 无 `dependsOn`
- 构成：真实 Electron（desktop fixture 启动）+ Web 页双向同步；headless Linux 需 xvfb
- 状态：`no-gate` — 本 Issue 接线

### DESKTOP-UPDATE

- Spec：`apps/desktop/e2e/packaged-runtime/packaged-runtime.spec.ts`（另有 `provider-layout-window.spec.ts`）
- Target：`desktop:test:packaged-smoke`
- 执行：`release-assets.yml` 的 `build-release-assets` 以 `MEMOFLOW_PACKAGED_EXECUTABLE` 指向真实打包安装态执行；`desktop-update-e2e.yml` Windows job 亦跑该 target
- 状态：`gate-only` — 缺精确 release SHA 的成功 Run 收据

### DESKTOP-IPC

- Spec：`apps/desktop/e2e/workspace-ipc.spec.mts`
- 执行：`release-assets.yml` 调用 `desktop-update-e2e.yml`，`windows-latest` 安装态命令包含该 spec
- 状态：`gate-only` — 缺精确 release SHA 的成功 Run 收据；不重复建设门禁

### AUTH-LOGIN

- 待盘点：`apps/desktop/e2e/authentication/desktop-auth-flow.spec.mts`（真实 Electron Profile + Cloud 认证）的实际门禁
- UI 验证归属：#605 / #606 / #607 合并后证据

### GOAL-DRAFT

- 待盘点：#605 / #606 / #607 合并后证据归属

### TASK-RECURRENCE-A11Y

- 待盘点：#607 合并后证据归属

### AI-APPROVAL

- 待盘点

### AI-EVAL-QUALITY

- 待盘点：须区分 `web:e2e:ai-provider` 的 Recorded Replay（确定性）与 Live Provider（opt-in、高成本）

### OWNER-ISOLATION

- 待盘点

### DATA-MIGRATION

- 待盘点：须区分 Schema SQL 单元测试与真实 PostgreSQL 旧版 Schema Cutover / 恢复演练

### VISUAL-LAYOUT

- Collector / target：`apps/web/playwright.visual-regression.config.ts` / `web:e2e:visual-regression`
- 执行：`.github/workflows/ci.yml`
- 待盘点：最近 PR CI 收据

## Fail-closed 决策

尚未定案。每项在补完盘点后须写明：条件不满足（无 DB、无 Provider 凭据、无签名键、平台不适用）时该场景是失败、显式跳过并降级声明，还是阻断合并。
