---
tags:
  - guide
  - development
  - dependencies
  - upgrade
  - local
description: 拉取 2026-07 技术栈升级分支后，本机/其他 worktree 同步 Node、pnpm、依赖、原生模块与 Docker 数据卷的操作指南
created: 2026-07-14T00:00:00+00:00
updated: 2026-07-14T00:00:00+00:00
---

# 技术栈升级后的本地同步指南（2026-07）

远程开发机已经完成 one-shot 升级。你的**本机仓库、其他 worktree、旧容器卷**不会自动变成新环境，需要按本指南同步。

对应总结：[`../../plan/archive/2026-07-13-tech-stack-upgrade-execution-summary.md`](../../plan/archive/2026-07-13-tech-stack-upgrade-execution-summary.md)

## 1. 你需要同步什么？

| 项目                      | 为什么                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------- |
| 分支 / 代码               | 依赖声明、配置、源码适配都在新分支                                                  |
| Node / pnpm               | 运行时统一 Node 24（engines ≥22.13）；**pnpm ≥11**（`packageManager=pnpm@11.12.0`） |
| `node_modules` + lockfile | major 跨度大，旧安装树不可复用                                                      |
| Prisma Client             | postinstall 重新生成                                                                |
| Electron 原生模块         | Electron 43 / ABI 148，需 rebuild better-sqlite3 等                                 |
| Docker 卷                 | PG18 卷路径与 PG16 数据**不兼容**；旧 volume 直接起会失败                           |
| IDE / 全局工具            | 若本机仍钉 pnpm 10 / Node 22，命令会装错或拒绝执行                                  |

## 2. 前置条件

- Git 可访问该仓库与分支 `chore/tech-stack-upgrade-2026-07`（或已合并的目标分支）
- 推荐 **Node 24 LTS**（最低 `>=22.13.0`；Mastra 1.60.0 要求 Node ≥22.13）
- 启用 Corepack（或等价方式拿到 **pnpm 11.12.0**）
- 若做本地 Docker：Docker Engine + Compose，且存在 `.env.production.local`（见 [`local.docker.md`](./local.docker.md)）

检查：

```bash
node -v          # 建议 v24.x
corepack enable
corepack prepare pnpm@11.12.0 --activate
pnpm -v          # 应为 11.12.0
```

> 仓库 `preinstall` 使用 `only-allow pnpm`，不要用 npm/yarn 装依赖。

## 3. 推荐同步流程（干净重装）

在仓库根目录执行：

```bash
# 1) 拉取升级分支
git fetch origin
git checkout chore/tech-stack-upgrade-2026-07
# 若已合并到你的工作分支，则 checkout 该分支即可
git pull

# 2) 清掉旧依赖树（强烈建议）
# 保留全局 pnpm store；只删工作区 node_modules
pnpm -r exec rm -rf node_modules
rm -rf node_modules
rm -rf .nx/cache

# 3) 按 lockfile 安装（会触发 prisma generate 等 allowBuilds）
pnpm install

# 4) 确认工具链
node -e "console.log(require('./package.json').packageManager)"
pnpm -v
pnpm nx --version
```

可选：若怀疑 store 损坏：

```bash
pnpm store prune
pnpm install --force
```

## 4. 桌面端额外步骤（Windows / Electron）

Electron 43 需要重新编译原生模块：

```bash
pnpm nx run desktop:native-rebuild
# 等价于 electron-rebuild better-sqlite3 等
```

然后冒烟：

```bash
pnpm nx run desktop:typecheck
pnpm nx run desktop:test
pnpm nx run desktop:build
# 开发启动（按你本机习惯）
pnpm nx run desktop:serve-safe
```

常见问题：

- **rebuild 失败**：确认本机有对应 C++ 构建工具（Windows: VS Build Tools；macOS: Xcode CLT；Linux: build-essential/python）
- **ABI 不匹配**：确认安装的是分支内 `electron@43.1.0` 与 `@electron/rebuild@4.2.0`，不要混用全局旧 Electron

## 5. Web / API 日常开发

```bash
# 常用类型检查 / 构建
pnpm nx run api:typecheck
pnpm nx run web:typecheck
pnpm nx run api:build
pnpm nx run web:build

# 本地联调（非 Docker）
pnpm nx run-many -t serve --projects=api,web --parallel=2
```

## 6. Mobile（Expo 57）

```bash
cd apps/mobile
pnpm exec expo install --check
# 应输出 Dependencies are up to date
cd ../..
pnpm nx run mobile:typecheck
pnpm nx run mobile:lint
```

