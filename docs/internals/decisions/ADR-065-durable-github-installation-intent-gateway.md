---
tags:
  - adr
  - repository
  - github
  - installation
  - security
  - desktop
description: ADR-065 - durable GitHub App installation intent、公开 Setup Gateway 与 authenticated finalize 边界
created: 2026-08-28T12:00:00+08:00
updated: 2026-09-06T17:20:00+08:00
---

# ADR-065: Durable GitHub App Installation Intent + Setup Gateway

**状态：** 已采纳
**日期：** 2026-08-28
**影响范围：** Repository、GitHub App、Web、Desktop、API、Prisma、Deployment

## 1. Context

ADR-034 已确定知识资产事实边界：Desktop Local Vault 是本地可写事实源；用户显式开启同步后，GitHub private repository 是跨设备共享提交历史；服务端从 GitHub 构建 projection/RAG；GitHub 登录身份与 GitHub App repository installation 必须解耦。

旧 installation orchestration 使用进程内 `Map` 保存一次性 state 与 installation claim。该实现能覆盖单进程 Web happy path，但不能可靠覆盖：

- API restart / multi-instance；
- Dev Test GitHub App 只有一个 Setup URL，而 dev/staging 有独立 API/DB；
- Desktop 在外部浏览器完成 GitHub installation，但浏览器不应承担 Desktop MemoFlow session；
- 公开 GitHub redirect 与“授予 repository connection 权限”耦合过紧；
- durable 化后若原始 provider state 直接落库，会扩大 DB 泄露后的重放风险。

## 2. Decision

### 2.1 Durable installation intent

引入 `KnowledgeRepositoryInstallationIntent`，由 Repository application port 所有，production 使用 Prisma/PostgreSQL 持久化。

状态：

```text
Pending -> CallbackReceived -> Finalized -> Consumed
```

普通 provider-state lease 到期后任何非终态均视为 `Expired`，且原始 state 不再可用。

2026-09-06 的 Windows live acceptance 补充一个严格受限的 **authenticated retry lease**：若同一 MemoFlow identity 在最近 24 小时内已经通过真实 Setup Gateway callback 得到 `CallbackReceived` / `Finalized`（且尚未 `Consumed`），Desktop 可在 authenticated `start` 时请求恢复。Server 必须重新调用 GitHub App inventory，确认 installation 未 suspended、Contents write 仍成立且 provider account 未漂移，然后只把该 verified intent 的 live `expiresAt` 续签为新的 10 分钟窗口。

2026-09-27 的 Web dev acceptance 暴露了同一 GitHub provider 语义在浏览器中的另一种失败方式：Web 已经完成 authenticated `finalize`，但 repository-selection UI 因刷新/重新挂载丢失；随后用户再次进入 GitHub configuration 并点击 Save，如果 repository selection 没有实际变化，GitHub 不会产生新的 Setup callback。为避免要求用户人为增删仓库，Web 允许恢复 **最近 24 小时、同 identity、同 route、`clientKind=web` 且已经 `Finalized` 的未消费 intent**。Web 不恢复仅有 `CallbackReceived` 的 proof；这保证浏览器恢复路径仍然要求此前已经经过 authenticated finalize。恢复时同样必须重新验证 GitHub installation inventory，并只续签该 intent 的 10 分钟 live lease。

`Pending` / `Consumed` 永不恢复；恢复过程不持久化 raw state、OAuth token 或 installation token。

记录包含 identity owner、client kind、environment route key、relative return path、installation/account metadata 与时间戳，但**不得**持久化 GitHub App private key、installation token、OAuth token 或原始 state。

### 2.2 Provider state envelope

GitHub installation URL 使用：

```text
mfi1.<routeKey>.<randomNonce>
```

- `mfi1` 是可演进协议版本；
- `routeKey` 仅用于选择 server-configured environment target，不是授权事实；
- nonce 为 32 random bytes 的 base64url；
- 数据库只保存完整 state 的 SHA-256 hash。

### 2.3 Public callback is not authorization

GitHub Setup URL 指向公开 API gateway：

```text
GET /api/v1/repositories/knowledge-connections/installations/setup
```

该入口可以：

1. 校验 state envelope；
2. 按 allowlisted route target 将 callback 转交正确 environment；
3. 在目标 environment 中重新调用 GitHub App API 验证 installation inventory；
4. 将 intent 推进到 `CallbackReceived`；
5. Web 安全跳回 configured Web origin，或为 Desktop 返回最小 completion HTML。

该入口**不能**：

- 创建 `KnowledgeRepositoryConnection`；
- 签发 repository token；
- 创建 reusable installation claim；
- 信任 query 中的 `installation_id` 作为授权事实。

### 2.4 Authenticated finalize

