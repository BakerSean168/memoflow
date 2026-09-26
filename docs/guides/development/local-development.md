---
tags:
  - guide
  - development
  - desktop
  - docker
  - nx
  - runtime
description: MemoFlow 本机开发模式、Docker 与宿主服务替换、Desktop 启动和统一命令规范
created: 2026-07-29T00:00:00
updated: 2026-07-29T00:00:00
---

# 本机开发模式与统一命令规范

## 1. 本文解决什么问题

MemoFlow 同时包含 Web、Desktop、API（内含 Mastra AI runtime）、PowerSync、PostgreSQL 和
Redis。开发者可能需要：

- 运行完整 Docker 栈做近生产验证。
- 只修改 Desktop，并复用 Docker 后端。
- 只修改 Web 或 API，并把对应 Docker 容器临时替换为宿主热更新进程。
- 第一次启动 Desktop，确保 `better-sqlite3` 等 Electron 原生模块 ABI 正确。
- 环境已经准备好后，快速进入 Desktop 热更新内环。

过去文档和命令中同时出现过：

```text
pnpm nx serve desktop
pnpm nx dev desktop
pnpm nx run desktop:serve
pnpm nx run desktop:serve:full
```

这些命令外观接近，但实际可能命中 Nx 简写、Vite 推断 target 或项目显式
target，前置任务并不相同。本文建立唯一的日常使用心智。

## 2. 唯一命令心智

### 2.1 单项目：直接运行 Nx target

| 目的             | 规范命令                                        |
| ---------------- | ----------------------------------------------- |
| 只启动 API       | `pnpm nx run api:serve`                         |
| 只启动 Web       | `pnpm nx run web:serve`                         |
| 安全启动 Desktop | `pnpm nx run desktop:serve-safe`                |
| 快速启动 Desktop | `pnpm nx run desktop:serve`                     |
| Web staging 模式 | `pnpm nx run web:serve --configuration=staging` |

开发启动不再经过根 `package.json` 的 `dev` / `dev:*` scripts 包装层。所有
单项目命令统一使用 Nx 原生显式格式：

```text
pnpm nx run <project>:<target>
```

这使终端命令、Nx task graph、CI 日志和文档使用同一个名称，不需要同时记住
“根脚本名”和“底层 target 名”两套映射。

### 2.2 多项目：使用 Nx `run-many`

同时启动宿主 API + Web：

```bash
pnpm nx run-many -t serve --projects=api,web --parallel=2
```

不提供 `dev:all` 或其他根级组合脚本。Web 与 Desktop 共享前端端口，；组合哪些项目应直接体现在
`--projects` 参数中。

### 2.3 不支持的开发命令形式

以下形式不再推荐：

```bash
# Nx 的 target/project 位置简写，阅读时容易反转
pnpm nx serve desktop

# 可能命中插件自动推断的 vite:dev，而非项目显式 serve target
pnpm nx dev desktop

# 项目文档不使用裸 nx 或 npx nx
nx run desktop:serve
npx nx run desktop:serve
```

### 2.4 `project:target` 如何阅读

```text
desktop:serve
│       └─ target
└───────── project
```

测试 target 自身可以带冒号，例如：

```text
desktop:test:main
│       └─────── target = test:main
└─────────────── project = desktop
```

日常启动不再暴露 `serve:full` 这类容易被误读为 configuration 的名字。
安全 Desktop target 已统一命名为 `desktop:serve-safe`。

## 3. Desktop 两种启动方式

### 3.1 安全默认

```bash
pnpm nx run desktop:serve-safe
```

依赖关系：

```text
desktop:serve-safe
  → desktop:prepare-dev
      → workspace dependency builds
      → desktop:native-rebuild
          → electron-rebuild better-sqlite3
  → Desktop Vite + Electron
```

适用：

- 第一次拉取或安装依赖后。
- Node、Electron、`better-sqlite3` 或 lockfile 发生变化后。
- 出现 `NODE_MODULE_VERSION` / ABI 不一致错误后。
- 不确定当前原生模块是否为 Electron 编译时。
- 做正式 Desktop 冒烟前。

这是文档、README 和协作沟通中的默认 Desktop 启动命令。

### 3.2 快速内环

```bash
pnpm nx run desktop:serve
```

它只启动 Vite/Electron，不执行依赖项目 build，也不重编译原生模块。

适用：

- 已成功运行过 `pnpm nx run desktop:serve-safe`。
- 此后没有执行会重装原生模块的 `pnpm install`。
- 没有切换 Node/Electron/分支依赖版本。
- 当前只修改 Vue、CSS 或普通 TypeScript 业务代码。

如果快速入口出现以下错误，应停止进程并回到安全入口：

```text
was compiled against a different Node.js version
NODE_MODULE_VERSION ...
```

