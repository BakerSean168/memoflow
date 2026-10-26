# MemoFlow 阿里云单机部署方案

本文档面向当前这台阿里云服务器，按你已经具备的前提来设计：

- 可以直接使用 `ssh ali-memoflow` 登录服务器
- `/opt/memoflow` 已创建
- 服务器已安装 Docker 和 Docker Compose 插件
- 服务器已完成阿里云 ACR 登录
- 服务器当前仍保留 pre-cutover legacy 文件：`.env.production.local`、`docker-compose.prod.yml`、`Caddyfile`；V3 首次切换时只作为 rollback baseline
- 服务器网络环境不稳定，部分 Docker Hub / GHCR 镜像可能无法直接拉取

本文档的目标不是泛泛介绍 Docker 部署，而是给出这套仓库的实际落地方案、执行顺序、验证方法和故障处理策略。

> **Delivery Platform V3 authority:** `deployment/production/` is the canonical production runtime and `Deploy Production(vX.Y.Z)` is the only normal production selection authority. The existing `/opt/memoflow/docker-compose.prod.yml` and the manual SSH commands below describe the **pre-cutover legacy baseline / emergency recovery path** only. After the first accepted V3 rollout they must not be treated as normal deployment truth.

## 1. 结论先行

当前生产环境建议采用下面这套结构：

```text
Internet
  |
  v
Caddy :80/:443
  |
  +--> memoflow.example.com        -> web:80
  |                                   |
  |                                   +--> /      -> 前端静态资源
  |                                   +--> /api/* -> api:3000
  |
  +--> sync.memoflow.example.com   -> powersync:8080
                                          |
                                          +--> postgres:5432

api:3000
  |
  +--> postgres:5432
  +--> redis:6379
  +--> Mastra AI runtime (in-process)

release / promotion
  |
  +--> exact-SHA / digest-pinned images -> explicit migrator-first rollout
```

这套方案下：

- 外网入口只有 `caddy`
- `web` 容器内部已经自带 Nginx，不需要再额外引入 Nginx Proxy Manager
- `web` 的 Nginx 配置以仓库根目录 [`nginx.conf`](D:\home\projects\memoflow\nginx.conf) 为唯一来源
- `powersync` 通过独立子域名走 `caddy -> powersync:8080`
- 数据库和 Redis 只绑定到 `127.0.0.1`，不暴露公网
- 中国 production 的业务镜像从阿里云 ACR 拉取
- PostgreSQL / Redis / Caddy / PowerSync 使用 ACR exact-digest mirror；canonical production 不再由 Watchtower 管理任何服务

### 1.1 Nginx 配置约定

生产环境约定如下：

- [`nginx.conf`](D:\home\projects\memoflow\nginx.conf) 只保留一份，作为 `web` 镜像内 Nginx 的唯一配置来源
- [`Dockerfile.web`](D:\home\projects\memoflow\Dockerfile.web) 在构建时将这份文件复制到 `/etc/nginx/nginx.conf`
- [`docker-compose.prod.yml`](D:\home\projects\memoflow\docker-compose.prod.yml) 不再通过 volume 挂载第二份 `nginx.conf`

这样做的目的：

1. 避免“镜像里一份、服务器再覆盖一份”导致配置来源不清晰。
2. 让本地构建、CI 构建、生产运行三者使用同一份 Nginx 配置。
3. 降低线上临时修复长期遗留的概率。

如果未来需要调整静态资源缓存、`/api/` 反代或 `sw.js` 规则，统一只修改仓库根目录的 [`nginx.conf`](D:\home\projects\memoflow\nginx.conf)，然后重建并发布 `web` 镜像。

## 2. 为什么不部署 Nginx Proxy Manager

当前阶段不建议部署 Nginx Proxy Manager。

原因很直接：

1. 当前只有单机、单套应用、单域名入口，`Caddy` 已足够处理 HTTPS 和反向代理。
2. `web` 镜像内部已经包含 Nginx，静态资源和 `/api/` 转发都已经配置好了。
3. Nginx Proxy Manager 会额外引入一层代理和管理面板，通常还伴随额外数据库，增加运维复杂度。
4. 它不能解决你现在真正的风险点：服务器拉镜像不稳定。

只有在下面这种场景里，才值得考虑后续替换或增加 Nginx Proxy Manager：

