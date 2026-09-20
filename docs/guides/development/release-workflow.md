---
tags:
  - guide
  - development
  - release
  - workflow
description: Release Lifecycle V3：成功 main CI 自动维护 Release PR，exact-SHA Draft/Postflight 与四平台 Desktop 发布
created: 2026-05-19T00:00:00
updated: 2026-09-02T16:15:00+08:00
---

# Release 工作流

MemoFlow 正在实施 **Release Lifecycle V3**。当前已落地的 Phase 1 把发布拆成两个明确阶段：

1. `Prepare Release`：成功的 exact-SHA `main` CI 自动触发 release-please 维护版本、CHANGELOG 和 Release PR，手工 dispatch 只用于重试；
2. `Release Publish`：Release PR 合并后的 exact SHA 必须先通过 full `CI`，随后创建 Draft Release/tag，构建 Windows/Linux/macOS Desktop 资产与当前 Server 镜像；postflight 全部通过后才公开 GitHub Release。Server candidate 的 build-once/promote-many 是 V3 Phase 2/3 的后续切换。

Prepare Release 不再从原始 push 直接触发，而是在 `CI` 已成功后运行，因此只有 verified main 才维护 Release PR；Release Publish 仍与 release-please 解耦，避免 tag/CI 竞态和半发布状态。

## 标准顺序

### 1. 本地 prod-like 验证

运行仓库统一入口：

```bash
pnpm runtime:preflight:prod-like
pnpm docker:local:up
```

涉及 Docker、runtime、env 或发布链路的改动必须完成对应 local-docker 验证后再进入 PR。

### 2. 正常开发 PR

- 从 `main` 切短生命周期分支；
- 完成改动和验证；
- 发起 PR 并合并到 `main`；
- `main` commit 必须完成 full CI；成功后自动运行 `Prepare Release`。这只创建或更新 Release PR，不创建 release/tag。

### 3. 自动 Prepare Release

`.github/workflows/release-please.yml` 监听 `CI` 的 `workflow_run`。仅当来源是 `push`、分支是 `main`、结论为 `success` 时，release-please 才运行。`workflow_dispatch` 保留为幂等重试入口。

它使用 manifest mode：

- 计算下一个版本；
- 更新 `package.json`、`apps/desktop/package.json`；
- 更新 `.release-please-manifest.json`；
- 更新 `CHANGELOG.md`；
- 创建或更新同一个 Release PR。

`release-please-config.json` 设置 `skip-github-release: true`，因此 Prepare Release **不能**创建正式 tag、GitHub Release、Desktop 包或 Docker 镜像。

### 4. 合并 Release PR，等待 exact-SHA CI

Release PR 的 merge commit 必须符合：

```text
chore(main): release X.Y.Z (#PR)
```

并且以下 release identity 必须完全一致：

- commit subject 中的版本；
- root `package.json`；
- `apps/desktop/package.json`；
- `.release-please-manifest.json`；
- `CHANGELOG.md` 中的 `X.Y.Z` release heading。

`.github/workflows/release-publish.yml` 监听 `CI` 的 `workflow_run`。只有这个 **exact SHA 的 main push CI 已 success**，该 commit 才有资格进入发布。

普通 main commit 会被识别为 `eligible=false` 并安全 no-op。

### 5. Draft Release + tag

`Release Publish` 对 eligible release commit：

1. 再次确认 SHA 仍属于 `main`；
2. 幂等创建 Draft GitHub Release；
3. 创建 `vX.Y.Z` tag，并拒绝任何 tag→SHA 冲突；
4. 直接调用两个 reusable release lane，而不是依赖 tag push 的递归 Actions 触发。

一旦 immutable tag 与 Draft Release identity 创建或验证成功，Release Publish 就把对应 merged Release PR 从 `autorelease: pending` 纠正为 `autorelease: tagged`。这里的 `tagged` 只表示 immutable tag 已建立，不表示 GitHub Release 已 Published；这样即使 Desktop/Docker gate 后续 fail closed，release-please 仍可为修复提交生成下一个 corrective Release PR，而不会被失败 Draft 永久阻塞。

如果 release 已经 Published，手工 retry 会识别为已完成并不创建第二个版本。

### 6. Desktop Release Lane

`.github/workflows/release-assets.yml`：

- checkout exact release SHA；
- 再次验证 release contract；
- 构建 Windows x64、Linux x64、macOS Intel x64 与 macOS Apple Silicon arm64 Desktop 包；
- 上传 release assets；
- 生成 `SHA256SUMS.txt`；
- 为每个平台生成 receipt，并生成 `desktop-release-manifest.json`，绑定 `version/tag/gitSha`、platform/arch/signing state 与每个资产的 SHA256；
- 缺任一必需平台、重复资产名、macOS 架构名缺失或 receipt 漂移都会 fail closed。

它支持 `workflow_call` 和 `workflow_dispatch`，因此失败后可针对同一 Draft/tag 重试。

