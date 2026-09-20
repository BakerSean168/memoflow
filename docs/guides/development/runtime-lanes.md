---
tags:
  - guide
  - development
  - runtime
  - docker
  - e2e
description: Named runtime lanes, host port contract, and mutual exclusion rules
created: 2026-07-14T00:00:00
updated: 2026-07-14T00:00:00
---

# Runtime lanes（本机运行时车道）

本仓库同时支持多套本机拓扑。**端口混乱几乎都来自“以为在跑 A 车道，实际占用了 B 车道的端口”。**

单一真相源（SSOT）：

- [`tools/runtime/profiles.json`](../../../tools/runtime/profiles.json)

相关工具：

- `pnpm runtime:preflight` / `pnpm runtime:preflight:e2e` / `:host-dev` / `:local-docker`
- `pnpm docker:local:*`（强制使用 local-docker 隔离 host 端口）
- 完整的本机开发、单服务替换和命令入口见
  [`local-development.md`](./local-development.md)。

## 车道一览

| Profile        | 用途                | 主机端口（SSOT）                                 | 入口命令                           |
| -------------- | ------------------- | ------------------------------------------------ | ---------------------------------- |
| `host-dev`     | API+Web 热更新      | API `3000`，Web `5173`，PG `5432`                | Docker dev infra + Nx `run-many`   |
| `e2e`          | Playwright 核心 e2e | API `3000`，Web `5173`，PG **`5433`**            | `pnpm docker:test:up` + `pnpm e2e` |
| `local-docker` | 近生产全栈容器      | API **`20201`**，Web **`20200`**，PG **`20210`** | `pnpm docker:local:up`             |
| `dev-infra`    | 仅开发依赖          | PG `5432`，Redis `6384`，PowerSync `8080`        | `pnpm docker:dev:up`               |
| `test-infra`   | 仅测试库            | PG `5433`                                        | `pnpm docker:test:up`              |

## 互斥规则

- **`local-docker` 不得占用** `3000` / `5173` / `5432` / `5433` 等 host-dev/e2e 保留口。
- **`e2e` 的 API 必须是** 工作区 `apps/api/dist` 且 `RUNTIME_LANE=e2e`；不能静默复用 Docker API。
- Docker Desktop “服务都绿了” **不等于** Playwright 车道就绪。
- 需要同时看容器全栈 + 本机热更时：local-docker 用 `53xxx/58xxx`，host-dev 继续 `3000/5173`。

## 命令速查

```bash
# 看清所有车道与端口
pnpm runtime:preflight

# 跑 e2e 前
pnpm docker:test:up
pnpm runtime:preflight:e2e
pnpm e2e

# 本机开发
pnpm docker:dev:up
pnpm runtime:preflight:host-dev
pnpm nx run-many -t serve --projects=api,web --parallel=2

# 近生产容器验证（host 端口由工具强制隔离）
pnpm runtime:preflight:local-docker
pnpm docker:local:up
# Web http://localhost:20200  API http://localhost:20201
```

## GCP Dev 持久开发会话约定

GCP Dev 的日常开发统一放在一个持久 `tmux` 会话中，避免 SSH/Agent 会话结束时把热更新进程一起终止：

- session：`MemoFlow`
- window：`dev`
- cwd：`/home/dev/projects/memoflow`
- window 内运行：

```bash
pnpm docker:dev:up && pnpm nx run-many -t serve --projects=api,web --parallel=2
```

这个 window 拥有整个 `host-dev` lane：Docker 只承载 PostgreSQL / Redis / PowerSync，API 与 Web 直接在宿主机运行并保持热更新。`local-docker` 仍只用于近生产验收，不作为日常 Dev Web/API runtime。

## Playwright 复用策略

- **API 与 Web**：默认均 **不** `reuseExistingServer`，避免复用错误 lane 的 Docker API 或无 E2E env/proxy 的陈旧 Vite。
- 仅当你明确知道当前 `:3000` 是 e2e API（`/healthz` 含 `"lane":"e2e"`），且 `:5173` 是使用当前 E2E env/proxy 启动的 Vite 时，可设 `E2E_REUSE_SERVERS=1`。
- CI 永不复用 API 或 Web server。
- `start-api-server` 若发现端口被非 e2e 占用，会 **直接失败并打印修复提示**。

## local-docker 与 `.env.production.local`

- 密钥与镜像 tag 仍可放在 `.env.production.local`。
- **Host 端口以 SSOT 为准**：`pnpm docker:local:up` 会覆盖与 host-dev/e2e 冲突的 `*_HOST_PORT`（例如把 `API_HOST_PORT=3000` 强制回 `20201`）。
- 推荐把本机 env 中的 host 端口改成与 SSOT 一致，避免下次手工 `docker compose ...` 时再次踩坑。

### 可选的机器级端口覆盖

需要避开本机其他项目时，可在 gitignored `.env.local` 中显式启用机器级覆盖：

```dotenv
LOCAL_DOCKER_MACHINE_PORTS=true
LOCAL_DOCKER_SHARE_DEV_SECRETS=true
API_HOST_PORT=12136
WEB_HOST_PORT=12137
POWERSYNC_HOST_PORT=12139
POSTGRES_HOST_PORT=12140
REDIS_HOST_PORT=12141
```

`pnpm docker:local:*` 会校验覆盖端口有效、互不重复且不占用其他 runtime lane
的保留端口。未设置 `LOCAL_DOCKER_MACHINE_PORTS=true` 时仍严格使用共享 SSOT，
因此个人端口不会影响其他开发者。

需要在 Docker 服务与宿主 dev 服务之间逐个切换时，可同时设置
`LOCAL_DOCKER_SHARE_DEV_SECRETS=true`。本地 Docker 的 API 将采用 `.env.development` 中的 JWT 开发密钥，使宿主 API 与剩余 Docker 服务保持相同的本地认证边界。该开关只适用于本机开发，不能用于生产部署。

## 排障

| 现象                                 | 原因                        | 处理                                                                       |
| ------------------------------------ | --------------------------- | -------------------------------------------------------------------------- |
| e2e 报 3000 被占用 / lane missing    | Docker 或 host-dev 占着 API | `pnpm docker:local:down` 或释放 3000；确认 local API 在 20201              |
| 修了代码 e2e 仍旧行为 / 页面一直加载 | API 或 Web 旧进程被复用     | 默认已禁止两端复用；确认没有 `E2E_REUSE_SERVERS=1`，并释放 `3000` / `5173` |
| 文档写 20201，浏览器却 3000          | env 把 host 端口改回经典口  | 使用 `pnpm docker:local:*`，或修正 env                                     |
| e2e DB 连不上                        | 5433 未起                   | `pnpm docker:test:up`                                                      |

## 维护约定

- 新增本机端口时，先改 `tools/runtime/profiles.json`，再改 compose / Playwright / 文档。
- 不要在多个文件各自发明“默认 3000/8080”作为 local-docker 对外端口。
- 相关实现：`tools/runtime/*`、`tools/docker/local-compose.mjs`、`apps/web/playwright.server.ts`、`apps/web/e2e/helpers/start-api-server.ts`。