- 一台机子要托管很多独立站点
- 需要非开发人员通过 GUI 管理证书和转发规则
- 需要更复杂的多域名、多 upstream 编排

就当前仓库和当前任务来说，继续使用 `Caddy + web(Nginx)` 是更干净的方案。

## 3. 当前线上 legacy baseline 与 canonical V3 runtime

阿里云当前尚未完成 V3 live cutover，因此 `/opt/memoflow/docker-compose.prod.yml` 仍描述正在运行的 legacy baseline；**新的正常运行 authority** 是仓库 [`deployment/production/docker-compose.production.yml`](../../deployment/production/docker-compose.production.yml)。canonical compose 只接受 watcher 生成的 `repository@sha256` refs，并且没有 Watchtower 或 mutable tag fallback。

legacy compose 曾定义以下服务：

| 服务        | 镜像来源                                                   | 作用                       | China production 建议 |
| ----------- | ---------------------------------------------------------- | -------------------------- | --------------------- |
| `postgres`  | `${POSTGRES_IMAGE:-pgvector/pgvector:0.8.5-pg18}`          | 主数据库                   | ACR digest mirror     |
| `redis`     | `${REDIS_IMAGE:-redis:8-alpine}`                           | 缓存 / 队列                | ACR digest mirror     |
| `migrator`  | `${REGISTRY}/${IMAGE_NAMESPACE}/memoflow-migrator`         | 一次性数据库初始化         | ACR immutable image   |
| `api`       | `${REGISTRY}/${IMAGE_NAMESPACE}/memoflow-api`              | 后端 API                   | ACR immutable image   |
| `powersync` | `${POWERSYNC_IMAGE:-journeyapps/powersync-service:1.25.0}` | Desktop / Web 实时同步服务 | ACR digest mirror     |
| `web`       | `${REGISTRY}/${IMAGE_NAMESPACE}/memoflow-web`              | 前端站点                   | ACR immutable image   |
| `caddy`     | `${CADDY_IMAGE:-caddy:2-alpine}`                           | HTTPS 入口                 | ACR digest mirror     |

其中：

- `postgres` 和 `redis` 只绑定宿主机 `127.0.0.1`
- `api`、`web`、`powersync` 都不直接暴露到公网
- `caddy` 暴露 `80/443`
- legacy compose 仍残留 Web 的 Watchtower label，但线上没有运行 Watchtower 容器；canonical V3 compose 已完全移除该 ownership path

### 3.1 代理层职责划分

当前推荐职责边界如下：

- `Caddy`
  - 负责公网 `80/443`
  - 负责 TLS 证书申请与续期
  - 负责把主站域名转发给 `web`
  - 负责把同步子域名转发给 `powersync`
- `web` 容器内 Nginx
  - 负责前端静态资源
  - 负责 SPA 路由回退到 `index.html`
  - 负责把 `/api/*` 转发到 Docker 网络内的 `api:3000`
- `powersync`
  - 负责订阅 Postgres 逻辑复制
  - 负责把 Postgres 变化下发给 desktop / web 客户端
- `api`
  - 只处理业务逻辑、鉴权、参数校验、CORS 白名单
  - 负责签发 PowerSync token，并返回公网同步 endpoint

这意味着浏览器主链路应始终走同源访问：

```text
https://memoflow.bakersean.top
  ├─ /            -> web 静态资源
  └─ /api/*       -> web(Nginx) -> api
```

Desktop / Web 同步链路应为：

```text
desktop / web client
  ├─ GET https://memoflow.bakersean.top/api/v1/powersync/token
  └─ connect https://sync.memoflow.bakersean.top
```

补充一点：生产编排里的 `powersync` 连接 Postgres 时，不再使用手拼 `uri`。
这里改成了 `hostname / port / database / username / password` 的字段式配置，直接复用 `DB_*` 变量，避免密码里包含 `/`、`=`、`@`、`:` 时把 DSN 解析坏。

不推荐把前端改成直接跨域访问单独 API 域名作为主方案。  
`API` 侧保留 CORS 白名单是安全兜底，不是主访问路径。

## 4. 镜像策略

### 4.1 Artifact identity 与区域分发

MemoFlow production 不再把 `prod-latest` 或某个 registry URL 当作发布真值。发布真值是：