不要用 `npm rebuild` 或普通 `pnpm rebuild` 代替
`desktop:native-rebuild`，因为模块需要针对 Electron ABI 而不是宿主 Node ABI
编译。

### 3.3 为什么不使用 `pnpm nx dev desktop`

Nx/Vite 插件会自动推断 `vite:dev` target。该 target 不是
`apps/desktop/project.json` 中定义的安全 Desktop 启动链：

- 不依赖 `prepare-dev`。
- 不执行 `native-rebuild`。
- 可能在 UI 出现之前就因原生模块 ABI 失败。

因此该命令不属于 MemoFlow 支持的 Desktop 开发入口。

## 4. 本机端口方案

运行环境与端口唯一契约见 [`runtime-lanes.md`](./runtime-lanes.md)。MemoFlow 在共享 GCP Dev 上遵循 `my-infrastructure` 的全局 100-port 项目块：MemoFlow=`20200-20299`，并且不再把框架默认 `5173/3000/8080` 当作长期开发契约。

四类环境中，与日常开发直接相关的两套 GCP Dev 端口为：

| 服务       | `host-dev` | `prod-like` |
| ---------- | ---------: | ----------: |
| Web        |    `20220` |     `20200` |
| API        |    `20221` |     `20201` |
| PowerSync  |    `20222` |     `20202` |
| PostgreSQL |    `20230` |     `20210` |
| Redis      |    `20231` |     `20211` |

`host-dev` 默认通过 Tailscale Serve + MagicDNS HTTPS 暴露给工作站；VS Code Remote/SSH port forwarding 仅作为 fallback。`prod-like` 由 `docker-compose.local.yml` 完整容器化运行。两套端口互不重叠，因此可以同时存在，不需要通过停止 Docker Web/API 来“替换”服务。

`staging` 固定使用 `20250-20261`，`prod` 位于 Alibaba 独立主机并由 Caddy 使用公网 `80/443`。完整定义均来自 `tools/runtime/profiles.json`。

## 5. 开发模式

## 5.1 模式 A：完整 Docker 近生产验证

用途：

- 发布前验证。
- 验证 Dockerfile、Compose、环境注入和反向代理。
- 用稳定后端测试完整产品。

启动：

```bash
pnpm docker:local:up
```

检查：

```bash
pnpm docker:local:ps
pnpm docker:local:logs
```

访问：

```text
Web        http://localhost:20200
API        http://localhost:20201
PowerSync  http://localhost:20202
```

prod-like 与 host-dev 已使用不同端口块，可以同时运行。

## 5.2 模式 B：GCP Dev host-dev（默认开发内环）

这是 Web/API 日常开发的默认方式。Docker 只启动基础设施，业务进程直接在宿主机运行并热更新；推荐用一条命令同时准备 Tailnet HTTPS ingress：

```bash
corepack pnpm run dev:host
```

端口固定为：

```text
Web        20220
API        20221
PowerSync  20222
PostgreSQL 20230
Redis      20231
```

在 GCP Dev 上把它放进 `tmux` 的 `MemoFlow:dev` window。首次或 MagicDNS 变化后运行 `corepack pnpm run runtime:tailnet:host-dev`；该命令配置 Tailscale Serve 的 **TLS-terminated TCP** `20220 -> 127.0.0.1:20220`，并生成 gitignored `.env.development.local` 中的 Tailnet Web/Auth/CORS origin。浏览器仍直接访问 `https://<gcp-dev MagicDNS>:20220`，但中间不经过 Tailscale HTTP reverse proxy；Vite 自己处理 HTTP/WebSocket，`/api` 再由 Vite 在 GCP 内部代理到 `127.0.0.1:20221`，无需转发 API 端口。

Web `20220` 默认使用 Vite Bundled Dev，并将 `MEMOFLOW_VITE_BUNDLED_DEV_LAZY=false` 作为 remote host-dev 基线：动态 import 不再逐个触发 `/@vite/lazy` 的跨 Tailnet 编译往返，而是在服务端优先形成稳定 bundle，同时继续保留 Vue/Tailwind HMR。需要做本地 A/B 时可在 `.env.development.local` 临时设 `MEMOFLOW_VITE_BUNDLED_DEV_LAZY=true`；若需要排查 Bundled Dev/plugin 本身，则设 `MEMOFLOW_VITE_BUNDLED_DEV=false` 回退 classic Vite。测试 lane 不启用 bundled dev。当前 `@tailwindcss/vite` 4.3.x 的 `hotUpdate` 仍依赖 classic dev-server context，因此 Web Vite config 有一个仅 Bundled Dev 生效的局部兼容 adapter；不要把它扩散到业务代码。

`prod-like` 使用独立 `20200-20211`，因此不需要停止任何 prod-like Web/API 容器。