### 7. Docker Release Lane

`.github/workflows/publish-images.yml` 只负责**发布镜像**，不宣称已经部署生产服务器。它：

1. 按 release SHA 查找成功的 main `CI`；
2. 下载该 CI 的 verified artifact closure；
3. 验证 manifest/content digest；
4. 生成 production promotion provenance；
5. 构建并推送 API / Migrator / Web；
6. 记录 image digest 到 `docker-release-manifest.json`。

每个 release image 只发布两种不可变 release identity：

```text
vX.Y.Z
vX.Y.Z-<sha12>
```

最终可信身份仍是 registry digest。Release lane **不更新 `prod-latest`**；`prod-latest` 属于后续 production rollout/promotion 的 mutable channel，避免 Draft 阶段或 Desktop lane 失败时提前触发线上更新。

### 7.1 双 Registry 分发

Docker release 的 **artifact identity 是 OCI digest，不是某一个 registry URL**。每个 API / Migrator / Web 镜像只执行一次 `docker/build-push-action` build，并在同一次 push 中同时写入：

- China distribution：阿里云 ACR；
- Global distribution：GitHub Container Registry（GHCR）。

`publish-images.yml` 会对 ACR 与 GHCR 的 immutable tag 再做 digest parity 检查；任一 registry 返回的 digest 与 build output 不一致，release lane 直接失败。`docker-release-manifest.json` 保留兼容的 `repository/tags/digest` 字段，并额外记录 `distributions.china` 与 `distributions.global`。因此 production promotion 可以选择离运行区域最近的 registry，但不能改变 artifact identity。

第三方 runtime dependency 不在每个 release 重建。`.github/workflows/mirror-runtime-images.yml` 读取 `tools/ci-cd-platform/runtime-image-mirrors.json` 中经过 review 的 `linux/amd64` platform-digest source，并使用 `skopeo copy --preserve-digests` 同步到 ACR 与 GHCR。该 pin 配置或 workflow 自身合并到 `main` 时自动执行，`workflow_dispatch` 用于重试。平台 manifest digest 是 runtime artifact identity；不复制上游 attestation/multi-arch index，避免 ACR 对未知 OCI manifest class 的兼容问题。更新 PostgreSQL / Redis / Caddy / PowerSync / Watchtower 版本必须先修改 source digest；不能通过重新解析 `latest` 或 floating tag 隐式升级。

### 8. Postflight 后再 Publish

只有 Desktop 与 Docker 两条 lane 都成功时，`Release Publish` 才会：

1. 下载 `desktop-release-manifest.json` 与 `docker-release-manifest.json`；
2. 验证 `version/tag/gitSha/ciRunId` 一致；
3. 生成并上传 `release-manifest.json`；
4. 将 Draft Release 改为 Published + Latest。

因此“tag 已存在”不等于发布完成；**Published GitHub Release + canonical release manifest** 才是发布闭环完成的定义。

## 失败与重试

任一 Desktop/Docker lane 失败时 Release 保持 Draft。可以手工运行 `Release Publish` 并输入已有 tag（例如 `v0.10.0`）重跑闭环；流程会验证 tag、SHA、release commit、exact-SHA CI，不会生成新版本。

禁止为了“变绿”跳过失败 lane、修改 tag 指向、或在 postflight 前手工公开 Draft。

## Release health

`.github/workflows/release-health.yml` 每周及手工运行，非阻塞地观察：

- 距最近正式版本天数；
- 自最近 tag 以来的 commit 数；
- `autorelease: pending` Release PR 数量与最老年龄。

软阈值为：`>14 天`、`>150 commits` 或 pending PR `>14 天`。超过阈值只 warning，不阻塞产品 CI。

## 与生产部署的边界

Release Lifecycle V3 当前发布面的完成点是：GitHub Release/桌面资产/ACR + GHCR 双 registry 镜像均具备可追溯证据。它**不自动 SSH 到生产服务器，也不自动修改 production compose**。

生产 rollout、migrator-first 更新、回滚和观察日志见 [deployment README](../../deployment/README.md)。

## V3 canonical authority

完整 V3 目标和实施状态以以下文档为准：

- [`../../architecture/delivery-platform-v3.md`](../../architecture/delivery-platform-v3.md)；
- [`../../architecture/release-lifecycle-v3.md`](../../architecture/release-lifecycle-v3.md)；
- [`../../plan/archive/2026-09-02-delivery-platform-v3.md`](../../plan/archive/2026-09-02-delivery-platform-v3.md)。

V3 authority cutover 已完成：candidate/staging/release/production 均有真实证据，Alibaba canonical production 由 exact `production-selected` control artifact + watcher 拥有。历史手工 SSH/legacy compose 只保留 emergency recovery 语义；macOS trusted-public signing 则由独立 `MACOS_RELEASE_MODE=signed-notarized` + Apple credentials 条件门控制。
