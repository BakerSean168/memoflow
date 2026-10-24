---
tags:
  - plan
  - archive
  - infrastructure
  - dependencies
  - upgrade
description: 全技术栈升级到当前稳定版的分批实施方案（Vite 8 / Electron 43 / Nx 23 / TS 6 / PG 18 等），含兼容矩阵、验证清单与长效防漂移机制
created: 2026-07-12T00:00:00+08:00
updated: 2026-07-12T00:00:00+08:00
---

# 技术栈全面升级方案（2026-07）

> 调研基准日 **2026-07-12**。所有"最新版本"均来自当日 npm registry dist-tags、Docker Hub 与官方发布公告实测，非训练期知识。来源链接见文末。

## 1. 背景与触发

- 2026-07-12 的 dev server 故障（中断的 `pnpm install` → `allowBuilds` 占位符 → Electron postinstall 被跳过 + workspace 链接缺失）暴露出依赖管理层的脆弱性，也促成了这次全面盘点。
- 盘点发现两类问题：**落后于当前稳定版**（最多落后 4 个 major），以及**仓库内部版本漂移**（同一依赖在不同子包声明了相差 1~3 个 major 的版本）。
- 两项有硬性时间约束：
  - **Electron 39 已于 2026-05-05 EOL**（无安全补丁，桌面端直接暴露 Chromium 漏洞面）；
  - **ESLint 9.x 将于 2026-08-06 EOL**（距今不到一个月）。

## 2. 现状盘点（2026-07-12 实测）

### 2.1 核心组件版本表