说明：仓库目前没有完整 mobile build/test/e2e Nx target；以依赖对齐 + typecheck/lint 为主。

## 7. Docker / 数据卷（重要）

### 7.1 为什么旧卷会挂

PG18 官方镜像使用 `/var/lib/postgresql` 布局。旧 PG16 数据目录**不能**直接挂到新镜像。  
若看到类似 “there appears to be PostgreSQL data in /var/lib/postgresql” / container unhealthy，就是旧卷冲突。

### 7.2 本地开发（可丢数据）推荐做法

```bash
# 停掉本地栈
pnpm docker:local:down
# 或
docker compose -f docker-compose.local.yml --env-file .env.production.local down

# 删除本地 PG 卷（名字以 compose 项目为准，常见如下）
docker volume ls | rg postgres
docker volume rm memoflow_postgres-local-data
# 若还有旧名：docker_postgres-dev-data 等，确认无用后删除

# 重新构建并启动（会装 PG18 + Redis8）
pnpm docker:local:up
# 或
docker compose -f docker-compose.local.yml --env-file .env.production.local up -d --build
```

验证：

```bash
docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
# 期望：postgres 镜像含 0.8.5-pg18，redis:8-alpine，api/web 等 healthy

curl -s -o /dev/null -w 'api:%{http_code}\n' http://localhost:20201/info
curl -s -o /dev/null -w 'web:%{http_code}\n' http://localhost:20200/
```

默认端口见 [`local.docker.md`](./local.docker.md)。

### 7.3 有需要保留的本地/共享数据

不要删卷。按计划 B7 维护窗口：

1. 停止写入方（api / powersync）
2. `pg_dumpall` 到宿主安全路径
3. 新卷 + PG18 镜像（挂载 `/var/lib/postgresql`）
4. 导入 dump → 应用连接验证 → 建议 `REINDEX`
5. 启动 PowerSync（slot 会重建并全量 re-replicate）
6. 旧卷至少保留 7 天

## 8. 最小验收清单（本机同步完成后）

在仓库根目录：

```bash
pnpm -v   # 11.12.0
pnpm nx run-many -t typecheck --projects=utils,contracts,api,web --parallel=4
pnpm nx run api:build
pnpm nx run web:build
pnpm nx run memoflow:governance-check
```

若做桌面：

```bash
pnpm nx run desktop:native-rebuild
pnpm nx run desktop:typecheck
pnpm nx run desktop:test
```

若做容器：

```bash
pnpm docker:local:ps
# postgres / redis / api / web / powersync healthy
```

## 9. 故障排查速查

| 现象                                        | 处理                                                       |
| ------------------------------------------- | ---------------------------------------------------------- |
| `Only pnpm is allowed` / 被 preinstall 拒绝 | 使用 pnpm 11，不要 npm i                                   |
| `packageManager` 与本机 pnpm 不一致         | `corepack prepare pnpm@11.12.0 --activate`                 |
| install 后 Electron 原生模块加载失败        | `pnpm nx run desktop:native-rebuild`                       |
| Prisma Client 找不到 / 旧生成物             | `pnpm install` 或在 `packages/database` 跑 prisma generate |
| postgres 容器 Restarting / unhealthy        | 删旧 PG 卷后重建；确认 compose 挂载 `/var/lib/postgresql`  |
| `pnpm install` 中断后 allowBuilds 异常      | 清 `node_modules` 后完整重装，避免半截 install             |
| Nx 缓存怪错                                 | `rm -rf .nx/cache` 后重跑目标                              |
| ESLint / TS 版本看起来仍旧                  | 确认当前目录已 checkout 升级分支且 `node_modules` 已重装   |

## 10. 不需要你做的事

- **不必**在本机重放整个升级改代码过程；拉分支 + 重装即可
- **不必**为了开发环境执行生产级 dump/restore（除非你要保留旧 PG 数据）
- **不必**升级到 TypeScript 7 / Electron 更新 major / pnpm 更新到计划观望区版本

## 11. 相关入口

- 执行总结：[`../../plan/archive/2026-07-13-tech-stack-upgrade-execution-summary.md`](../../plan/archive/2026-07-13-tech-stack-upgrade-execution-summary.md)
- 升级计划：[`../../plan/archive/2026-07-12-tech-stack-upgrade-plan.md`](../../plan/archive/2026-07-12-tech-stack-upgrade-plan.md)
- 本地 Docker：[`local.docker.md`](./local.docker.md)
- 发布链路：[`release-workflow.md`](./release-workflow.md)