只有创建 intent 的 MemoFlow identity 才能调用：

```text
POST /api/v1/repositories/knowledge-connections/installations/intents/:intentId/finalize
```

finalize 会再次从 GitHub App API 验证 installation 未 suspended、Contents write 仍成立、provider account 未漂移，然后把状态推进到 `Finalized` 并返回当前 verified repository inventory。

因此：

```text
GitHub callback possession != MemoFlow repository authorization
```

### 2.5 Atomic connection grant

真正 `connect` 必须持有 live `Finalized` intent，并在**同一个数据库事务**中：

```text
re-check Finalized intent
-> save/update KnowledgeRepositoryConnection
-> mark intent Consumed
-> commit
```

任一动作失败则整体 rollback。这样不存在“repository 已连接但 intent 仍可重用”的中间 durable 状态。

### 2.6 Web completion

Web start 时提交 `clientKind=web` 与 same-origin return URL。Server 只保存 pathname/search/hash。

GitHub callback 后返回：

```text
<configured web origin>/<return path>?installation_intent=<public intent id>
```

Web 再经 authenticated status/finalize 获得 repository selection。Raw GitHub state 不再回流到前端新路径。

迁移期保留旧 `state + installation_id` complete route，由同一 durable intent/finalize semantics 承接。

### 2.7 Desktop completion

Desktop start 使用 `clientKind=desktop`，外部浏览器打开 GitHub installation URL。Desktop renderer 保存 `intentId` 并有界轮询 authenticated status endpoint。

GitHub callback 到达 gateway 后只记录 `CallbackReceived` 并显示“可返回 MemoFlow Desktop”。Desktop 轮询观察到状态后自行 authenticated finalize。

因此不要求：

- 外部浏览器已登录 MemoFlow Web；
- Electron custom protocol/deep link；
- GitHub callback 能直接回到 renderer。

### 2.7a Existing-installation / failed-client retry

GitHub 对已经安装且 repository selection **没有发生变化**的 App 配置页不会产生新的 Setup callback；`Redirect on update` 只在 installation 实际更新时触发。Desktop 因本地崩溃、IPC defect 或升级中断而错过 finalize，或 Web 已完成 finalize 但 repository-selection UI 因刷新/重新挂载丢失时，强迫用户先增删仓库再 Save 既不可靠，也扩大误操作风险。

因此 retry 采用已有 verified proof 的短期恢复，而不是新增 OAuth 权限或伪造 callback。Desktop 可以恢复 `CallbackReceived|Finalized`；Web 只允许恢复更强的 `Finalized` proof：

```text
authenticated start
-> Desktop: find same-identity/same-route CallbackReceived|Finalized proof (callback <= 24h)
-> Web: find same-identity/same-route/clientKind=web Finalized proof (callback <= 24h)
-> revalidate installation through GitHub App API
-> require same provider account + not suspended + Contents write
-> CAS-renew the same unconsumed intent for 10m
-> authenticated FINALIZE (idempotent when already Finalized) -> repository inventory
```

新客户端在该路径收到 `requiresExternalBrowser=false`，不得再打开无效的 GitHub configuration page；Web 直接用返回的 exact intent id 执行 authenticated finalize 并恢复 repository inventory，Desktop 继续走 status/finalize。旧客户端忽略该字段仍保持安全，只会多打开一个不具授权效果的页面。首次安装、过旧 proof、identity/account drift、无 verified proof、Web 只有 `CallbackReceived`、以及 `Consumed` intent 仍必须走新的 provider-state + Setup callback。GitHub 服务不可用时恢复请求 fail closed，不通过创建额外 Pending intent 隐藏错误。

该恢复路径不改变 §2.3/§2.4 的授权边界：公开 callback 本身仍不能 connect，恢复后仍必须由原 MemoFlow identity authenticated finalize，并由 connect transaction 原子 consume。

### 2.8 Environment routing and credential boundary

Non-production：

```text
MemoFlow Dev Test GitHub App
  dev routeKey     -> dev API/DB
  staging routeKey -> staging API/DB
```

同一个 Dev App 可以只有一个 Setup URL（dev gateway）；staging state 到达后只能被 server-side allowlist 转到 staging API。

Production：

- 使用同一代码/协议；
- 使用独立 production GitHub App、private key、webhook secret、DB/runtime；
- production Setup URL 指向 production API；
- production 不依赖 GCP Dev gateway，也不共享 Dev Test App private key。

## 3. Security invariants