```text
exact release SHA -> one build -> OCI digest
                              |-> GHCR (Global)
                              `-> Alibaba ACR (China)
```

- `ghcr.io/<owner>/memoflow-*` 面向 GCP、Oracle、CI 与其他海外 runtime；
- 阿里云杭州 ACR 面向中国 production；
- API / Migrator / Web 每个 release 只 build 一次；同一 build 同时写两个 registry；
- release lane 必须验证 ACR/GHCR immutable tag 的 digest 与 build output 完全一致；
- `prod-latest` 只能作为可选 mutable alias，不能用于 rollback / provenance / deployment truth。

当前中国 production 应优先使用 ACR immutable tag 或 `repository@sha256:<digest>`，避免跨境拉 GHCR/Docker Hub。

### 4.2 Runtime dependency mirror

PostgreSQL、Redis、Caddy、PowerSync 不再依赖生产服务器临时访问 Docker Hub。其 release-owned mirror identity 来自目标 Release SHA 的：

```text
tools/ci-cd-platform/runtime-image-mirrors.json
```

管理，并且每一项都必须使用 `@sha256:` pin 到 `linux/amd64` platform manifest。该配置或 mirror workflow 变更合并到 `main` 时会自动运行 `Mirror Runtime Images`；`workflow_dispatch` 只用于显式重试。workflow 通过 `skopeo --preserve-digests` 同步到 ACR 与 GHCR并验证三方 digest 一致。这里故意不复制上游 multi-arch/attestation index，因为阿里 ACR 对部分 OCI attestation manifest 不兼容。

生产 compose 暴露以下完整 image-ref override：

```env
API_IMAGE=<ACR>/memoflow-api@sha256:<digest>
MIGRATOR_IMAGE=<ACR>/memoflow-migrator@sha256:<digest>
WEB_IMAGE=<ACR>/memoflow-web@sha256:<digest>

POSTGRES_IMAGE=<ACR>/memoflow-postgres@sha256:<digest>
REDIS_IMAGE=<ACR>/memoflow-redis@sha256:<digest>
CADDY_IMAGE=<ACR>/memoflow-caddy@sha256:<digest>
POWERSYNC_IMAGE=<ACR>/memoflow-powersync@sha256:<digest>
```

这些 exact refs 由 production watcher 写入 canonical runtime 的 `runtime-images.env`，不是长期手工维护的 host deployment truth。`deployment/production/docker-compose.production.yml` 缺少任一 required image ref 都会 fail closed。

### 4.3 当前生产基线

当前 clean rebuild 基线为：

- PostgreSQL 18 + pgvector 0.8.5；
- Redis 8；
- API / Web / Migrator 使用 exact-SHA immutable image；
- PowerSync 使用 ACR，并应使用 immutable tag 而不是 `latest`；
- Caddy/基础 runtime 通过 ACR mirror 固定；
- canonical production 不运行 Watchtower；所有应用组件由一个 coherent `production-selected` control artifact 与 host watcher 共同拥有。

2026-09-06 的首个 canonical production acceptance 已完成：`v0.13.3 -> 4e24cffd...` 在 `controlPlaneSha=64521cf...` 下被 selector `34005198389` 选择为 production-set `sha256:2ea3a112...ae0ae` / control artifact `sha256:4d9b493f...175fa`。Alibaba `production-deploy-state` 已原子提交 `status=DEPLOYED`，API/Web/PowerSync/PostgreSQL/Redis/Caddy 均运行 exact digest；replay 返回 `already deployed` 且不重复 Migrator/backup。独立 GCP 公网验收在一次保留的瞬态 Web timeout 后连续 3 轮 API/Web/PowerSync 共 9/9 HTTP 200；production watcher timer 已 enabled/active。

当前 production 已正常推进到 `v0.14.1 -> e2f793d7a1acb1efecbf007e7d7450e5065c25e3`。Selector `34035753020` 生成 production-set `sha256:8a220292dad54e0ddb1fb93254627e110ccedaf479fb612064393887dbbdf629` / control artifact `sha256:fdf929d6c862db304a081653e6319e263e229b4fae7ca0e3b61e88be212ece7c`；Alibaba watcher 自动消费 `production-selected`，创建一份非空 PostgreSQL backup，完成 Migrator → API → PowerSync → Web → Caddy，并于 `2026-09-06T13:23:24Z` 原子提交 `DEPLOYED`。Timer replay 返回 `already deployed`，v0.14.1 backup 数量保持 1；独立 GCP 公网验收在一次保留的瞬态 Web timeout 后再次连续 3 轮 API/Web/PowerSync 9/9 HTTP 200。

更新 runtime dependency 时，应把它当作独立 dependency-upgrade 变更：先修改 digest pin、在非生产环境验证，再合并到 `main` 触发 mirror workflow；需要重试时再手工 dispatch。不要把“镜像分发优化”和“依赖升级”混成一次操作。

## 5. Legacy manual preflight（仅首次切换前 / emergency）

生产发布只接受已经通过 CI / review 的 exact release artifact。服务器只做 promotion，不做源码构建。

### 5.1 目录与配置

```bash
ssh ali-memoflow "ls -lah /opt/memoflow"
```

至少应存在：

- `docker-compose.prod.yml`
- `Caddyfile`
- `.env.production.local`

`.env.production.local` 必须保持 `600`，并显式配置中国 production 使用的 ACR image refs。不要把 private key、webhook secret、数据库密码写入 Git。

### 5.2 Compose preflight

任何 rollout 前先渲染最终配置：

```bash
ssh ali-memoflow \
  "cd /opt/memoflow && docker compose -f docker-compose.prod.yml --env-file .env.production.local config >/tmp/memoflow-prod.rendered.yml"
