---

> 存储布局已被 Issue #487 的 [Desktop storage ownership](../../architecture/desktop-storage.md) 取代；本文仅保留历史背景。
tags:
  - plan
  - active
  - desktop
  - storage
  - powersync
  - architecture
description: 桌面端多账号本地存储与 Profile Runtime 架构的当前实现状态、代码审查结论与剩余缺口
created: 2026-05-17T00:00:00
updated: 2026-05-19T11:25:00
status: active
---

# 桌面端多账号本地存储架构实现状态

## 摘要

本文不再是“目标态执行规格”，而是当前代码的 as-built 状态文档。它用于回答三个问题：

- 现在到底实现到了哪里
- 哪些关键架构已经落地
- 哪些地方还不算“优雅完整实现”

当前结论：

- 多账号本地共存主链已落地
- `shell runtime / profile runtime` 分层已落地
- per-profile SQLite、token、repository storage、主窗口 state 已落地
- `logout` 不再清本地库，`remove account` 才删除 profile 数据
- PowerSync service 已切到 `Sync Streams`
- snapshot manifest / download / hydrate / build CLI 已落地
- `user-files` 设置流已落地为可用能力
- snapshot rebuild 自动化作业已接入 API cron

但当前仍不能定性为"优雅完整实现"，因为还存在以下未收尾项：

- ✅ 多账号切换、logout/remove 语义、path resolver、user-files config 已有单元测试覆盖（2026-05-19 新增）
- ✅ ProfileSnapshotService 测试覆盖已扩展到 9 个用例，涵盖所有分支和错误路径（2026-05-19 补充）
- 自动化 snapshot rebuild 的生产可用性仍依赖真实环境配置与部署验证
- 当前 Chromium / renderer 隔离真值是 Electron `partition`，而不是额外的 profile 级物理 sessionData 目录方案
- 历史文档、ADR 和提示词里仍可能残留少量旧阶段语义

## 当前真值

### 1. 启动与运行时分层

桌面端当前采用两段式运行时：

- `shell runtime`
  - 应用启动时初始化
  - 负责 shared 路径、`ProfileRegistry`、登录/注册窗口、shell auth IPC
  - 不再在登录前打开业务数据库
- `profile runtime`
  - 在选定账号后激活
  - 负责 per-profile PowerSync、业务模块 bootstrap、主窗口、schedule runtime

当前代码真值：

- shell 初始化在 [main.ts](/D:/home/projects/memoflow/apps/desktop/src/main/main.ts:473)
- profile 生命周期收口在 [DesktopProfileRuntimeManager.ts](/D:/home/projects/memoflow/apps/desktop/src/main/profile/DesktopProfileRuntimeManager.ts:1)
- shell auth IPC 常驻在 [desktop-auth-shell.ts](/D:/home/projects/memoflow/apps/desktop/src/main/modules/authentication/desktop-auth-shell.ts:1)
- 启动时不再打开业务库，旧初始化层只保留延迟说明，见 [infraInitialization.ts](/D:/home/projects/memoflow/apps/desktop/src/shared/initialization/infraInitialization.ts:1)

### 2. 本地路径与 ownership

当前 ownership 分层已在主进程路径解析层落地：

- `shared/`
  - remembered accounts
  - device id
  - shell 级配置
  - login/register 窗口状态
  - profile registry
- `profiles/<profileId>/`
  - `db/powersync.sqlite`
  - `auth/tokens.enc`
  - `storage/repository-storage`
  - `storage/knowledge-notes`
  - `storage/attachments`
  - `ui/main-window-state.json`
- `cache/`
  - snapshot staging
  - downloads
  - temp
- `用户原生对话框选择的位置`
  - exports
  - downloads
  - attachments

当前代码真值：

- LocalAppData / Documents 根路径解析在 [user-data-path.ts](/D:/home/projects/memoflow/apps/desktop/src/main/user-data-path.ts:1)
- shared 路径结构在 [shared-path-resolver.ts](/D:/home/projects/memoflow/apps/desktop/src/main/paths/shared-path-resolver.ts:1)
- profile 路径结构在 [profile-path-resolver.ts](/D:/home/projects/memoflow/apps/desktop/src/main/paths/profile-path-resolver.ts:1)
- 目录落盘在 [ensure-dirs.ts](/D:/home/projects/memoflow/apps/desktop/src/main/paths/ensure-dirs.ts:1)

### 3. 多账号本地共存语义

当前已实现的账号语义：

- `login`
  - 先 prepare profile
  - 再写 profile token/session
  - 再 activate runtime
- `switch account`
  - 切 runtime，不清空旧 profile 数据