1. GitHub login OAuth 与 knowledge repository installation 仍完全解耦。
2. 原始 installation state 仅在 browser redirect round-trip 存在，不落库。
3. `installation_id` 必须通过 GitHub App API inventory 再验证。
4. routeKey 永远不能携带任意 URL；只能索引 server-configured HTTPS allowlist。
5. Web return origin 由 server config 决定；client return URL 只能贡献同 origin 的 relative path。
6. Finalize 必须验证 `intent.identityId === authenticated identityId`。
7. CallbackReceived 不能调用 connect。
8. Connection write 与 intent consume 必须原子提交。
9. Desktop/browser 不获得 App private key；Desktop repository token 仍是短期、repository-scoped。
10. guest/offline-only profile 不得通过 installation flow 扩大 cloud authorization。
11. Desktop retry 只能续签同 identity、同 environment、24h 内已 verified 且未 Consumed 的 callback proof，并在续签前重新验证 GitHub installation/account/Contents write。

## 4. Consequences

### Positive

- API restart/multi-instance 不再丢失 installation flow；
- dev/staging 可以共享测试 GitHub App 而不共享 DB state；
- Desktop installation 不依赖 Web session；
- callback exposure 与实际授权分离，安全边界更清晰；
- production 可以独立 credential blast radius；
- environment 数量增加时不需要把 arbitrary redirect origin 写进客户端协议。

### Cost

- 增加短生命周期 Prisma model、status/finalize API 与少量 polling；
- dev/staging runtime 需要显式 route key/target 配置；
- GitHub App Setup URL 需要在代码部署后一次性切到 API gateway；
- production 发布前仍需单独注册 production GitHub App。

## 5. Rejected alternatives

### A. Continue process-local state

拒绝。无法承受 restart/multi-instance，也无法解决 dev/staging Setup URL routing。

### B. Store raw state in PostgreSQL

拒绝。数据库泄露会直接暴露未过期 correlation secret；hash 足以完成 lookup/verification。

### C. Callback directly creates repository connection claim

拒绝。公开 provider redirect 不应等价于 MemoFlow authenticated authorization。

### D. Desktop custom protocol callback

暂不采用。外部浏览器 + durable status polling 更简单、跨平台，并避免额外 OS protocol registration/security surface。

### E. One GitHub App and private key across dev/staging/prod

拒绝用于 production。技术上可行但扩大生产 installation authority 的 blast radius；dev/staging 可共享测试 App，prod 独立。

## 6. Verification

Required evidence:

- state/hash/TTL/idempotency unit tests；
- callback-only connect rejection + same-identity finalize tests；
- cross-environment allowlist/open-redirect tests；
- Web intent return + Desktop polling UI tests；
- HTTP/IPC/Desktop gateway contract tests；
- real PostgreSQL transaction rollback test；
- package typecheck/lint/build/test；
- exact-SHA prod-like Docker migration/startup；
- exact-SHA staging deployment；
- after GitHub App registration change: real Web + Desktop installation acceptance。

Live GitHub acceptance is deliberately last: application and deployment must be ready before the external Setup URL is changed.

## 7. Deployment verification note — 2026-08-29

The production rollout validated the ADR boundary with the separate `MemoFlow Production` GitHub App and production-only runtime credentials. A real selected-repository installation completed durable callback/finalize/connect and a real `push` webhook advanced the repository projection on the production API.

The first push returned HTTP `401` because the external GitHub App hook secret and the production runtime secret had drifted. The repair synchronized the external hook config to the already-generated production secret; no application-code or trust-boundary change was required. A subsequent push was accepted with HTTP `202`, processed to the exact Git commit, and a GitHub redelivery was deduplicated by the durable delivery ledger.

This deployment incident reinforces, rather than changes, the ADR: webhook secret ownership is environment-local production configuration and must be validated by a real signed delivery after rollout. Secrets, JWTs and private keys remain outside Git and outside acceptance evidence.

## 8. Existing-installation retry live acceptance — 2026-09-06

A real Windows acceptance exposed GitHub's no-op configuration behavior: the production installation already contained `thought-forest` plus the E2E fixture, so GitHub disabled Save and emitted no new Setup callback. The bounded retry lease added in v0.14.1 closed that provider-protocol gap without adding OAuth authority or weakening the one-time state boundary.

Live evidence preserved both compatibility directions. Published v0.14.0, which does not understand `requiresExternalBrowser`, successfully recovered the recent same-identity `CallbackReceived` proof, finalized it and displayed the current two-repository inventory; it merely opened an unnecessary `Confirm access` browser page. After installing the SHA256-verified Published v0.14.1 package, the same unconsumed `Finalized` proof was revalidated and renewed while browser windows remained unchanged, proving the new client skipped the no-op GitHub page.

The user then connected `BakerSean168/thought-forest`. Production PostgreSQL recorded the repository connection as `Active` with no lifecycle error and atomically advanced the authorizing intent to `Consumed` at the same timestamp. This closes the real Desktop requirement in Section 6 while preserving every security invariant in Section 3.