```

然后检查 image 列表：

```bash
ssh ali-memoflow \
  "cd /opt/memoflow && docker compose -f docker-compose.prod.yml --env-file .env.production.local config --images"
```

China production 的 runtime dependency 应为 ACR immutable tag 或 `@sha256:` ref。API / Migrator / Web 必须使用同一 release 的 exact-SHA/immutable identity。

### 5.3 Registry 可拉取性

在停任何业务服务之前，对即将部署的全部 refs 先执行 `docker pull`。如果 ACR ref 不存在或认证失败，发布在此处停止；不要退回 Docker Hub/GHCR 临时跨境拉取，也不要在生产机重新构建镜像。

## 6. Legacy manual promotion（仅 emergency；正常路径见 Delivery V3 watcher）

### 6.1 先备份配置

每次 production promotion 至少保留本次变更前的：

- `.env.production.local`
- `docker-compose.prod.yml`
- 当前 application image refs
- 当前 runtime dependency refs

备份目录应为 `700`，包含 secret 的文件保持 `600`。这里是**配置回滚点**，不是业务数据库长期备份策略。

### 6.2 Migrator-first

数据库 schema 变更必须先运行与目标 API 同一 release 的 Migrator：

```bash
ssh ali-memoflow \
  "cd /opt/memoflow && docker compose -f docker-compose.prod.yml --env-file .env.production.local up --no-deps migrator"
```

只有 migrator `Exited (0)` 才能继续 API rollout。失败时保持当前 API/Web 不变，先修复 migration；禁止用 `--accept-data-loss` 或 reset 让生产强行变绿。

### 6.3 显式更新服务

业务 release 通常按下面顺序：

```text
migrator -> api -> powersync -> web -> caddy(if config/image changed)
```

PostgreSQL / Redis / Caddy / PowerSync 的 runtime image digest 只有在独立 dependency-upgrade 已验证时才更新。不要因为“同步 registry”顺手升级依赖。

API 示例：

```bash
ssh ali-memoflow \
  "cd /opt/memoflow && docker compose -f docker-compose.prod.yml --env-file .env.production.local up -d --no-deps --force-recreate api"
```

每重建一个服务都先等它 healthy，再进入下一个服务。

### 6.4 Watchtower 边界

Watchtower 已从 canonical V3 runtime 中删除。legacy compose 中残留的 Web label 只属于 pre-cutover evidence，不得重新启用为 production promotion authority。

## 7. Legacy acceptance commands（V3 acceptance 以 watcher state/runbook 为准）

### 7.1 容器与 revision

```bash
ssh ali-memoflow \
  "cd /opt/memoflow && docker compose -f docker-compose.prod.yml --env-file .env.production.local ps"