## 5.3 模式 C：单独调试 Web 或 API

基础设施仍由 host-dev Docker profile 提供：

```bash
pnpm docker:dev:up
```

只调 Web：

```bash
pnpm nx run web:serve
# Web :20220，Vite proxy -> API :20221
```

只调 API：

```bash
pnpm nx run api:serve
# API :20221；PG :20230；Redis :20231；PowerSync :20222
```

如果只启动 Web，必须保证 `20221` 已有正确的 host-dev API，或显式覆盖 `PROXY_TARGET_URL` 指向要联调的后端。不要临时改成未登记端口。

## 5.4 模式 D：Desktop 开发

首次/依赖变化后：

```bash
pnpm docker:dev:up
pnpm nx run api:serve
pnpm nx run desktop:serve-safe
```

后续快速内环可以使用：

```bash
pnpm nx run desktop:serve
```

Desktop 使用 host-dev API `http://localhost:20221`。如果 Desktop Vite 与 Web Vite 共用同一个开发端口，不要同时启动两者；这属于同一 `host-dev` 环境内部的 UI 入口选择，不应通过占用 `prod-like` 端口解决。

## 6. 环境切换规则

1. `host-dev` 是源码热更新环境；`prod-like` 是完整容器验收环境；不要互相替代。
2. 两者端口块不同，可以同时运行。
3. `staging` 由 staging watcher 持有，禁止为了开发手工覆盖其 `20250-20261`。
4. `prod` 位于 Alibaba 独立主机，由 production watcher 持有，不能从 GCP Dev 手工 compose 替换。
5. 端口变化必须先进入 `tools/runtime/profiles.json`，然后同步 compose/env/文档。
6. 不得重新把 `5173`、`3000`、`8080` 当成 MemoFlow host-dev 的长期端口；它们只保留给工具默认或辅助测试 lane。
7. 不要使用 `docker compose down -v` 作为普通开发环境切换手段。

## 7. 常用命令速查

### 启动

```bash
pnpm nx run api:serve
pnpm nx run web:serve
pnpm nx run desktop:serve-safe
pnpm nx run desktop:serve
pnpm nx run-many -t serve --projects=api,web --parallel=2
```

### Docker

```bash
pnpm docker:local:up
pnpm docker:local:ps
pnpm docker:local:logs
pnpm docker:local:down
```

### 直接 Nx target

```bash
pnpm nx run desktop:native-rebuild
pnpm nx run desktop:typecheck
pnpm nx run desktop:test
pnpm nx run desktop:test:main
pnpm nx run desktop:test:ipc
pnpm nx run api:test
pnpm nx run web:test
```

### 工作区批量操作

批量 target 保留 Nx 原生语法：

```bash
pnpm nx run-many -t lint,typecheck --all
pnpm nx affected -t test
```

这里没有 `project:target`，因为命令本身操作多个项目。

## 8. 排障

| 现象                                  | 原因                                           | 处理                                                |
| ------------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| Desktop 报 `NODE_MODULE_VERSION`      | 使用快速/推断入口，原生模块 ABI 未准备         | 停止 Desktop，运行 `pnpm nx run desktop:serve-safe` |
| Desktop 请求仍访问 `localhost:3000`   | 旧进程/旧环境变量仍使用框架默认端口            | 重启 Desktop，确认 API 指向 `localhost:20221`       |
| `20220` 被占用                        | Web Vite 与 Desktop Vite 同属 host-dev UI 入口 | 只保留一个 UI dev server，不改随机端口              |
| API 能连数据库但 publication 创建失败 | 连错 PostgreSQL、权限不足或 logical WAL 未启用 | host-dev 检查 `20230`；prod-like 检查 `20210`       |
| 浏览器访问 `:20200` 看不到源码热更新  | `20200` 属于 prod-like，不是 Vite host-dev     | VS Code/SSH 转发并访问 `http://localhost:20220`     |

### 8.1 Desktop 登录与访客模式同时报错：`better-sqlite3` ABI 不匹配

#### 症状

登录、记住账号自动登录和访客模式都可能出现：

```text
The module '...better_sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 137. This version of Node.js requires
NODE_MODULE_VERSION 148.
```

上层 IPC 响应可能显示为：

```text
LOGIN_ERROR
GUEST_MODE_ERROR
```

这不是登录接口或访客业务逻辑本身失败。三条路径都会先打开 Profile 对应的
PowerSync SQLite 数据库；数据库初始化失败后，认证壳把底层异常包装成了认证
错误。

实际调用关系：

```text
登录 / 自动登录 / 访客激活
  → 激活 Desktop Profile
  → 打开 PowerSync 本地数据库
  → 加载 better-sqlite3 原生模块
  → ABI 不匹配
  → 包装为 LOGIN_ERROR / GUEST_MODE_ERROR
```

