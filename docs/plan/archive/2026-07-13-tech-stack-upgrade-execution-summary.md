---
tags:
  - plan
  - summary
  - infrastructure
  - dependencies
  - upgrade
description: 2026-07 tech-stack one-shot 升级执行总结：落地版本、适配要点、验证证据与剩余环境事项
created: 2026-07-13T18:10:00+00:00
updated: 2026-07-14T00:00:00+00:00
---

# Tech Stack Upgrade Execution Summary（2026-07）

> 对应计划：[`2026-07-12-tech-stack-upgrade-plan.md`](./2026-07-12-tech-stack-upgrade-plan.md)  
> 分支：`chore/tech-stack-upgrade-2026-07`  
> 策略：**one-shot** 升级（B0–B6/B8 + B9 + B10；B7 镜像/路径钉住，生产数据迁移独立维护窗口）

## 1. 结论

代码侧技术栈升级**已完成**，并在远程开发环境通过最终验证矩阵。  
本地开发机/其他工作区在拉取该分支后，需要按 [`../guides/development/tech-stack-upgrade-local-sync.md`](../guides/development/tech-stack-upgrade-local-sync.md) 同步依赖与数据卷。

| 维度                    | 状态                           |
| ----------------------- | ------------------------------ |
| 目标版本写入 + lockfile | 完成                           |
| 代码/配置适配           | 完成                           |
| 本地最终验证矩阵        | 通过（见 §5）                  |
| 生产 PG dump/restore    | **未做**（计划内独立维护窗口） |
| PR / 干净 CI 复核       | 待开 PR 后执行                 |

## 2. 落地版本（实测）

| 组件                       | 升级后                               |
| -------------------------- | ------------------------------------ |
| pnpm                       | **11.12.0**（`packageManager` 钉死） |
| Node（CI / Docker）        | **24**                               |
| Vite                       | **8.1.4**（Rolldown）                |
| Nx                         | **23.0.2**                           |
| Electron                   | **43.1.0**                           |
| TypeScript                 | **6.0.3**                            |
| ESLint                     | **10.7.0**                           |
| Vitest                     | **4.1.10**                           |
| Vue                        | **3.5.39**                           |
| vue-router                 | **5.1.0**                            |
| vue-tsc                    | **3.3.7**                            |
| @lucide/vue                | **1.24.0**（替代 lucide-vue-next）   |
| Prisma                     | **7.8.0**                            |
| better-sqlite3             | **12.11.1**                          |
| Storybook                  | **10.5.0**                           |
| Tailwind CSS               | **4.3.2**                            |
| Expo / RN                  | **57.0.4 / 0.86.0**                  |
| reanimated / worklets      | **4.5.0 / 0.10.0**                   |
| PostgreSQL（Docker）       | **pgvector/pgvector:0.8.5-pg18**     |
| Redis（Docker）            | **redis:8-alpine**                   |
| @powersync/common / node   | **1.57.2 / 0.19.4**                  |
| electron-builder / updater | **26.15.6 / 6.8.9**                  |
| node-abi                   | **4.33.0**（ABI 148）                |

## 3. 主要适配与结构性变更

### 依赖与工作区

- 移除未使用 Vercel AI SDK（`ai` / `@ai-sdk/openai`）
- 退役 `packages/scheduler-server`
- 仓库内版本漂移对齐（zod / express / vue-tsc / vitest / eslint 等）
- pnpm 配置从 `package.json#pnpm` 迁入 `pnpm-workspace.yaml`（`overrides` / `allowBuilds` / `minimumReleaseAge`）
- `Dockerfile.api`：`PNPM_VERSION=11.12.0`，Node 24 基础镜像

### 构建与前端

- Vite 8：`rollupOptions` → `rolldownOptions`
- lucide：源码 import 迁移到 `@lucide/vue`
- patterns：`resolve.tsconfigPaths: true`
- electron-builder `electronVersion: 43.1.0` + `@electron/rebuild` 4.2.0

### TypeScript / ESLint / Mobile

- `tsconfig.base.json`：`ignoreDeprecations: "6.0"`；部分 typecheck 包剥离冲突 `rootDir`/`outDir`
- Error 子类 `cause` 字段与 TS6 对齐
- Mobile：Expo 57 peers；`StyleSheet.absoluteFillObject` → `absoluteFill`
- Mobile lint：在 ESLint 10 下使用仓库基线 flat config（避免 eslint-config-expo 内旧 react 插件崩溃）

### 数据层（B7 代码侧）

- compose / CI 镜像统一到 PG18 + Redis 8
- 卷路径改为 `/var/lib/postgresql`（PG18 官方镜像布局）
- **未**对已有生产数据执行 dump/restore

## 4. 验证证据

远程开发环境最终矩阵（`/tmp/ultimate-matrix.log`，2026-07-13）：

| Gate                                             | Result                                             |
| ------------------------------------------------ | -------------------------------------------------- |
| core typecheck（utils…api 等 10 项目）           | pass                                               |
| `api:build` / `web:build` / `desktop:build`      | pass                                               |
| `utils:test` / `contracts:test` / `desktop:test` | pass                                               |
| `memoflow:governance-check`                      | pass                                               |
| `apps/mobile` `expo install --check`             | Dependencies are up to date                        |
| local docker health                              | postgres(pg18)/redis8/api/web/ai/powersync healthy |
| HTTP smoke                                       | api `/info` 200，web `/` 200                       |

补充：desktop typecheck、native-rebuild（better-sqlite3）、app-vue/app-react/ui-react-native/mobile typecheck、api/mobile lint 等在修复验证失败过程中均已通过。

## 5. 已知边界与风险

1. **旧 PG 数据卷与 PG18 不兼容**  
   直接换镜像不升级数据会启动失败。本地开发通常删除旧卷重建空库；生产按维护窗口 dump/restore。
2. **PowerSync slot**  
   跨 major PG 升级后 slot 会重建并全量 re-replicate，应安排低峰窗口。
3. **Mobile**  
   仓库内无正式 mobile build/test/e2e Nx target；验收以依赖对齐 + `expo install --check` + typecheck/lint 为主。
4. **长效防漂移（计划 §8）**  
   pnpm catalog / Renovate 等属于升级后机制，**不是**本 one-shot 版本升级的阻塞项。

## 6. 推荐后续动作

1. 开发者本机 / 其他 worktree：按 [local sync guide](../guides/development/tech-stack-upgrade-local-sync.md) 同步
2. 开 PR → CI 干净环境复核
3. 生产/共享库需要时，单独排 B7 维护窗口
4. 计划完成后可移入 `docs/plan/archive/`

## 7. 关键路径

- 计划：`docs/plan/active/2026-07-12-tech-stack-upgrade-plan.md`
- 本地同步指南：`docs/guides/development/tech-stack-upgrade-local-sync.md`
- 本地 Docker：`docs/guides/development/local.docker.md`
- 根配置：`package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`Dockerfile.api`、`docker-compose*.yml`