- `logout`
  - 清当前活跃会话
  - deactivate runtime
  - 不删 profile 目录
  - 不清 `powersync.sqlite`
- `remove account from device`
  - 删除 remembered account
  - 删除 profile 目录
  - 从 registry 移除

当前代码真值：

- `logout()` 只走 `SessionManager.logout()`，不再直接清 PowerSync，见 [AuthDesktopApplicationService.ts](/D:/home/projects/memoflow/apps/desktop/src/main/modules/authentication/application/AuthDesktopApplicationService.ts:669)
- shell 层 `auth:logout` 负责先退出会话，再 deactivate profile，再切登录窗，见 [desktop-auth-shell.ts](/D:/home/projects/memoflow/apps/desktop/src/main/modules/authentication/desktop-auth-shell.ts:274)
- profile 删除在 [DesktopProfileRuntimeManager.ts](/D:/home/projects/memoflow/apps/desktop/src/main/profile/DesktopProfileRuntimeManager.ts:332)

### 4. 窗口与浏览器态隔离

当前窗口隔离策略已经切到 Electron persistent partition：

- shell 窗口使用 `persist:desktop-shell`
- profile 主窗口使用 `persist:profile-<profileId>`

这意味着以下浏览器态已经按账号分开：

- `localStorage`
- `IndexedDB`
- cookies
- Pinia persisted state 的底层存储

当前代码真值：

- shell partition 见 [WindowManager.ts](/D:/home/projects/memoflow/apps/desktop/src/main/lifecycle/WindowManager.ts:750)
- profile partition 见 [WindowManager.ts](/D:/home/projects/memoflow/apps/desktop/src/main/lifecycle/WindowManager.ts:754)
- 主窗口创建时按 profile 传 partition，见 [WindowManager.ts](/D:/home/projects/memoflow/apps/desktop/src/main/lifecycle/WindowManager.ts:314)

### 5. PowerSync 同步模型

PowerSync service 已经从 legacy inline `sync_rules` 切换到单独的 Streams 配置文件：

- service 主配置通过 `sync_config.path` 指向 `sync-config.yaml`
- sync config 使用 `edition: 3`
- 当前仍保持 `auto_subscribe: true`
- 当前策略仍是“连接后拉全量用户数据”的离线优先模型

当前代码真值：

- 主服务配置见 [powersync.yaml](/D:/home/projects/memoflow/docker/powersync/powersync.yaml:1)
- Streams 配置见 [sync-config.yaml](/D:/home/projects/memoflow/docker/powersync/sync-config.yaml:1)

### 6. Snapshot 链路

Snapshot 链路当前已落地为四段：

- API manifest / download
- desktop 首次 hydrate
- API publish
- API build CLI

当前代码真值：

- desktop hydrate 在 [ProfileSnapshotService.ts](/D:/home/projects/memoflow/apps/desktop/src/main/profile/ProfileSnapshotService.ts:1)
- hydrate 接入 profile prepare 在 [DesktopProfileRuntimeManager.ts](/D:/home/projects/memoflow/apps/desktop/src/main/profile/DesktopProfileRuntimeManager.ts:162)
- API manifest / download 在 [module.ts](/D:/home/projects/memoflow/apps/api/src/modules/powersync/module.ts:338)
- snapshot 发布存储在 [snapshot-storage.ts](/D:/home/projects/memoflow/apps/api/src/modules/powersync/snapshot-storage.ts:1)
- snapshot builder 在 [snapshot-builder.ts](/D:/home/projects/memoflow/apps/api/src/modules/powersync/snapshot-builder.ts:1)
- builder CLI 在 [build-powersync-profile-snapshot.ts](/D:/home/projects/memoflow/apps/api/scripts/build-powersync-profile-snapshot.ts:1)
- Nx target 在 [project.json](/D:/home/projects/memoflow/apps/api/project.json:124)

## 代码审查结论

### 1. 已经成立的部分

以下能力可以认定为架构上已成立：

- shell/profile runtime 单一真值
- per-profile 本地业务库
- per-profile token 持久化
- remembered account 与 profile registry 的分层
- logout 不清库
- 多账号 profile 目录并存
- Electron `partition` 级别的 renderer 隔离
- PowerSync service Streams 切换
- desktop snapshot hydrate
- API snapshot 分发与 builder CLI

这些能力已经不再是“计划”，而是当前代码真值。

### 2. 不够完整的部分

以下问题不属于架构方向错误，但会阻止“优雅完整实现”的判断：

#### 2.1 Chromium / renderer 隔离已经定稿为 `partition`

当前实现已经明确收口到 Electron persistent partition：

- shell 窗口：`persist:desktop-shell`
- profile 主窗口：`persist:profile-<profileId>`