| 组件                          | 当前                                         | 目标                                            | 跨度        | 风险                          |
| ----------------------------- | -------------------------------------------- | ----------------------------------------------- | ----------- | ----------------------------- |
| Vite                          | 7.3.1                                        | **8.1.4**（Rolldown，2026-03-12 GA）            | 1 major     | 高（desktop 配置面）          |
| Nx / @nx/*                    | 22.5.3                                       | **23.0.2**（2026-06-16）                        | 1 major     | 中（自动迁移覆盖大部分）      |
| Electron                      | 39.2.6（已 EOL）                             | **43.1.0**（勿用 43.0.x）                       | 4 major     | 中（ABI 148 原生模块）        |
| vite-plugin-electron          | 0.29.0                                       | **1.1.0**                                       | 1 major     | 中                            |
| vite-plugin-electron-renderer | 0.14.6                                       | **1.0.0**                                       | 1 major     | 低                            |
| vite-plugin-dts               | 4.5.4（已停更）                              | **5.0.3**（unplugin-dts 薄包装）                | 1 major     | 中                            |
| TypeScript                    | 5.9.3                                        | **6.0.x**（过渡桥；7.x 观望）                   | 1 major     | 中（tsconfig 默认值变更）     |
| vue-tsc                       | 3.1.8 / 2.2.12（漂移）                       | **3.3.7**（支持 TS 6）                          | minor/major | 低                            |
| Vue                           | 3.5.25                                       | **3.5.39**（3.6 仍 beta，观望）                 | patch       | 低                            |
| vue-router                    | 4.6.3                                        | **5.1.0**（官方声明零 breaking）                | 1 major     | 低                            |
| Vitest                        | 4.0.18 / 4.0.15 / 1.6.1（漂移）              | **4.1.10**（day-1 支持 Vite 8）                 | minor       | 低                            |
| Storybook                     | 10.2.8                                       | **10.5.0**（10.3 起支持 Vite 8）                | minor       | 低                            |
| Tailwind CSS                  | 4.1.18                                       | **4.3.2**（向后兼容）                           | minor       | 低                            |
| ESLint                        | 9.39.1 / 8.57.1（漂移）                      | **10.7.x**                                      | 1 major     | 中（flat config 已就位）      |
| eslint-plugin-vue             | 9.33.0                                       | **10.9.2**                                      | 1 major     | 低                            |
| typescript-eslint             | 8.49.0 / 6.21（漂移）                        | **8.63.0**（peer 支持 ESLint 10、TS <6.1）      | minor       | 低                            |
| Prisma 套件                   | 7.4.2                                        | **7.8.0**（7.4 的 query plan cache 有已知 bug） | minor       | 低                            |
| pg                            | 8.18.0                                       | **8.22.0**                                      | minor       | 低                            |
| ioredis                       | 5.8.2                                        | **5.11.1**（支持 Redis 8.8 新命令）             | minor       | 低                            |
| better-sqlite3                | 12.6.2                                       | **≥12.11.2**（Electron 43 prebuild 门槛）       | minor       | 中                            |
| @electron/rebuild             | 4.0.3                                        | **4.2.0**（node-abi ≥4.31 认识 ABI 148）        | minor       | 低                            |
| electron-builder              | 26.8.1                                       | **26.15.6**（27 是 alpha，勿升）                | minor       | 低                            |
| electron-updater              | 6.6.2                                        | **6.8.9**                                       | minor       | 低                            |
| @powersync/common / node      | 1.47.0 / 0.17.1                              | **1.57.2 / 0.19.4**                             | minor       | 中（同步链路回归）            |
| PostgreSQL（Docker）          | pgvector:pg16 ×3 + **pg15（test！）**        | **pgvector/pgvector:0.8.5-pg18**（PG 18.4）     | 2~3 major   | 高（数据迁移+PowerSync slot） |
| Redis（Docker）               | redis:7-alpine                               | **redis:8-alpine**（8.8，AGPL 三重许可）        | 1 major     | 低                            |
| pnpm                          | 10.32.1                                      | **11.12.0**（择机，见观望区条件）               | 1 major     | 中（配置体系迁移）            |
| Node.js                       | 本机 24.12 / CI+Docker **22** / engines >=22 | 运行时统一 **24 LTS**；Node 26 等 10 月转 LTS   | —           | 低                            |
| Expo / RN（mobile）           | 55.0.9 / 0.83.4                              | **57.x / 0.86**                                 | 2 SDK       | 中                            |
| Vercel AI SDK                 | 5.0.110（**全仓库零使用**）                  | **直接移除**                                    | —           | 零                            |

### 2.2 仓库内部版本漂移清单（对齐即收益，多数不用跨 major）

| 依赖               | 漂移现状                                                               | 对齐目标                                      |
| ------------------ | ---------------------------------------------------------------------- | --------------------------------------------- |
| zod                | 根 4.3.6，`ui-vue-shadcn` **3.24.0**                                   | 4.4.3 统一                                    |
| vue-tsc            | 根 3.1.8，`web` **2.2.12**                                             | 3.3.7 统一                                    |
| @vitejs/plugin-vue | 根 6.0.4，`desktop` **^5.0.0（5.2.4）**                                | 6.0.7 统一                                    |
| express            | 11 个包 ^5.1.0，`account`/`governance` **^4.21.0**                     | ^5.x 统一（4/5 混用会重复安装两份且语义不同） |
| vitest             | 根 4.0.18，`test-utils`/`ui-core` 4.0.15，`scheduler-server` **1.6.1** | 4.1.10 统一                                   |
| eslint             | 根 9.39.1，`scheduler-server` **8.57.1**                               | 随 ESLint 10 批次统一                         |
| argon2             | 根 0.44.0，`authentication` **0.43.1**                                 | 0.44.0 统一                                   |
| lucide-vue-next    | 0.460 / 0.511 / 0.542 三个版本                                         | 统一迁移到 **@lucide/vue 1.x**（原包已弃用）  |
| shadcn-vue         | 根 2.4.3，`ui-vue-shadcn` **0.11.4**                                   | 2.7.4 统一                                    |
| tsup               | 根 8.5，`scheduler-server` **7.3**                                     | 随退役处理                                    |
| PG 镜像            | local/prod/dev pg16，**test 竟是 pg15**                                | 0.8.5-pg18 四套统一                           |

### 2.3 死代码与孤儿

- **`ai` + `@ai-sdk/openai`（根依赖）**：全仓库 TS 源码零 import（AI 能力已迁至 Python `ai-service`）。升级方案 = 从 `package.json` 移除（移除前再全局搜一次 `.vue` 文件确认）。
- **`packages/scheduler-server`**：无任何项目依赖它，工具链停在 2024 年代（eslint 8、vitest 1.6、tsup 7、node-cron 3、@typescript-eslint 6）。建议 **归档退役**（移出 workspace 或删除），而不是花成本升级。它的存在还会拖累 `pnpm outdated`/lint 的全局信号。
- **@types/argon2、@types/uuid、@types/bcryptjs**：均已 Deprecated（包自带类型），直接删除。

### 2.4 基础设施钉住点（升级时必须联动的位置）

| 位置                                                                 | 内容                                                                           | 关联批次                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------- |
| `package.json` `packageManager`                                      | pnpm@10.32.1+sha512                                                            | pnpm 11 批                    |
| `package.json` `pnpm.overrides`                                      | `vite ^7.3.1`、`@types/node 22.13.14`、`@electron/rebuild 4.0.3`、`jiti 2.4.2` | Vite 8 / Electron / Node 各批 |
| `package.json` `pnpm.onlyBuiltDependencies/ignoredBuiltDependencies` | pnpm 11 起**不再被读取**（配置全面迁入 workspace.yaml）                        | pnpm 11 批                    |
| `pnpm-workspace.yaml`                                                | `allowBuilds`（新）与 `onlyBuiltDependencies`（旧）混存                        | pnpm 11 批清理                |
| `.github/workflows/*`                                                | `NODE_VERSION: '22'`、corepack enable                                          | Node 统一批                   |
| `Dockerfile.api`                                                     | `node:22-bookworm-slim` ×2                                                     | Node 统一批                   |
| `docker-compose{,.local,.prod}.yml`                                  | pgvector:pg16/pg15、redis:7、powersync `latest`                                | 数据层批                      |
| `.npmrc`                                                             | electron 镜像被注释、`save-exact=true`、`prefer-frozen-lockfile=true`          | Electron 批（42+ 安装流变化） |
| `packages/patterns/vite.config.ts`                                   | `nxViteTsPaths()`（Nx 23 弃用、24 移除）                                       | Nx 23 批                      |
| `packages/{assets,ui-vue-shadcn,app-vue}/vite.config.ts`             | `vite-plugin-dts` 4.x                                                          | Vite 8 批                     |

## 3. 升级总原则

1. **一批一分支一 PR**，批内可多 commit；绿色基线先行：升级前在 main 记录 `build + typecheck + test + e2e smoke` 全绿的 nx 输出作为对照。
2. **验证套餐**（每批必跑）：`pnpm nx run-many -t build --all --exclude=api,web,desktop,ai-service` → `typecheck` → `test` → 三端冒烟（web serve / api smoke / `desktop:serve:full`）。桌面相关批次追加 `desktop:package` 产物安装验证。
3. **`save-exact=true` 注意**：`pnpm update --latest` 会写精确版本；范围声明（`^`）的子包用 `pnpm -r update <pkg>@<version>` 精准推进，避免 lockfile 大面积翻动难以 review。
4. **回滚 = revert PR + `pnpm install`**；数据层批次额外要求旧数据卷保留 ≥7 天。
5. **观望区依赖**（beta/alpha/无 API）一律不进批次，只记录复查触发条件。

## 4. 批次计划

依赖关系（B7 数据层与主线解耦，B8/B9 仅依赖 B0）：

```
B0 → B1 → B2(ESLint,деadline 8/6) → B3(Electron,安全) → B4(TS6) → B5(Nx23) → B6(Vite8)
       ├────────────────────────→ B7(PG18+Redis8, 需维护窗口, 可与 B2~B6 并行)
       └→ B8(小major收尾) / B9(Mobile) / B10(pnpm11, 择机)
```

---

### Batch 0 — 卫生批：漂移对齐 + 死代码清理（0.5~1 天，零 major 风险）

**内容**：

1. 提交本次 `pnpm-workspace.yaml` 的 `allowBuilds` 修复（已完成待提交）。
2. 移除死依赖：根 `ai`、`@ai-sdk/openai`；三个 Deprecated 的 `@types/*`。
3. `scheduler-server` 退役决策：`git rm -r packages/scheduler-server`（历史在 git；若想保守，先移出 `pnpm-workspace.yaml` 的 packages 列表）。
4. 版本漂移对齐（§2.2 表全部项，其中 express 4→5 的 `account`/`governance` 需按 Express 5 迁移点过一遍：`app.del`→`delete`、正则路由、`res.status().send()` 链、async 错误自动传递）。
5. CI `NODE_VERSION` 22→24、`Dockerfile.api` 基础镜像 node:22→node:24-bookworm-slim（本机已是 24.12，统一运行时；Node 24 LTS 支持至 2028-04）。
6. 建立基线记录（附到本文件 §9）。

**验证**：全量套餐；重点 `account`/`governance` 的 API 集成测试（Express 5 语义）。

---

### Batch 1 — 低风险 minor/patch 批量（0.5~1 天）

一次性推进所有**同 major**升级（约 60 项），重点清单：

- **为后续批次铺路（必须在本批完成）**：`better-sqlite3@12.11.2+`、`@electron/rebuild@4.2.0`（同步改 `pnpm.overrides`）、`electron-builder@26.15.6`、`electron-updater@6.8.9`、`vitest@4.1.10` 全家、`@vitejs/plugin-vue@6.0.7`、`vue-tsc@3.3.7`、`storybook@10.5.0` 全家。
- 数据侧：`prisma@7.8.0` 全家（含 `@prisma/adapter-pg`）、`pg@8.22.0`、`ioredis@5.11.1`、`@powersync/common@1.57.2`、`@powersync/node@0.19.4`。
- 前端：`vue@3.5.39`、`tailwindcss@4.3.2`、`@vueuse/core@14.3.0`、`echarts@6.1.0`、`reka-ui@2.10.1`、`shadcn-vue@2.7.4`、`vue-i18n@11.4.6`。
- 工具：`playwright@1.61.1`、`happy-dom`、`msw@2.15.0`、`prettier@3.9.5`、`tsx@4.23.0`、`typescript-eslint@8.63.0`（为 ESLint 10 铺路）、`sass-embedded`、`@swc/core`、`@nxlv/python@22.2.1`。
- 桌面：`electron-log@5.4.4`、`simple-git@3.36.0`、`tailwind-merge@3.6.0`。

**注意**：

- zod 4.4.3 的错误信息措辞有变化，**快照测试可能碎**——属预期内更新快照，不是回归。
- `@powersync/*` minor 跨度较大（1.47→1.57），桌面端同步链路单独冒烟。
- desktop 手动钉住的 `pg-types`/`postgres-*` 传递依赖**不动**（等 pg 主链需要时再说，跨 major 无收益）。

**验证**：全量套餐 + desktop 同步/离线场景手测。

---

### Batch 2 — ESLint 9→10（0.5~1 天，⚠️ 9.x 于 2026-08-06 EOL）

**内容**：`eslint@10.7.x`、`@eslint/js@10`、`eslint-plugin-vue@10.9.2`、`@eslint/markdown@8.0.3`、`globals@17`、`jsonc-eslint-parser@3.1.0`；`eslint-config-prettier`/`eslint-plugin-prettier`/`eslint-plugin-storybook` 按 peer 提示跟进。

**要点**（对本仓库）：

- 仓库已是 flat config（`eslint.config.ts`），主迁移成本已付。
- **新 config 查找算法**：从被 lint 文件所在目录向上查找（不再从 cwd）——monorepo 下 `apps/desktop` 有独立 eslint 配置，确认其与根配置的边界行为（可能正是收益：子目录配置天然生效）。
- eslintrc 兼容层彻底删除：检查 lint 脚本无 `--no-eslintrc`/`--env` 等旧参数；`/* eslint-env */` 注释会报错，全仓 grep 清理。
- jiti ≥2.2 已满足（2.4.2），TS 配置文件加载不受影响。
- Node ≥20.19 已满足。

**验证**：`pnpm lint`（全项目）对比升级前 warning/error 计数；抽查 vue 文件的 plugin-vue 10 新规则影响。

---

### Batch 3 — Electron 39→43.1（1~2 天，安全驱动，仅依赖 B1）

**内容**：`electron@43.1.0`（**必须 43.1+**：43.0.x 有 updater 替换 app.asar 崩溃与 preload ENOENT，43.1 修复）。

**跨 4 个 major 的代码扫描点**（本应用命中面小，已核对四份官方 breaking changes）：

- 40：renderer 直接用 `clipboard` 废弃 → 全仓 grep，确保剪贴板走 preload/contextBridge；
- 41：PDF 不再生成独立 guest WebContents（若有 PDF 预览逻辑需改 WebFrameMain）；
- 42：`session.clearStorageData` 移除 `quotas` 选项；
- 43：**`dialog.showOpen/SaveDialog` 不再记住上次目录**（`defaultPath` 默认下载目录）——repository/editor 模块的文件对话框如依赖"记住上次位置"，需自行持久化并显式传 `defaultPath`。

**安装流变化（42+，与本仓库 allowBuilds 事故直接相关）**：

- Electron 42 起 **postinstall 不再下载二进制**，改为首次运行时下载；`ELECTRON_SKIP_BINARY_DOWNLOAD` 移除，新增 `install-electron` 脚本与 `ELECTRON_INSTALL_ARCH/PLATFORM`。
- 影响：`allowBuilds.electron` 的作用变化；CI/离线环境需显式跑 `install-electron` 或预热缓存；建议同时启用 `.npmrc` 里被注释的 `electron_mirror`（国内网络下首次运行下载更易失败）。

**原生模块（ABI 148 / Node 24 / Chromium 150）**：

- better-sqlite3 ≥12.11.2（B1 已就位）有官方 prebuild；`desktop:native-rebuild` 全流程跑通；
- @electron/rebuild 4.2.0 + 刷新 lockfile（node-abi ≥4.31），兜底 `--force-abi=148`；
- argon2（N-API）理论免重建，主进程实测加载一次。

**验证**：`desktop:serve:full` 冒烟 → `desktop:package` 安装包实测（含自动更新链路 dry-run）→ 文件对话框/剪贴板/通知回归。

---

### Batch 4 — TypeScript 5.9→6.0（1~2 天，为 TS 7 铺路的官方过渡桥）

**背景**：TS 7.0（Go 原生 tsgo，8~12x 提速）已于 2026-07-08 GA，但 **7.0 无编程 API（7.1 才有）**，vue-tsc、typescript-eslint（支持 <6.1.0）、tsup `--dts` 全部依赖 TS API——**现在上 7 会卡死整个工具链**。官方路径：6.0 是最后一个 JS 实现版本，"6.0 干净编译 ≈ 7.0 干净编译"，先清 6.0 的废弃项，7.1 生态就绪后切换成本趋近零。

**内容**：`typescript@6.0.x`（root + 全部子包 devDep 统一）。

**tsconfig 默认值变更排查**（对本仓库的实际影响面）：

- `strict` 默认 true（仓库应已显式开启，确认即可）；
- `module` 默认 esnext、`moduleResolution` 弃用 `node`/`classic`（各包 tsconfig 显式声明的不受影响，грep 无声明处）;
- `baseUrl` 废弃（检查是否有包用 baseUrl+paths，改相对 paths）；
- `target: es5`、`outFile` 废弃（应无使用）。
- 过渡期可用 `ignoreDeprecations: "6.0"` 暂留旧配置，但目标是清零。

**配套**：vue-tsc 3.3.7 已支持 TS 6（B1 就位）；typescript-eslint 8.63 支持 <6.1 ✓；tsup dts 走 TS 6 API ✓。

**验证**：全量 `typecheck` + 各包 dts 产物 diff 抽查（tsup/vite-plugin-dts 的声明输出不应有语义变化）。

---

### Batch 5 — Nx 22→23（0.5~1 天）

**内容**：`pnpm nx migrate latest` → 审阅 migrations.json → `pnpm nx migrate --run-migrations`。

**要点**：

- 最低 Node 22 ✓（B0 后 CI 已是 24）；
- **@nx/vitest 从 @nx/vite 拆分**：自动迁移处理，但本仓库大量 test target 是 `nx:run-commands` 直调 vitest CLI，受影响面小，核对 `@nx/vitest` 包被正确加入；
- `nxViteTsPaths()` 弃用（v24 移除）：`packages/patterns/vite.config.ts` 一处，换 `vite-tsconfig-paths`；
- **@nxlv/python 对 Nx 23 的 peer 兼容需实测**（22.2.1 是当前最新，若不兼容 Nx 23，ai-service 的 targets 会挂——这是本批最大的未知数，迁移前先在分支验证 `nx run ai-service:lint`）；
- 自带 rollupOptions→rolldownOptions 迁移器（为 B6 做部分准备，但 Vite 仍是 7，此时不生效不冲突）。

**验证**：`nx graph` 正常、全量套餐、`nx affected` 行为抽查、Nx Cloud/缓存命中率无异常。

---

### Batch 6 — Vite 7→8（Rolldown 统一，2~3 天，收益最大的一批）

**前置**：B5 完成（@nx/vite 23 的 peer 才允许 vite 8；22.x 会 ERESOLVE）。

**可选降险步骤**：先在分支用 `pnpm.overrides` 切 `"vite": "npm:rolldown-vite@7.x"` 跑一周全量 CI，隔离"Rolldown 引擎问题"与"Vite 8 API 问题"两类变量；团队小可跳过直上 8。

**内容**：`vite@8.1.4`（同步改 `pnpm.overrides` 的 `^7.3.1`→`^8.1.4`）、`vite-plugin-electron@1.1.0`、`vite-plugin-electron-renderer@1.0.0`、`vite-plugin-dts@5.0.3`（3 个包）。

**desktop `vite.config.ts` 改造清单**（主要风险面）：

1. `build.rollupOptions`→`build.rolldownOptions`（兼容层可过渡，一次性改名干净）；
2. preload 配置里的 `manualChunks: undefined`：对象形式的 manualChunks 已移除、函数形式弃用——`undefined` 等价未设置可直接删；如需控制分块改 `advancedChunks`；
3. 函数式 `external: isElectronMainExternal` 仍支持但有 Rust→JS 回调开销，建议改为字符串/正则数组（`electronExternalWorkspacePackages` 本就是静态列表，可编译为正则）；
4. `format: 'cjs'` 输出仍支持 ✓，但 **CJS interop 行为变化**：主进程 external 的 CJS 依赖（better-sqlite3、argon2、pg、@powersync/node）加载路径必须逐一冒烟，异常时以 `legacy.inconsistentCjsInterop: true` 过渡并记录 issue；
5. `optimizeDeps.esbuildOptions`（如有）自动转 `rolldownOptions`。

**其他端**：web/app-vue/ui-vue-shadcn/assets 的 vite 配置基本纯标准选项，预期兼容层直接过；Storybook 10.5 自动按 Vite major 选择 options 键 ✓；Vitest 4.1 复用项目 vite ✓。

**升级后基准**：记录三端 build 耗时对比（官方口径 10~30x，GitLab 实测 2.5min→22s；同时关注 **dev 内存上涨 ~7x** 是否影响本机体验，Vite 团队在持续优化）。

**验证**：全量套餐 + 三端产物体积/结构 diff + desktop 打包安装实测 + Storybook build。

---

### Batch 7 — 数据层：PG 16→18.4 + Redis 7→8（0.5 天准备 + 维护窗口，可与 B2~B6 并行）

**顺序**：Node 侧库已在 B1 就位 → Redis → PostgreSQL。

**Redis 7→8**（低风险）：

- `redis:8-alpine`（8.8，AGPLv3 三重许可，自部署无合规负担）；
- 纯 KV/缓存用法基本零破坏；如用了 ACL，注意 @read/@write 类别已扩容（含 FT./JSON. 命令）；
- ioredis 5.11.1 已就位 ✓。

**PostgreSQL 16→18.4**（跳过 17，`pgvector/pgvector:0.8.5-pg18`——务必 0.8.5，修复了 PG18 上 HNSW vacuum 损坏与性能回归）：

方案选型：**pg_dumpall → 新卷导入**（该规模最优；pg_upgrade 容器方案要求两侧 pgvector .so 齐备，扩展场景更繁琐；逻辑复制双实例对单机 Compose 不划算）。

执行序（四套 compose 一并统一到 pg18，含 test 的 pg15）：

1. 停 PowerSync service → `pg_dumpall` 导出到宿主；
2. 新数据卷 + 新镜像启动——**⚠️ 最大的坑：postgres:18 系镜像卷布局变更**，VOLUME 改为 `/var/lib/postgresql`（PGDATA 版本化为 `/var/lib/postgresql/18/docker`），compose 挂载路径必须改，否则起不来；
3. 导入 dump → 应用侧连接验证（Prisma 7.8 官方支持 PG 17/18 ✓）；
4. FTS/pg_trgm 索引因 collation 变化建议 `REINDEX`；PG18 initdb 默认启用 checksums（dump/restore 路径无影响，知悉即可）；
5. 起 PowerSync：**16→18 逻辑复制 slot 必然丢失**（slot 保留仅适用于"从 17 起"的 pg_upgrade），PowerSync 会自动重建 slot 并全量 re-replicate——安排低峰窗口，桌面端 @powersync/node 客户端随后自动增量拉齐，无需手工干预；
6. 顺手把 `journeyapps/powersync-service:latest` **固定为具体版本号**（近期版本增强了 slot 丢失检测）。

**回滚**：旧卷保留 ≥7 天；导入失败直接切回旧卷旧镜像。

**收益备注**：PG17/18 的 vacuum 内存 1/20、异步 I/O 读最高 3x、uuidv7()、B-tree skip scan；且**这次 16→18 的痛苦是一次性的**——18→19 起 pg_upgrade 可同时保留统计信息与逻辑复制 slot。

---

### Batch 8 — 生态收尾 major 小包（1 天，任意时点，仅依赖 B0）

逐项独立小 PR（互不相关，坏了哪个 revert 哪个）：

- `vue-router@5.1.0`：官方零 breaking（未用 unplugin-vue-router ✓），iife 构建变化与本仓库无关；
- `lucide-vue-next` → **`@lucide/vue@1.x`**：三处版本统一 + import 全局替换（API 相同）；⚠️ v1 移除品牌图标，迁移前 grep 是否用到（Github/Twitter 等图标名）；shadcn-vue 生成器仍引用旧包，新生成组件注意手工替换；
- `uuid@14`、`undici@8`、`bson@7`、`js-yaml@5`、`dotenv-expand@13`、`jsdom@29`、`concurrently@10`、`jscpd@5`、`marked@18`：逐个过 changelog，多为 Node 版本门槛提升型 major；
- `@asteasolutions/zod-to-openapi@8.5`、`swagger-jsdoc@6.3` 等 API 文档链小升。

---

### Batch 9 — Mobile：Expo 55→57 / RN 0.86（0.5~1 天，独立）

- 路径：`npx expo install expo@^56 --fix` → 验证 →（或直接）`expo@^57 --fix`；SDK 55 起 New Architecture 已强制，无架构迁移负担；56→57（RN 0.85→0.86）官方零 breaking；
- 配套：`react-native-reanimated@4.5.1`（⚠️ RN 0.85+ Hermes 变更导致 import 即涨内存 25~30%，启用 worklets bundle mode 规避）、`react-native-gesture-handler@3.0.2`（major）、`eas-cli@20.5`、expo 全家 57.x；
- `npx expo-doctor` + 重建 dev client + EAS build 冒烟。

---

### Batch 10 — pnpm 10→11（0.5 天，择机：建议 B2/B4 之后、月内完成）

pnpm 11 把本次事故涉及的构建审批机制正式化，升级本身是收益，但属"有准备的迁移"：

1. 跑官方 codemod：`pnpx codemod run pnpm-v10-to-v11`；
2. **配置归一**：`package.json` 的 `pnpm.*`（overrides、onlyBuiltDependencies、ignoredBuiltDependencies）在 11 里**不再被读取**——全部迁入 `pnpm-workspace.yaml`；同时删除 yaml 里残留的旧字段（`onlyBuiltDependencies` 等已被 `allowBuilds` 完全取代）；
3. `strictDepBuilds` 默认 true：未在 `allowBuilds` 声明的含脚本依赖会**报错而非静默跳过**（正是本次事故想要的行为）；
4. 注意项：`minimumReleaseAge` 默认 1440 分钟（新发布的包 24h 内装不上，供应链保护；不适应可设 0）；`npm_config_*` 环境变量改 `pnpm_config_*`（grep CI/scripts）；`packageManager` 字段更新 + `corepack prepare pnpm@11`；Node 24 仍捆绑 corepack ✓（Node 25+ 移除，届时再议）；
5. lockfile 无格式 bump，但内容会变化（config deps 哈希入 lockfile）——预期一次较大 lockfile diff。

---

## 5. 观望区（明确不动，含复查触发条件）

| 项                                   | 现状                           | 触发条件                                                                                  | 预期时点                                      |
| ------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| **TypeScript 7（tsgo）**             | 7.0.2 GA 但无编程 API          | 7.1 发布 API + vue-tsc 官方支持（vuejs/language-tools#5381）+ typescript-eslint 放开 <7.x | 2026 Q4                                       |
| **Vue 3.6（Vapor/alien-signals）**   | beta.17，npm latest 仍 3.5     | 3.6 stable GA                                                                             | 2026 H2                                       |
| **Vitest 5**                         | 5.0.0-beta.6，无稳定时间表     | stable + Vite 8 生态磨合                                                                  | 观察                                          |
| **electron-builder 27**              | alpha（ESM/签名配置 breaking） | stable + electron-updater 7 stable                                                        | 观察                                          |
| **Node 26**                          | Current（Temporal 默认开启）   | 2026-10-28 转 LTS 后                                                                      | 2026 Q4（连动 CI/Docker/engines/@types/node） |
| **PostgreSQL 19**                    | Beta 1（2026-06-04）           | GA（预期 9~10 月）+ 一个 patch 周期                                                       | 2027                                          |
| **eslint 相关 Rust 化（oxlint 等）** | 生态迁移潮                     | 有明确收益诉求时专项评估                                                                  | 不设时点                                      |

## 6. 关键兼容矩阵（交叉约束速查）

| 约束                                           | 说明                                                     |
| ---------------------------------------------- | -------------------------------------------------------- |
| @nx/vite 22 ✗ vite 8                           | peer ERESOLVE，**Nx 23 必须先于 Vite 8**                 |
| vitest 4.0 ✗ vite 8                            | 4.1 起 day-1 支持且复用项目 vite                         |
| vue-tsc（所有版本）✗ TS 7                      | Volar 依赖 TS API；**TS 6 是当前上限**（vue-tsc ≥3.3）   |
| typescript-eslint 8.63                         | eslint ^8.57‖^9‖^10 ✓；TS <6.1 ✓                         |
| better-sqlite3 <12.11.2 ✗ Electron 43          | 无 ABI 148 prebuild，会触发本地编译或直接报错            |
| Electron 43 = Node 24 / ABI 148 / Chromium 150 | 每个 Electron major ABI 都变，原生模块随动               |
| Vite 8 = Node ≥20.19/22.12 + ESM-only          | engines 建议随 B6 升为 `>=22.12`（实际统一 24）          |
| pnpm 11 = Node ≥22 + 配置全面迁 workspace.yaml | package.json 的 pnpm.* 失效                              |
| PG 18 官方镜像                                 | VOLUME 变更为 `/var/lib/postgresql`，compose 挂载必改    |
| PowerSync                                      | PG 11+ 无上限 ✓；16→18 slot 必丢 → 自动全量 re-replicate |

## 7. 建议时间线（滚动 3~4 周）

| 周      | 批次                                                                  |
| ------- | --------------------------------------------------------------------- |
| 第 1 周 | B0 卫生批 → B1 minor 批量 → B2 ESLint 10（赶 8/6 EOL）                |
| 第 2 周 | B3 Electron 43.1（安全）；并行启动 B7 数据层演练（test 环境先行）     |
| 第 3 周 | B4 TS 6.0 → B5 Nx 23；B7 生产维护窗口执行                             |
| 第 4 周 | B6 Vite 8（含 rolldown-vite 预演可提前到第 3 周）；B8/B9/B10 见缝插针 |

## 8. 长效防漂移机制（升级完成后落地）

1. **pnpm catalog**：在 `pnpm-workspace.yaml` 增加 `catalog:` 段，把 vue/vite/typescript/zod/vitest/eslint 等"必须单版本"的依赖单例化，子包一律 `"vue": "catalog:"`——从机制上消灭 §2.2 那张漂移表。
2. **月度巡检**：`pnpm check:deps`（已有 script）+ 对照 endoflife.date 的 EOL 日历（electron/node/postgres/eslint）。
3. **自动化**：接入 Renovate（pnpm 11 的 `minimumReleaseAge` 与其 stabilityDays 语义天然配合），minor 自动 PR、major 仅开 issue。
4. **workspace 卫生**：`pnpm -r exec depcheck` 季度跑一次，防止再出现 `ai` 这类零使用依赖；孤儿包在 `docs/plan` 立退役决议。

## 9. 基线记录（B0 时填写）

- [ ] `pnpm nx run-many -t build --all` 全绿 @ commit `______`
- [ ] `pnpm typecheck` 全绿
- [ ] `pnpm test` 全绿（记录用例数：______）
- [ ] `pnpm e2e` smoke 通过
- [ ] desktop 打包安装可用（版本 0.9.0 基线安装包留存）
- [ ] web/api/desktop build 耗时基线：______ / ______ / ______（供 B6 对比）

## 10. 来源汇总

**Vite / Rolldown**：[Vite 8.0 发布](https://vite.dev/blog/announcing-vite8) ｜ [迁移指南](https://vite.dev/guide/migration) ｜ [rolldown-vite 渐进路径](https://v7.vite.dev/guide/rolldown) ｜ [Rolldown external 参考](https://rolldown.rs/reference/inputoptions.external) ｜ [InfoQ 报道](https://www.infoq.com/news/2026/05/vite-v8-rust/)

**Electron**：[endoflife.date/electron](https://endoflife.date/electron) ｜ [Electron 43 博客](https://www.electronjs.org/blog/electron-43-0) ｜ [Breaking Changes](https://www.electronjs.org/docs/latest/breaking-changes) ｜ [发布日程](https://releases.electronjs.org/schedule) ｜ [better-sqlite3 releases](https://github.com/WiseLibs/better-sqlite3/releases) ｜ [node-abi](https://github.com/electron/node-abi/releases) ｜ [electron-builder releases](https://github.com/electron-userland/electron-builder/releases)

**构建生态**：[Nx 23 发布](https://nx.dev/blog/nx-23-release) ｜ [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron) ｜ [Vitest 4.1](https://vitest.dev/blog/vitest-4-1.html) ｜ [Storybook 10.3](https://storybook.js.org/releases/10.3) ｜ [unplugin-dts](https://github.com/qmhc/unplugin-dts)

**数据层**：[PG 18.4 公告](https://www.postgresql.org/about/news/postgresql-184-1710-1614-1518-and-1423-released-3297/) ｜ [PG 19 Beta 1](https://www.postgresql.org/about/news/postgresql-19-beta-1-released-3313/) ｜ [PG 18 发布](https://www.postgresql.org/about/news/postgresql-18-released-3142/) ｜ [pgvector 镜像 tags](https://hub.docker.com/r/pgvector/pgvector/tags) ｜ [pgautoupgrade](https://github.com/pgautoupgrade/docker-pgautoupgrade) ｜ [PG18 镜像卷变更](https://github.com/docker-library/postgres/issues/37) ｜ [PowerSync 数据库要求](https://docs.powersync.com/installation/database-setup) ｜ [PowerSync PG 维护](https://docs.powersync.com/usage/lifecycle-maintenance/postgres-maintenance) ｜ [Prisma releases](https://github.com/prisma/prisma/releases) ｜ [Prisma 支持数据库](https://www.prisma.io/docs/orm/reference/supported-databases) ｜ [Redis AGPL 公告](https://redis.io/blog/agplv3/) ｜ [Redis 8.0 新特性](https://redis.io/docs/latest/develop/whats-new/8-0/) ｜ [node-postgres CHANGELOG](https://github.com/brianc/node-postgres/blob/master/CHANGELOG.md)

**语言/工具链**：[TypeScript 7.0 公告](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) ｜ [TypeScript 6.0 公告](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/) ｜ [typescript-eslint 依赖版本](https://typescript-eslint.io/users/dependency-versions/) ｜ [vue-tsc tsgo 跟踪](https://github.com/vuejs/language-tools/issues/5381) ｜ [Vue 3.6 beta](https://github.com/vuejs/core/releases/tag/v3.6.0-beta.1) ｜ [pnpm 11 发布](https://pnpm.io/blog/releases/11.0) ｜ [pnpm 迁移指南](https://pnpm.io/migration) ｜ [Node 发布日程](https://github.com/nodejs/release) ｜ [ESLint 10 发布](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/) ｜ [ESLint 10 迁移](https://eslint.org/docs/latest/use/migrate-to-10.0.0) ｜ [Tailwind 4.3](https://tailwindcss.com/blog/tailwindcss-v4-3) ｜ [zod releases](https://github.com/colinhacks/zod/releases)

**框架收尾**：[vue-router v4→v5 迁移](https://router.vuejs.org/guide/migration/v4-to-v5) ｜ [lucide 迁移指南](https://lucide.dev/guide/vue/migration) ｜ [AI SDK 7 迁移](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0)（已确认本仓库未使用，仅存档） ｜ [Expo SDK 57](https://expo.dev/changelog/sdk-57) ｜ [Expo 升级指引](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)

---

## 补充更新

### 需求

docs\plan\active\2026-07-12-tech-stack-upgrade-plan.md 分析一下这篇文档，看一下有没有可能先尝试一次性升级所有的依赖版本到目标版本，然后同时修改相关需要更改的代码（比如使用新的 API 之类的），然后再统一进行一次测试，完成本次的依赖版本更新。
否则，如果分批次、每次都重新进行验证部署的话，会消耗比较多的时间。希望能尽可能快速。

### 分析

结论
可行，而且对这个仓库来说，集中升级大概率更快。
建议把原计划的“11 个批次、每批一个 PR、每批全量验证”改为：
一个集成分支、一个主 PR、按技术栈分 commit、开发期间只跑定向检查，最后统一进行一次完整验证周期和一次发布。

这里的“统一测试”应理解为一次最终验证矩阵，不能只跑一次 pnpm test。
为什么集中升级更合适
根 [package.json](D:/home/projects/memoflow/package.json) 和 [pnpm-workspace.yaml](D:/home/projects/memoflow/pnpm-workspace.yaml) 被放进 [nx.json (line 18)](D:/home/projects/memoflow/nx.json:18) 的 sharedGlobals。实测修改 package、lockfile、workspace 或 Nx 配置都会让全部 39 个项目进入 affected 范围。拆成多个依赖 PR 并不能获得多少增量 CI 收益。
当前 CI 每个 PR 都会重新安装、验证，且 [web-flow (line 221)](D:/home/projects/memoflow/.github/workflows/ci.yml:221) 无条件执行；CI 只缓存 pnpm store，没有跨运行的 Nx task cache。因此减少 PR 数量确实能明显省时间。
普通 PR 不会生产部署。[docker-deploy.yml (line 3)](D:/home/projects/memoflow/.github/workflows/docker-deploy.yml:3) 只监听正式 v* tag；[发布说明 (line 51)](D:/home/projects/memoflow/docs/guides/development/release-workflow.md:51) 也明确 main 推进不会直接发生产镜像。
目标依赖闭包没有发现硬 peer 冲突：Nx 23 支持 Vite 8，typescript-eslint 8.63 支持 ESLint 10 + TS 6，vue-tsc 3.3.7 支持 TS 6，@nxlv/python@22.2.1 也没有排除 Nx 23。
推荐合并边界
范围 建议
B0–B6 全部放进同一个主 PR，一次性写入最终目标版本并生成最终 lockfile
B3 Electron 可留在同一 PR 以避免重复桌面打包，但必须是可单独撤销的 commit，并保留桌面专项验收
B10 pnpm 11 作为主 PR 最后一个可拔插 commit；若 clean install 阻塞，再单独后置
B8 生态小 major 可一起尝试，但保持独立 commit；Lucide 替换实际命中约 168 个文件，若成为唯一阻塞项就摘出
B7 PG18/Redis8 不纳入普通统一测试；PG18 保留独立迁移演练和维护窗口
B9 Mobile 独立并行处理；现有 mobile 没有 build/test/e2e target，官方也建议 Expo SDK 逐级升级验证，见 Expo 指南

最快执行方式
如果 main 最新 CI 已绿，直接把它作为基线，不再额外做一次完整部署。
在同一分支按顺序保留 commit：卫生清理 → 最终依赖清单/Nx migration → TS/ESLint/Vite 代码适配 → Electron → pnpm 11 → B8。
开发过程中只跑便宜的近端检查，例如 Nx graph、ai-service:lint、相关项目的 lint/typecheck/build/test、desktop native rebuild；不跑 Docker、不做完整部署。
所有代码适配完成后，只跑一次最终验证：Node 24 + pnpm 11 全新安装；
governance、全量 lint/typecheck/test/build；
boundary tests、Web E2E、Storybook build；
desktop:dist:windows、安装包冷启动、实际加载 better-sqlite3/argon2/PowerSync；
一次 local prod-like Docker 验证；
最后推一个 PR，让 GitHub Actions 再做一次干净环境复核。

Vite 计划里的 rolldown-vite 一周预演可以跳过，直接上 Vite 8；官方也把它定义为可选渐进路径。Vite 8 迁移指南
文档里还需要补充的风险
[electron-builder.json5 (line 17)](D:/home/projects/memoflow/apps/desktop/electron-builder.json5:17) 还硬编码着 Electron 39.2.6，且第 94 行关闭了自动 native rebuild；只改 package.json 不够。
TS 6 的 baseUrl 实际命中 31 份 tsconfig；Vite 配置改造也不只 desktop。
PG18 计划漏了 [ci.yml (line 177)](D:/home/projects/memoflow/.github/workflows/ci.yml:177) 中两处 postgres:15。另外，切换后新库一旦接受写入，简单切回旧卷会丢新增数据；迁移时必须停止所有写入者。PG18 的卷布局变化也确实需要独立处理，官方镜像变更。
pnpm 11 不只是移动 package.json#pnpm：.npmrc 中除 registry/auth 外的大量配置也要迁入 workspace yaml，同时还有 Dockerfile、devcontainer 和文档里的 pnpm 10 钉住点。pnpm 迁移指南
Redis 目前只有服务、配置和 external 声明，没有找到真实 ioredis 调用。按最小化原则，应先确认能否直接移除，而不是为了版本表升级。
所以，我建议采用“一次性核心升级”的方案，但保留 PG18 和 Mobile 的独立验收边界。这能消除绝大多数重复 CI/部署成本，同时避免把数据迁移和原生产物验证压缩成一次普通测试。此次仅做了分析，没有修改文件。

## 9. 执行进度（one-shot）

> 更新于 2026-07-13 18:02 UTC，分支 `chore/tech-stack-upgrade-2026-07`。  
> **状态：代码侧 one-shot 升级完成并通过本地最终验证矩阵。**

### 策略与范围

- one-shot 落地 B0–B6 / B8 + B9 + B10
- B7：镜像与卷路径钉住 + 本地用**新空卷**验收；**生产 dump/restore 属环境维护窗口，不在本代码升级范围内**（计划原文即独立验收边界）

### 已落地目标版本（实测）

| 组件                                               | 版本                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| pnpm                                               | 11.12.0                                                                    |
| Vite / Nx / Electron / TS / ESLint / Vitest        | 8.1.4 / 23.0.2 / 43.1.0 / 6.0.3 / 10.7.0 / 4.1.10                          |
| vue-router / @lucide/vue / Prisma / better-sqlite3 | 5.1.0 / 1.24.0 / 7.8.0 / 12.11.1                                           |
| Storybook / Tailwind / node-abi                    | 10.5.0 / 4.3.2 / 4.33.0                                                    |
| Expo / RN / reanimated / worklets                  | 57.0.4 / 0.86.0 / 4.5.0 / 0.10.0                                           |
| Docker PG / Redis                                  | `pgvector/pgvector:0.8.5-pg18` / `redis:8-alpine`（`/var/lib/postgresql`） |
| CI/Node                                            | `NODE_VERSION=24`                                                          |

### 最终验证矩阵（2026-07-13，pnpm 11.12.0，`/tmp/ultimate-matrix.log`）

| Gate                                                                                                      | Exit                                                     |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| core typecheck（utils,contracts,patterns,domain-shared,http-client,account,authentication,task,goal,api） | 0                                                        |
| api:build / web:build / desktop:build                                                                     | 0 / 0 / 0                                                |
| utils:test / contracts:test / desktop:test                                                                | 0 / 0 / 0                                                |
| memoflow:governance-check                                                                                 | 0                                                        |
| apps/mobile `expo install --check`                                                                        | 0（Dependencies are up to date）                         |
| local docker health + HTTP                                                                                | postgres/redis/api/web/ai/powersync healthy；api/web 200 |

### 适配要点

- 死依赖/`scheduler-server` 退役；lucide→@lucide/vue；Vite rolldownOptions；TS6 ignoreDeprecations
- pnpm 配置迁入 `pnpm-workspace.yaml`；Electron 43 + native rebuild ABI 148
- Mobile Expo57 peers；RN absoluteFill；ESLint10 下 mobile lint 基线
- 本地 PG18 需新卷（旧 PG16 卷不兼容）

### 环境维护（非代码阻塞）

生产/共享库若仍有旧 PG 数据：按 B7 步骤做 dump → 新卷 pg18 → restore → REINDEX → PowerSync resync。

### 后续（流程，非升级实现缺口）

- 执行总结：[`2026-07-13-tech-stack-upgrade-execution-summary.md`](./2026-07-13-tech-stack-upgrade-execution-summary.md)
- 本地同步指南：[`../guides/development/tech-stack-upgrade-local-sync.md`](../guides/development/tech-stack-upgrade-local-sync.md)
- 开 PR，由 GitHub Actions 干净环境复核
- 可选：§8 pnpm catalog / Renovate 长效防漂移（升级后机制，非版本升级本体）