#### 已确认的根因

2026-07-29 在 Windows 开发环境中确认：

| 运行时    | 版本      | `NODE_MODULE_VERSION` |
| --------- | --------- | --------------------: |
| 宿主 Node | `24.12.0` |                 `137` |
| Electron  | `43.1.0`  |                 `148` |

当前 hoisted pnpm 工作区只有一个共享原生产物：

```text
node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

该文件不能同时服务于上述两种 ABI：

- 普通 `pnpm install`、Node rebuild 或需要 Node 版本的构建可能将它恢复为
  ABI 137。
- `desktop:native-rebuild` 会将同一个文件编译为 Electron ABI 148。
- Electron 版本可以被 Desktop 加载，但此后宿主 Node 直接加载同一个模块会
  失败；反向操作也一样。

因此这是“共享原生二进制在 Node 与 Electron 之间被覆盖”的运行时冲突，不是
SQLite 数据、账号 Token 或远程认证服务损坏。

#### 当前恢复方式

停止所有 Desktop/Electron 进程，然后使用安全入口：

```bash
pnpm nx run desktop:serve-safe
```

该命令通过 `desktop:serve-safe → desktop:prepare-dev →
desktop:native-rebuild` 针对当前 Electron 重编译 `better-sqlite3`。

也可以单独执行：

```bash
pnpm nx run desktop:native-rebuild
```

成功运行安全入口后，在没有重新安装依赖、切换 Node/Electron 或执行其他
native rebuild 的前提下，后续可以使用：

```bash
pnpm nx run desktop:serve
```

不要按错误信息直接运行 `npm rebuild` 或普通 `pnpm rebuild`。它们通常针对
宿主 Node ABI 编译，会让 Desktop 再次失效。

#### 最小验证方法

仓库当前可使用 Electron 的 Node 模式验证目标 ABI 和 SQLite 加载，不需要操作
登录页面：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
.\node_modules\electron\dist\electron.exe -e `
  "const D=require('better-sqlite3'); const db=new D(':memory:'); console.log(process.versions.modules, db.prepare('select 1 as ok').get()); db.close()"
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

预期输出包含当前 Electron ABI 和 `{ ok: 1 }`。如果仍出现
`NODE_MODULE_VERSION`，说明 Electron 原生模块准备没有成功。

#### 后续优化方案

短期应增加 `desktop:native-ensure`：

1. 启动前读取当前 Electron ABI。
2. 使用 Electron 执行最小 SQLite 探针。
3. 已兼容时跳过编译。
4. 不兼容时自动执行 `electron-rebuild`。
5. 重编译后再次验证，失败时输出目标 ABI、实际 ABI 和明确的恢复命令。
6. 使用进程锁避免多个 Desktop 启动同时重编译同一文件。

不要把 Electron rebuild 放进根 `postinstall`，否则会让需要 Node ABI 的测试、
脚本或宿主服务失效。

如果未来必须同时运行会加载 `better-sqlite3` 的宿主 Node 服务和 Desktop，
长期方案是物理隔离两份原生产物：

```text
Node runtime
└─ better_sqlite3.node（Node ABI）

Desktop runtime
└─ better_sqlite3.node（Electron ABI）
```

可以使用 Desktop 专用 runtime 目录，并通过 PowerSync 自定义 Worker 加载
Electron 专用 `nativeBinding`。该方案还需覆盖开发启动、Electron 打包、
Windows/macOS/Linux 和 x64/arm64 产物选择。

PowerSync 也提供实验性的 `node:sqlite` 实现，但当前仍标记为不稳定且未充分
测试，不能作为生产问题的直接替代方案。

#### 错误语义改进

认证壳不应把数据库启动失败统一显示为登录失败。建议后续增加：

```text
LOCAL_DATABASE_UNAVAILABLE
NATIVE_MODULE_ABI_MISMATCH
```

UI 应提示用户“本地数据库组件与当前 Electron 版本不兼容”，开发模式下可以
进一步给出 `pnpm nx run desktop:serve-safe` 恢复命令，而不是引导用户检查
账号或认证服务。

## 9. 文档维护规则

- 单项目开发启动只写 `pnpm nx run <project>:<target>`。
- 多项目开发启动只写 `pnpm nx run-many ...`。
- 不为开发服务新增根级 `dev` / `dev:*` 包装脚本。
- 不新增 `pnpm nx <target> <project>` 示例。
- 不把插件推断的 `vite:dev` 当成产品支持入口。
- 新增服务或机器级端口时，先更新 `tools/runtime/profiles.json` 或机器级
  `.env.development.local` / `.env.prod-like.local`，再更新本文。
- 归档计划中的历史命令不做机械重写；当前指南、README 和执行计划必须遵循
  本规范。