这套隔离已经是当前运行时真值。此前计划里提到的 profile 级 `rendererPersistDir` / `chromiumSessionDir` 抽象，已经不再存在于当前 resolver 和目录创建实现中，因此后续文档与实现都不应再把“物理 sessionData 目录绑定”当成当前缺口或既有能力。

相关代码：

- [profile-path-resolver.ts](/D:/home/projects/memoflow/apps/desktop/src/main/paths/profile-path-resolver.ts:1)
- [ensure-dirs.ts](/D:/home/projects/memoflow/apps/desktop/src/main/paths/ensure-dirs.ts:1)
- [WindowManager.ts](/D:/home/projects/memoflow/apps/desktop/src/main/lifecycle/WindowManager.ts:314)

#### 2.2 `user-files` 设置流已落地，但还需要验收收口

当前已实现：

- `用户原生对话框选择的位置` 根路径解析
- `exports/downloads/attachments` 子目录
- 文本导入导出的 system IPC
- 设置页 JSON 导入导出使用该能力
- 当前路径查询
- 目录选择
- 打开目录
- 恢复默认目录
- 自定义目录本地持久化

当前更准确的定性是：

- `user-files` 已经不是“基础 IO”而是可用设置流
- 但它仍属于设备级共享能力，不是 per-profile 文件管理
- 当前主要缺口是验收覆盖和交互/错误场景打磨，而不是功能不存在

相关代码：

- [shared-path-resolver.ts](/D:/home/projects/memoflow/apps/desktop/src/main/paths/shared-path-resolver.ts:16)
- [system-handlers.ts](/D:/home/projects/memoflow/apps/desktop/src/main/ipc/system-handlers.ts:118)
- [UserSettingsView.vue](/D:/home/projects/memoflow/packages/app-vue/src/modules/setting/views/UserSettingsView.vue:109)
- 用户文件目录设置已由 #487 删除，改为原生导入/导出对话框。

#### 2.3 Snapshot 自动化已接入，生产 rollout 仍待验证

当前 builder CLI 与自动化作业都已经存在且经过单元测试验证。

**代码基础设施（已验证 ✅）**：

- 桌面端 `ProfileSnapshotService` 完整 hydrate 链路（9 个测试用例覆盖所有分支和错误路径）
- API manifest / download 路由及测试
- API `snapshot-builder.ts` 构建逻辑
- `snapshot-rebuild.job.ts` 批量重建逻辑及测试（凭据不全时跳过、无活跃账号时跳过、批量重建）
- `registerCronJobs.ts` cron 注册逻辑及测试
- CLI `build-powersync-profile-snapshot.ts` 手动构建入口
- Nx target `api:powersync:snapshot:build`
- env 配置 schema 定义（`POWERSYNC_SNAPSHOT_DIR` / `SNAPSHOT_REBUILD_ENABLED` / `SNAPSHOT_REBUILD_SCHEDULE`）
- `.env.example` 已包含完整配置说明

**生产部署清单（待执行）**：

- [ ] 在生产 `.env` 中配置 `POWERSYNC_SNAPSHOT_DIR` 指向持久化卷
- [ ] 在生产 `.env` 中设置 `SNAPSHOT_REBUILD_ENABLED=true`
- [ ] 确认生产环境 PowerSync 凭据完整（`POWERSYNC_URL` / `POWERSYNC_PRIVATE_KEY` / `POWERSYNC_KEY_ID`）
- [ ] 手动执行一次 `pnpm nx run api:powersync:snapshot:build -- --identity-id <id>` 验证 E2E
- [ ] 观察首次 cron 触发日志确认自动作业正常
- [ ] 确认 snapshot 目录空间规划（按 active accounts × avg SQLite size 估算）

配套 rollout / 回补说明见：

- [powersync-profile-snapshot-rollout.md](../../guides/development/powersync-profile-snapshot-rollout.md)


#### 2.4 文档与实现表面仍需继续对齐

当前 `DesktopProfileRuntimeManager` 已经收口到：

- `prepareProfile`
- `prepareGuestProfile`
- `activatePreparedProfile`
- `discardPreparedProfile`
- `deactivateProfile`
- `removeProfile`

也就是说，旧阶段里担心的 `activateProfile(identityId, ...)` / `switchProfile(identityId, ...)` 误导性捷径已经从当前实现中移除。剩下需要继续收口的不是 runtime API 本身，而是文档、描述和后续实现入口必须继续以这套 `prepare -> activatePreparedProfile` 链路为唯一真值。

相关代码：

- [DesktopProfileRuntimeManager.ts](/D:/home/projects/memoflow/apps/desktop/src/main/profile/DesktopProfileRuntimeManager.ts:1)