```

必须确认：

- `postgres` healthy
- `redis` healthy
- `api` healthy
- `powersync` healthy
- `web` healthy
- `caddy` running
- API/Web 的 OCI `org.opencontainers.image.revision` 等于目标 release SHA
- runtime dependencies 的 `.Config.Image` 与 compose 中 ACR digest refs 一致

### 7.2 公网健康检查

```bash
curl -fsS https://memoflowapi.bakersean.top/healthz
curl -fsS https://memoflowsync.bakersean.top/probes/liveness
curl -fsS -o /dev/null -w '%{http_code}\n' https://memoflow.bakersean.top/
```

GitHub Installation Gateway 还要做 fail-closed probe：无效 `mfi1.prod.*` state 应进入 gateway 并返回 4xx，而不是路由不存在的 404，也不得跨环境 redirect 或创建 intent。

### 7.3 业务 smoke

完成登录后至少验证：

1. Web 能创建/读取一个最小业务对象；
2. PowerSync token / liveness 正常；
3. GitHub App installation 已存在时，Repository connection 能列出被授权的 private fixture repo；
4. webhook signature verification 没有持续错误；
5. 日志中不出现 secret、循环重试或 migration warning。

## 8. Environment contract

关键公开配置示例：

```env
# Image identity is not hand-maintained here under Delivery V3.
# Deploy Production + the host watcher generate exact application/runtime refs
# into /opt/memoflow/runtime/runtime-images.env from memoflow.production-set/v1.

AUTH_BASE_URL=https://memoflowapi.bakersean.top/api/auth
MEMOFLOW_WEB_URL=https://memoflow.bakersean.top
POWERSYNC_URL=https://memoflowsync.bakersean.top
GITHUB_INSTALLATION_ROUTE_KEY=prod
GITHUB_INSTALLATION_ROUTE_TARGETS=
```

GitHub App private key、webhook secret、JWT/DB/Redis/PowerSync private keys 只存在于 production secret env，不进入文档示例值或 Git。

### 8.1 GitHub 登录 OAuth 激活（与知识仓库 GitHub App 分离）

生产 GitHub 登录是可选的 identity provider，不由 `GITHUB_APP_ID` 或知识库安装流程自动启用。只有当 API 的 `GITHUB_OAUTH_CLIENT_ID` 与 `GITHUB_OAUTH_CLIENT_SECRET` 都非空时，`GET /api/auth/capabilities` 才会返回 `{"providers":{"github":true}}`，Web 才会显示 GitHub 登录按钮。

在 [GitHub Developer settings](https://github.com/settings/developers) 中为 **MemoFlow Production Login** 创建独立的 OAuth App（不要复用 Staging 测试凭据，也不要把 knowledge-repository installation 凭据当成登录凭据）：

- Homepage URL：`https://memoflow.bakersean.top`
- Authorization callback URL：`https://memoflow.bakersean.top/api/auth/callback/github`

注意生产的 `AUTH_BASE_URL` 是独立的 `https://memoflowapi.bakersean.top/api/auth`，但浏览器在 `memoflow.bakersean.top` 的同源 `/api/` 代理上发起登录。为了保持 OAuth state / session Cookie 与 Web 登录页面同源，**务必显式指定 GitHub provider 的回调 override**，而不是让 provider 默认使用独立 API 子域名：

```env
# Operator-managed, chmod 0600: /opt/memoflow/.env.production.local
GITHUB_OAUTH_CLIENT_ID=<production OAuth App client ID>
GITHUB_OAUTH_CLIENT_SECRET=<production OAuth App client secret>
GITHUB_OAUTH_REDIRECT_URI=https://memoflow.bakersean.top/api/auth/callback/github
```

这三个值仅保存在生产宿主机的 secret env 中；新部署的 `deployment/production/docker-compose.production.yml` 会将 redirect override 显式传给 API。**不要通过更改 `AUTH_BASE_URL` 或伪造 `providers.github=true` 规避配置门禁。**

生产 watcher 的健康运行时 fast path 在 image digest / selection 未变化时可能不重建 API 容器：修改 secret env 文件后不能仅依赖下一次 timer tick 生效。需要通过正式 Published Release → Deploy Production → production watcher 的受控新版本部署让 API 获取新环境变量；不得随意在生产执行 `docker compose up`、`--force` 或破坏性迁移来强制刷新凭据。