## 当前与旧方案的差异

以下旧方案内容已经过时，后续不得再按这些陈述实现：

### 1. “Sync Streams 尚未迁移”

已过时。当前 service 配置已经切到 `sync_config.yaml` + `edition: 3`。

### 2. “本轮默认升级到最新 PowerSync 稳定线”

已过时。当前 repo 事实仍是 `@powersync/node@0.17.1`。后续如果要升级，应另开明确任务，不得继续在文档里把升级写成已定默认。

### 3. “renderer/chromium 已按 profile 目录物理隔离”

表述过头。当前隔离真值是 Electron `partition`，并且当前代码已经不再保留 profile 级 `sessionData` 目录抽象作为未实现能力。

### 4. “user-files 已是设备级可用设置流”

当前更准确的说法是：`user-files` 已经不是“基础 IO”，而是设备级共享的可用设置流；不成立的只是“它已经是 per-profile 文件管理系统”这种更强表述。

### 5. “阶段 1-5 仍是当前执行路线图”

已过时。主链已实现，文档不应继续保留线性阶段计划作为正文主结构。

## 当前状态矩阵

### 已落地

- shell/profile runtime 单一真值
- per-profile 本地业务库与 token 持久化
- logout 不清库，remove account 才删 profile
- Electron `partition` 级别的 renderer 隔离
- PowerSync Streams 配置
- desktop snapshot hydrate
- API snapshot manifest / download / build / publish
- user-files 设置流
- snapshot rebuild cron 接入
- 多账号生命周期单元测试覆盖（2026-05-19）
  - ProfileRegistry：注册/查找/删除/状态/快照/损坏恢复/identifier 查找
  - DesktopProfileRuntimeManager：prepare/activate/deactivate/remove/switch/guest/error
  - desktop-auth-shell：logout / guest / auto-login / remembered-account login 行为链
  - path-resolver：computeProfileId 确定性 / 路径结构 / 目录隔离
  - 旧文件根配置已退休；当前使用 CONFIG 对话框偏好
  - ProfileSnapshotService：hydrate/checksum/local-db-exists/missing-token/unavailable/download-error/invalid-header/buffer-too-small（9 用例）

### 已落地但待验收

- user-files 根目录切换后所有消费方都即时跟随
- snapshot rebuild 在真实 PowerSync 凭据和部署环境下稳定工作
- 历史文档、ADR、prompt 与当前 as-built 真值持续一致

### 后续优化，不阻塞主链

- 继续清理历史说明里的旧阶段措辞
- 继续打磨 user-files 的错误提示、路径校验和交互一致性
- 为 snapshot rebuild 增加更细粒度的观测、失败诊断和手动回补说明

## 后续实现约束

后续任何继续实现都必须遵守以下约束：

- 不要重新引入 legacy `sync_rules`
- 不要再把 “升级最新 PowerSync” 写成默认已锁定决策
- 不要把 `partition` 隔离误写为“已实现 profile 目录承载 Chromium sessionData”
- 不要把 `用户原生对话框选择的位置` 误写成 per-profile 文件存储
- 继续实现剩余缺口时，应以当前代码真值为基线，而不是以本文档的旧版本为基线

## 最小验收真值

如果后续有人要判断这套架构是否仍成立，至少核对以下事实：

- `desktop:typecheck` 通过 ✅ 2026-05-19 已验证
- `api:typecheck` 通过
- 关键 desktop 验收测试通过（runtime manager / system-handlers / profile snapshot / auth shell） ✅ 2026-05-19 已验证
- shell 启动前不打开业务 PowerSync
- per-profile `powersync.sqlite` 与 `tokens.enc` 存在
- `auth:logout` 不清库 ✅ 有单元测试覆盖
- main window 使用 `persist:profile-<id>`
- PowerSync service 使用 `sync_config.yaml`
- snapshot manifest/download/build CLI 均存在

## 当前定性

当前代码可以定性为：

- "架构方向正确，主链已成立"
- 核心生命周期有单元测试保障
- ProfileSnapshotService 所有分支和错误路径已有测试覆盖
- user-files 设置流包含错误处理、加载状态和操作反馈
- 不是"仅有骨架"
- 接近"优雅完整实现"，但仍需继续完成认证入口验收收口与 production rollout 验证

最准确的状态是：

> 桌面端多账号本地共存已经进入接近优雅完整的 as-built 状态。核心多账号生命周期、路径隔离、snapshot 链路和 user-files 设置流均已落地，当前主要剩余项是认证入口行为级验收的继续收口，以及 snapshot rebuild 在真实生产环境中的 rollout 验证。