验收流程：先确认生产 API 重新启动并装载 OAuth Client ID/Secret（日志中不输出值）；检查公网 Web 和 API 的 `/api/auth/capabilities` 均为 `github:true`；发起一次真实 GitHub 登录，核对 GitHub authorize URL 的 `redirect_uri` 为上述 **Web 同源地址**；完成授权后验证弹窗关闭、主站 Session 生效、重新登录与退出登录正常。若回调失败或 Cookie/State 不一致，暂停启用并检查同源代理链路；不要降级 CSRF/SameSite 安全策略。

## 9. Rollback

canonical V3 rollback 依赖 watcher 保存的上一版 exact runtime、`production-deploy-state` 与本次强制 PostgreSQL backup，不依赖 `prod-latest`。

1. **Migrator 启动前失败**：watcher 可以自动恢复上一版 runtime。
2. **Migrator 已启动后的任何不确定失败**：写入 `BLOCKED`，保留 `backup_dir`，禁止盲目回滚应用镜像。
3. 只有明确证明 schema/data 向后兼容后，才允许 operator 选择上一版 Published Release 或恢复 previous runtime。
4. 首次 V3 cutover 前，legacy `/opt/memoflow/docker-compose.prod.yml` 可作为额外 rollback baseline；cutover 后不再是 normal authority。

不要移动旧 tag 指向新 digest，不要删除 PowerSync/业务 migration history，也不要通过重新 build 同一个 tag 模拟 rollback。

## 10. 常见失败

### 10.1 ACR pull/push 失败

先检查 ACR 登录状态、repository/tag 是否真实存在、目标 digest 是否可拉取。若 registry 返回 OCI manifest compatibility 错误，检查是否误推了包含 attestation 的 multi-arch index；MemoFlow runtime mirror 使用明确的 `linux/amd64` platform manifest digest，避免把未知 attestation manifest 推入 ACR。

### 10.2 Migrator 非 0

停止 rollout，保留当前 API/Web。检查 migrator 日志、schema/data invariant 和目标 release SHA；禁止 reset production DB 或接受未审查的数据损失。

### 10.3 API 重建时短暂 502

`web` 通过 Docker DNS 访问 `api:3000`。API recreate 到 healthy 之前可能短暂 502；API healthy 后应自动恢复。若持续 502，再检查 Nginx Docker DNS、API health 和 container network。

### 10.4 Caddy 证书/入口失败

检查 DNS、安全组 80/443、Caddy 日志和目标域名；不要通过额外引入第二个 reverse proxy 临时掩盖问题。

## 11. Release 与 production 的边界

Release Lifecycle V2 负责：

```text
exact main CI
  -> build once
  -> OCI digest
  -> ACR (China) + GHCR (Global)
  -> digest parity
  -> canonical release evidence
```

Production promotion 负责选择已验证的 ACR artifact、migrator-first rollout、health/behavior acceptance 与 rollback evidence。二者不能合并成“push 一个 mutable tag 然后让生产自动漂移”。

第三方 runtime dependency 通过 `Mirror Runtime Images` workflow 单独治理；更新 pin 是 dependency upgrade，不属于普通 application release。

## 12. 当前生产基线

2026-08-29 clean rebuild 后的生产形态：

- workdir：`/opt/memoflow`
- Compose project：`memoflow`
- PostgreSQL 18 + pgvector 0.8.5
- Redis 8
- PowerSync **1.20.4**（2026-09-05 live audit；V3 目标 Release 可按 reviewed release-owned mirror forward-upgrade，禁止 downgrade）
- API/Web：exact-SHA application artifact，当前 live revision `670aaea48a0644d3bdef792a18367d79b43d02a9`
- PostgreSQL / Redis / Caddy / PowerSync：China ACR digest refs
- GitHub Production App：独立 credentials，`GITHUB_INSTALLATION_ROUTE_KEY=prod`，route targets 为空
- Watchtower：线上当前没有运行容器；legacy Web compose label 仍为 true，但 canonical V3 已删除该 authority

实时 image refs / digests 以 `my-infrastructure/projects/memoflow.yaml` 为基础设施 SSOT；运行时仍应在发布前后使用 `docker compose config --images` 与 `docker inspect` 实测确认。
