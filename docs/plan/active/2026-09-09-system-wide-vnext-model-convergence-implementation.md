---
tags: [plan, active, vnext, system-wide, convergence]
description: MemoFlow 全模块模型收敛唯一执行顺序、destructive cutover、验证与最终删除计划
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T11:15:00+09:00
---

# MemoFlow System-wide vNext Model Convergence — Implementation Plan

> **Execution-order authority:** 本文是本轮系统级重构的唯一执行顺序真值。Goal/Task/Setting/AI/Time+Label 既有 active plans 继续提供模块内部实施细节，但不得绕过本文依赖顺序并行写同一 contract/schema。
>
> **Control plane:** Pixel control plane `127.0.0.1:8320` 在本计划创建时不可用，因此当前 canonical execution truth 是 GCP Dev repository branch/commit + 本计划。Pixel 恢复后只允许 attach/recover 一个 durable plan，不创建重复 writer。
>
> **ADR-111 execution override:** 当前无需要保留的 MemoFlow 生产业务数据，也不要求兼容旧客户端/旧备份。本计划从此采用 destructive cutover：不写 legacy data backfill、不保留 old/new dual-read/write、不保留 V2 reader/migrator、不保留旧 route/API alias。当前 consumer 原子切到 canonical contract 后直接删除旧 surface，并 reset/reseed persistence。

## 1. Outcome

完成后 MemoFlow 只有一条现代化产品模型：

```text
Goal         Direction + Measurement + Context
Task         Plan + Occurrence + Context
Routine      Definition + Runtime + Occurrence + Intervention
Planner      Calendar/temporal projection + arrangement
Scheduler    Durable invocation + attempt
Notification Fact + Inbox + delivery
Knowledge    Space + stable Document + projection
Account      Profile + lifecycle
Preferences  typed presentation/regional
AI           Mastra runtime + typed drafts/context/owner ports
Time         shared product-time foundation
Label        shared registry; owner assignments
Governance   permanent executable reference feature + dev standards workbench
```

并物理退休：

```text
legacy Reminder model
legacy ScheduleTask model
legacy Repository/Folder/Resource
legacy Editor
standalone Dashboard
Account.settings
AI legacy product/runtime persistence
stale PortableUserDataV2 internal-model clones
```

## 2. Non-goals

- 不重写 Mastra、Better Auth、PowerSync、Prisma、rrule 或 date-fns；
- 不创建新的 generic God modules（HomeData, EntitySettings, GenericAssignment, GenericRepository 等）；
- 不为旧 MemoFlow 数据、旧客户端或旧备份维护任何 compatibility layer / migration window；
- 不把 system-wide convergence 与新的社交、团队、RBAC、mobile editor 等产品功能混在一起。

## 3. Protected assets

1. Better Auth 单一 cloud auth authority；
2. Desktop Local Profile 独立访问、guest/offline 能力；
3. account closure durable coordinator；
4. Product Time `Instant/Ymd/Hm`、recurrence adapter conformance；
5. SchedulingPort neutral seam、Scheduler lease/retry/recovery；
6. Notification outbox/lease/fencing/replay；
7. Knowledge Git/Vault truth、GitHub App security、confirmed writes；
8. Mastra durable workflow/HITL/restart recovery；
9. PowerSync offline parity；
10. host-owned `ExecutionContext.identityId`；
11. failure/operation governance contracts；
12. canonical current-user journeys/deep links；legacy redirects/aliases are not protected under ADR-111；
13. Governance executable reference feature: Rule/RuleRevision + Prisma/PowerSync + API/IPC + client/Vue + reference tests.

## 4. Global dependency order

```text
PHASE 0  Baseline / locks / dead-surface cleanup
   │
PHASE 1  Foundations
   ├─ Time
   ├─ Preferences + Account/Auth
   ├─ Label Registry
   └─ Data Portability V3 skeleton

PARALLEL  Governance reference hardening (GOV-1901..1904)
          starts after Phase 0 and is never a retirement lane
   │
PHASE 2  Knowledge identity/projection
   └─ Editor retirement
   │
PHASE 3  Goal + Task
   │
PHASE 4  Routine + Planner/Scheduler + Notification
   │
PHASE 5  Home/Dashboard retirement + AI semantic alignment
   │
PHASE 6  Portable V3 owner registration + whole-schema residue deletion
   │
PHASE 7  whole-system review / exact-head CI / release closure
```

Within a phase, lanes may run in parallel only when they do not write the same contracts/schema. No data-migration lane exists under ADR-111.

---

# Phase 0 — Baseline, architecture locks and high-confidence dead surfaces

## SYS-0001 — Capture exact current-system characterization

**状态：DONE — 2026-09-09 characterization baseline frozen**

**Goal:** turn every target-changing behavior into executable characterization before destructive edits.

**Implementation:**

1. record exact HEAD and clean-worktree baseline;
2. add/refresh focused characterization for Time host timezone, Account/Auth closure, Knowledge projection, Dashboard live consumers, Governance executable reference behavior and Editor no-runtime boundary; legacy V2 import behavior is not a preservation target;
3. update test inventory only because implementation now legitimately changes test surfaces;
4. ensure each future delete has a consumer search fixture or architecture lock.

**Tests:** focused package tests + `pnpm test:inventory` + governance.

**Acceptance:** every legacy surface scheduled for deletion is either behavior-characterized for surviving semantics or proven to have zero required current consumer. No old-data migration test is required.

**Closure evidence:**

- Time host drift + explicit IANA + DST gap/overlap + locale/week-start characterization added; recurrence conformance remains green;
- Account closure coordinator and raw Better Auth closure enforcement integration tests green;
- Data Portability security boundary characterization exists; ADR-111 supersedes legacy Editor/V2 backup restoration obligations;
- Knowledge projection + legacy Editor no-runtime boundary green;
- Dashboard remaining Home/Goal/AI consumers frozen in an executable surface test;
- Governance Rule/Revision executable reference behavior and canonical field inventory frozen;
- evidence map: `docs/analysis/2026-09-09-system-vnext-characterization-baseline.md`.

## SYS-0002 — Retire unused Dashboard page-only Vue components

**状态：DONE — 2026-09-09 first implementation checkpoint**

**Goal:** remove code that belonged only to the already-retired Dashboard page without touching current Home behavior.

**Scope:** `DashboardStatsStrip`, `DashboardTrendPanel`, `DashboardActivityTimeline` and tests/keep-boundary references proven unused.

**Out of scope:** `useDashboard`, DashboardData API/IPC/package, Goal progress, ActivityLedger, DashboardConfig.

**Acceptance:** production import graph contains none of the three components; app-vue typecheck/tests green.

**Closure evidence:**

- consumer search found no production imports for the three components before deletion;
- removed obsolete Residual 1237 keep-boundary spec + Dual Registry entry tied only to `DashboardActivityTimeline`;
- focused Vitest: `format-duration` 5/5, `ReminderCapsulePreview` 2/2, `SettingAdvancedActions` 3/3 PASS;
- `app-vue:typecheck` PASS;
- `app-vue:lint` PASS with 13 inherited warnings / 0 errors;
- `pnpm test:inventory` regenerated inventory: 1187 files;
- `pnpm docs:check` PASS;
- `pnpm governance:check` PASS.

## SYS-0003 — Add target no-return architecture manifest

**状态：DONE — staged no-return governance active**

**Goal:** encode retired vocabulary/ownership boundaries from system-wide review as staged governance locks.

Locks activate when the canonical replacement ticket closes; then reintroducing the retired surface fails governance. ADR-111 removes compatibility-window requirements.

**Closure evidence:**

- `tools/governance/vnext-retirement-manifest.json` owns active/staged retirement locks;
- active locks protect already-retired Dashboard page-only surfaces and Editor runtime package;
- future Dashboard bounded context, Editor persistence, Account.settings and legacy Reminder/Scheduler/Notification surfaces remain staged; Governance is explicitly excluded from retirement locks by ADR-110;
- audit is part of `memoflow:governance-check` and has dedicated governance-tools tests.

---

# Phase 1 — Foundations

## TIME lane — execute existing TIME-1201..1206

Canonical detail: `2026-09-09-time-label-vnext-model-convergence.md`.

Order:

1. TIME-1201 **DONE** — host drift / IANA / DST / locale / week-start + recurrence characterization frozen;
2. TIME-1202 **DONE** — branded `TimeZoneId`, `TimeContext`, `TimePresentationStyle`; the temporary legacy adapter is now deletion debt under ADR-111;
3. TIME-1203 **DONE** — timezone-aware Calendar/Input + shared wall-clock resolver;
4. TIME-1204 **DONE** — locale/timezone-aware Format + official `@date-fns/tz` fixed-pattern adapter;
5. TIME-1205 **DONE** — cross-module consumers atomically switched to identity/session Product Time;
6. TIME-1206 **DONE** — raw number/Date compatibility and host-local fallbacks retired; anti-resurrection governance active.

**Global gate:** no server business calendar semantics may read ambient host timezone.

## PREF-ACCOUNT-AUTH lane

### ACC-1401 — Characterize Account profile/lifecycle/closure

**状态：DONE — 2026-09-09**

Characterization confirms Desktop guest/Profile lock/adoption behavior and the durable cloud closure/revocation/retry path. Consumer inventory: `realName` / `gender` / `birthday` have real UI consumers and stay; Account `Suspended` has no admin/moderation control plane; phone has no write capability and only speculative self-loop persistence; Account `version` has no product consumer or expected-revision CAS semantics.

### SETTING-9202 — Canonical preference namespace foundation

**状态：DONE — 2026-09-09**

Canonical `presentation | regional` contracts, portable `TimeZoneId`, per-namespace Prisma/PowerSync rows, real revision CAS and creation-race recovery are implemented. ADR-111 forbids backfill/dual-read/dual-write compatibility lanes.

### SETTING-9203 — Canonical presentation/regional cutover + Account.settings retirement

**状态：DONE — 2026-09-09**

Completed in the same coordinated batch as `TIME-1205`: canonical preference HTTP/IPC/UI transports are live, `PreferenceUserTimeContextAdapter` is the identity Product Time seam, Account preference duplicate truth is removed through contracts/domain/API/Prisma/PowerSync/Web mock surfaces, and current time consumers no longer read Account/UserSetting timezone fallback. Non-presentation legacy Setting ownership remains for SETTING-9205/9206/9209.

### SETTING-9204 — Notification user/device ownership convergence

**状态：DONE — 2026-09-10**

`UserSetting.notification` is retired from canonical Setting contracts/runtime/UI. User-level InApp/Push/Email delivery preferences are owned by `NotificationPreference`; Desktop presentation mode and notification sound are owned by the typed `DesktopNotificationPreference` device capability/store, with strict IPC validation and no Web fallback. No legacy notification-setting values were migrated or seeded under ADR-111. Focused evidence: contracts 3 files / 10 tests, Setting 1 / 21, App Vue 3 / 12, Desktop service/store 2 / 17, Desktop IPC 1 / 13; contracts/Setting/App Vue typechecks PASS; Desktop 9204-path filtered typecheck has 0 errors; app-vue `./di` declarations rebuilt; `git diff --check` and ownership residual scans PASS. Device persistence/scope remains SETTING-9206.

### SETTING-9205 — Retire dead/fake UserSetting categories and misleading UI

**状态：DONE — 2026-09-10**

Live legacy `UserSetting` remainder is now strict `appearance + locale` only. Workflow/privacy/shortcuts/experimental/ui/ai categories and `locale.currency` are retired from canonical contracts, mocks and Settings UI; old/unknown imports fail closed, and `privacy.shareUsageData=true` explicitly requires future re-consent rather than being converted. The misleading Help -> cloud shortcut-editor entry was removed with that retired surface. Reviewer gates: contracts 10/10, Setting 39/39, App Vue 19/19; production residue scan and `git diff --check` PASS. Device/local scope remains SETTING-9206; final `user_settings` persistence retirement remains SETTING-9209.

### SETTING-9206 — Establish device-local preference scope/persistence

**状态：DONE — 2026-09-10**

Desktop notification presentation mode and sound now persist as a narrow Profile-scoped device surface at `profiles/<profileId>/ui/notification-preference.json`, with strict contract parsing, atomic replacement, corrupt/missing fallback to defaults, profile-switch cache isolation and inactive-profile mutation rejection. Production wiring resolves the active Profile path lazily through the Desktop capability boundary. Window state and UserFiles remain separately owned; no cloud preference/Data Portability absolute-path leakage and no generic `deviceSettings` bag were introduced. `CommandRegistry`/`DeviceKeymap` remain an explicit future ADR boundary without fake UI. Evidence: Desktop path/store/service/wiring 32 tests, Desktop IPC 14, Vue Notification Settings 5 — all PASS; focused ESLint, ownership residue scan and diff check PASS. Full Desktop typecheck remains blocked only by unrelated existing workspace declaration errors outside this ticket.

### ACC-1402 — Introduce AccountView + CloudIdentitySummary composition

**状态：DONE — 2026-09-09**

`AccountView = { account, cloudIdentity }` is the HTTP read/update surface. `CloudIdentitySummary` contains only `identityId / email / emailVerified`; session/provider/token fields are structurally excluded. HTTP composes the projection from the authenticated request seam, IPC stays local-only with `cloudIdentity: null`, and Vue/React display login email + verification from Cloud identity rather than treating Account contact email as authentication truth.

### ACC-1403 — Retire Account.settings

**状态：DONE — 2026-09-09**

Canonical presentation/regional preference consumers are live and Account settings duplicate truth is deleted through VO, contracts, `/me/settings`, event/RPC surface, Prisma/PowerSync persistence and client adapters. No backfill, compatibility reader or dual-write lane remains.

### ACC-1404 — Simplify Account lifecycle

**状态：DONE — 2026-09-10**

Account lifecycle is now exactly `Active | Closed` with `closedAt`; `Suspended / Deactivated / deletedAt` are retired from the Account owner model, contracts, Prisma/PowerSync persistence and host lifecycle gates. Durable closure-operation state remains independent. Evidence: Account unit 26 files / 192 tests before phone retirement, PostgreSQL closure 16/16, PowerSync 5/5, API auth/reminder lifecycle 23/23, contracts/account direct typecheck 0.

### ACC-1405 — Remove speculative phone verification if unused

**状态：DONE — 2026-09-10**

No real phone write/auth capability existed, so `ContactPhone` and all Account phone verification/persistence surfaces were destructively retired with no compatibility lane. Prisma + PowerSync Account schemas and generated Prisma client no longer contain phone fields; a real PostgreSQL `information_schema` gate proves the five old columns are physically absent. Evidence after retirement: Account unit 26 files / 179 tests, contracts Account gates 15/15, Vue Account 5/5, React typecheck 0, phone anti-resurrection 2/2, physical DB 1/1.

### ACC-1406 — Retire Account auth-email shadow + dead availability

**状态：DONE — 2026-09-10**

Cloud Auth is now the sole login-email authority. Account `ContactEmail`, the four mirrored email columns, nickname/email availability API+IPC+repository uniqueness seams, and the legacy-auth bootstrap that depended on those columns were destructively retired. Cloud provisioning may read the login email only transiently as a nickname fallback and never persists it into Account. `AccountView.cloudIdentity` remains the safe UI projection. Evidence: Account 24 files / 150 unit tests + 6 files / 20 real-DB integration tests, contracts Account gates 14/14, Vue Account 5/5, React/Vue typecheck 0, auth-email anti-resurrection 3/3, physical DB 1/1, Desktop adoption 3/3, migrator 3/3, PowerSync normalization 7/7, Setting 2/2 + Goal 7/7 + Repository 17/17 affected integration tests.

### ACC-1407 — Remove fake Account version + explicit Account Clock/Instant

**状态：DONE — 2026-09-10**

**Goal:** remove Account's non-CAS `version` field and all ambient `Date.now()` domain mutations. Account creation/profile update/closure timestamps must be explicit `Instant` values supplied from an injected Clock at application/host boundaries. Durable closure-operation `version` remains untouched.

Implementation is complete. Account product `version` is absent from contracts, domain, Prisma, generated Prisma, and PowerSync surfaces; `AccountClosureOperation.version` remains the real CAS field. Account creation, profile update, and closure use explicit `Instant` values from injected `@memoflow/time` Clocks at application and desktop/API host boundaries. Required Account persistence timestamps reject missing/invalid values instead of reading ambient time. Evidence: Account 25 files / 152 tests, API compose-account 8/8, DesktopProfileRuntimeManager 11/11, contracts typecheck PASS, direct Account typecheck PASS, and ACC-1407 source/physical DB gates previously passing.

### AUTH-1501 — Narrow Cloud Auth product seam

**状态：DONE — 2026-09-10**

- document/export only CloudPrincipal/session capability;
- verify no Better Auth private type leaks;
- keep `checkRequestAccess` only for account-closure product policy.

Implemented `CloudSessionCapability` and migrated API auth middleware to the narrow resolver seam. The server barrel and emitted declarations no longer expose broad `CloudAuth`, `CloudAuthOptions`, or `CloudUserProvisioner` types; rate-limit and dependency-injection declarations are MemoFlow-owned/opaque, and emitted `dist/server/*.d.ts` contains no Better Auth references. Removed duplicate-signup routing from `checkRequestAccess`; with `requireEmailVerification=true`, Better Auth 1.6.25 preserves its native 200 synthetic duplicate-signup privacy response, while the provider 422 code mapping remains covered separately and preserves MemoFlow `USER_ALREADY_EXISTS` UX. Evidence: cloud-auth 7 files / 37 tests, API bootstrap + middleware 10/10, real `express-auth-closure` integration 4/4, direct typecheck/build/declaration scan/diff check PASS. AUTH-1502 is completed below; the full ADR boundary is now implemented.

### AUTH-1502 — Make Auth disabled state an enforcement projection

Ensure closure coordinator is the only product path deciding Account closure; auth `disabledAt` follows it and does not form a second business lifecycle.

**状态：DONE — 2026-09-10**

Removed `CloudAuthUser.status` from the Prisma schema and regenerated Prisma; `CloudAuthDeviceCode.status` remains intact. `CloudAuth.revokeAllSessions()` now only removes sessions and device authorization state. Account closure's `PrismaCloudAuthRevocationAdapter` is the sole product writer of `disabledAt`, writes it once after successful revocation, and uses the injected Account `Clock` in both cloud-auth and Prisma-fallback paths. Request/principal enforcement checks the active Account closure checker first, then only `disabledAt` as durable defense-in-depth. Evidence: cloud-auth 7 files / 40 tests + direct typecheck/build/declaration scan PASS; Account 27 files / 162 unit tests + adapter 2/2; Account real DB integration 7 files / 22 tests including closure -> auth revocation + `disabledAt` + Account `Closed`; API `express-auth-closure` 4/4; physical PostgreSQL schema 1/1; database compile PASS; `git diff --check` PASS. Full API integration/typecheck remain affected by unrelated dirty-tree failures in `task-goal-host-restart` and two pre-existing API type errors; broader CI/convergence is not claimed.

## LABEL lane — execute LABEL-1301..1305

- pure registry;
- Goal assignment -> Goal owner;
- Task assignment -> Task owner;
- bulk normalized lookup;
- Instant/Clock and typed color contract.

## PORTABILITY foundation lane

### PORT-1601 — Introduce V3 envelope and PortableCapability contract

**状态：IN PROGRESS — 2026-09-10 foundation landed; production V3 cutover pending**

Add `PortableBackupEnvelopeV3` and a typed capability registration seam as the only supported portable format. Do not retain the V2 reader.

Current checkpoint: the strict V3 envelope, unique/versioned capability entries, V3 import safety parser and owner-typed `PortableCapabilityRegistry` seam are implemented. Every registered owner payload is validated through the owner-provided Zod schema at export/dry-run/apply boundaries, and host-owned identity remains outside the payload. Two real owner implementations are now available: Setting exposes `preferences@3`, and Notification exposes `notification-delivery-preferences@3`. The Notification payload deliberately contains only the stable user-owned `globalChannels + workflowOverrides` facts; device presentation/sound, identity/persistence metadata, and the current `doNotDisturb/rateLimit` fields are excluded because ADR-088 still requires QuietHours/SystemDeliveryGuard convergence before those semantics are portable. The existing full Data Portability V2 export/import path is intentionally still present until the remaining surviving owners provide V3 capabilities and the registry can cut over without deleting current Goal/Task/etc. backup coverage; therefore this ticket is not marked DONE and no full-product V3 cutover is claimed yet.

### PORT-1602 — Implement registry/coordinator/dry-run pipeline

**状态：IN PROGRESS — 2026-09-10 generic coordinator complete; first production owner registry wiring landed**

- topological capability order;
- host-owned identity;
- strict decode/validate/apply for V3;
- stable portable references;
- receipt and warning ledger.

Current checkpoint: `PortableCapabilityCoordinator` now performs dependency-ordered export/dry-run/apply, exact capability-version checks and full owner-payload prevalidation before any mutation-capable apply call. `PortableReferenceRegistry` provides operation-local capability-scoped refs without serializing source/target persistence IDs, and receipts aggregate per-owner created/updated/skipped counts plus namespaced warnings. Export output is reparsed through the V3 safety boundary so owner schemas cannot accidentally emit persistent identity, secrets or non-JSON values. API and Desktop composition roots now pass the same two stable owner capabilities (`preferences@3` and `notification-delivery-preferences@3`) into the module-owned production registry; transport handles expose owner capabilities without re-composing repositories. Product-facing `ExportUserDataUseCase`/`ImportUserDataUseCase` still run V2 until all surviving final-model owners are ready. Evidence: generic V3 contracts 7/7; registry/coordinator 12/12; Notification portable contract + owner behavior 16/16; Notification API/Electron capability-handle lifecycle tests 21/21; API/Desktop host-registry surface/composition tests 46/46; Contracts/Notification/Data Portability/API/Desktop Nx typechecks PASS; affected package builds PASS; test inventory 1225 files; `git diff --check` PASS. The remaining owner capabilities are still required before V3 can replace V2 without feature loss. No full-product V3 cutover is claimed.

### PORT-1603 — Delete V2 portability compatibility

Remove V2 reader/writer/migrator contracts and tests. Old backups are unsupported in this refactor. V3 contains only surviving owner facts.

---

# Phase 2 — Knowledge foundation and retired knowledge-like modules

## KNOW-2001 — Implement KnowledgeSpace/binding split (ADR-089)

**状态：DONE — 2026-09-11 Local/Remote binding, observation, history fence and projection checkpoint converged**

ADR-089 is now implemented as one destructive canonical cutover; no legacy connection/status/cursor compatibility model remains in production runtime code.

### Local source

- `KnowledgeSpaceId` and `LocalVaultBindingId` are explicit branded ids.
- persisted Local Vault binding is profile-owned (`localProfileId`) and contains only durable facts: `rootPath/displayName/boundAt/detachedAt`;
- filesystem state is an independent read-time `LocalVaultHealth` observation (`Available | Missing | Unreadable`);
- Local Vault ports no longer accept cloud `identityId`; the Desktop composition root injects the stable profile id;
- `getBinding()` is mutation-free; Guest -> registered profile adoption keeps the same local ownership without rewriting the Vault binding;
- legacy local binding schemaVersion 1 is unsupported and not migrated; user Vault files are never deleted.

### Remote source

The former mixed `KnowledgeRepositoryConnection` persistence has been deleted and replaced by five canonical server-side records:

```text
KnowledgeSpace
KnowledgeRemoteBinding
RemoteRepositoryObservation
RemoteHistoryFence
KnowledgeProjectionCheckpoint
```

`KnowledgeRemoteBinding` contains only the durable user choice and lifecycle (`connectedAt/disconnectedAt`). Provider facts never disconnect it. GitHub installation/repository health is written only to `RemoteRepositoryObservation`; Desktop Git history safety advances only `RemoteHistoryFence`; projection success/failure/lag is written only to `KnowledgeProjectionCheckpoint`.

Ordinary list queries are now pure database reads: opening Settings does not call GitHub and cannot mutate lifecycle. Provider refresh is an explicit command exposed through Repository service -> controller -> HTTP/IPC -> Desktop gateway -> Settings. Security-sensitive token/write/reconciliation commands still perform live provider preflight.

Desktop and Remote binding pairing is explicit: a Desktop installation intent must connect with the current Local Vault `knowledgeSpaceId`; a Web intent must not smuggle a device-local space id. Continuous sync additionally requires exact Local/Remote `knowledgeSpaceId` equality, a `Ready` provider observation and a compatible history fence. Auto-sync cache is schemaVersion 2; the old cache is unsupported.

The Prisma schema now owns `knowledge_spaces`, `knowledge_document_identities`, `knowledge_remote_bindings`, `remote_repository_observations`, `remote_history_fences` and `knowledge_projection_checkpoints`; child webhook/projection/cache/write-request foreign keys are `binding_id`, note projection `knowledge_document_id` is nullable, and write-request `knowledge_document_id` is required. The normal path is the automatic shape-guarded KNOW-2002 pre-step followed by `prisma db push`: the current ADR-090 shape is preserved as a no-op, while the obsolete pre-KNOW-2002 shape resets the rebuildable Knowledge server tables. The flat SQL helper `knowledge-remote-binding-four-axis-cutover.sql` is manual recovery/reset only, not a required normal operator step. A disposable PostgreSQL cutover test on 2026-09-11 proved that an ADR-089-shaped database containing `knowledge_write_requests` rows fails direct `prisma db push --accept-data-loss` at the required column; running that helper first drops the rebuildable write/projection state, after which the same push recreates the canonical table/columns and identity registry with zero old rows. No backfill or new compatibility machinery is added.

Server-held Data Portability disclosure mirrors these independent server facts instead of reconstructing the retired Connection status/cursor shape. No PowerSync/Desktop shadow persistence is introduced for remote Knowledge state.

**Acceptance evidence before final commit:** Repository unit 35 files / 226 tests; Repository DB integration 2 files / 17 tests; Contracts 78 files / 530 tests; Data Portability 35 files / 152 tests; Desktop Git/sync/reconciliation/auto-sync/acceptance 45/45; App-Vue Settings/Projection 26/26; API Knowledge adapters 10/10; canonical API/Desktop/App-Vue typechecks PASS; Prisma validate/generate PASS; production semantic residue gate 0; changed-file ESLint 0 warnings/errors; pre-commit docs/governance PASS. Final exact-head gates are run again at commit closure.

## KNOW-2002 — Implement stable KnowledgeDocumentId (ADR-090)

**状态：已实施 — 2026-09-11。**

`KnowledgeDocumentId` 由 `memoflow_id: kdoc_<opaque UUID>` 承载。confirmed create 在确认前冻结并在重试/revision 中复用同一 ID；未管理 Markdown 继续可读/可索引且不会被静默改写。已有笔记只通过绑定预期 blob SHA 的显式 metadata-only CAS adoption 纳入管理，generic existing-note editor 仍关闭。Local Vault 扫描不写盘，远端 rename/move 保留 ID，marker 删除/替换、重复与 identity collision fail closed 并写入 projection checkpoint failure；AI 与 Desktop PowerSync local-only index 使用同一 stable ID。Goal/Task durable relation 与 ADR-091 保持在后续 ticket。

Baseline implementation evidence (before review repair): Contracts 79 files / 533 tests; Repository 35 / 238 unit tests plus 2 / 17 integration tests; AI 79 / 426; API 67 / 346; Desktop 63 / 335 plus main 6 / 14 and IPC boundary 9 / 47; App-Vue 204 / 785; Data Portability 35 / 152; PowerSync schema 1 / 6.

Review-repair evidence (2026-09-11, final workspace): focused identity/schema suites passed for Database (1 file/4 tests), Contracts (1/3), Repository (3/25), AI (4/14), API (3/8), Desktop (3/7), PowerSync schema (1/6), App-Vue (3/18), and Data Portability (3/5). The supported Prisma validate plus `prisma-generate`/generated-client normalization flow passed; authored changed-file ESLint passed with 0 warnings/errors; sequential Contracts, Repository, AI, API, Data Portability, Database, Desktop, App-Vue, and PowerSync schema typechecks passed. Inventory, docs, governance, and `git diff --check` also passed on this final workspace. Independent review found a P0 CAS TOCTOU in `updateFileCommit()`: mutable-branch path-blob validation preceded branch-HEAD read, so a branch advance changing the same file between reads could bypass CAS; the repair freezes HEAD first, validates via immutable `?ref=<headSha>`, builds on that parent, and after a non-force ref conflict retries from a fresh HEAD with revalidation before creating new objects. URL-sensitive GitHub client regressions passed 20/20, KnowledgeNoteCommitService passed 16/16, and Repository canonical typecheck plus touched-file ESLint passed.

- namespaced `memoflow_id`;
- no silent bulk mutation;
- adoption confirmation for existing notes becoming durable refs;
- rename/move identity preservation;
- duplicate-id conflict state.

## KNOW-2003 — Single KnowledgeProjectionEngine (ADR-091)

**状态：DONE — 2026-09-11。**

`KnowledgeProjectionEngine` is now the single application-owned write path for rebuildable Knowledge note/attachment projections. Confirmed create/adopt commits, write-request replay, GitHub webhook incremental/full-snapshot ingestion, and periodic reconciliation all provide normalized source/change sets to that engine instead of writing projection repositories directly. The engine owns projection materialization, `KnowledgeDocumentId` marker validation/registration, stable-id rename/delete mutation semantics, attachment projection application, and publication of `repository:note:mutated`; AI indexing remains an independent consumer of that mutation boundary rather than being embedded in projection persistence. Adoption explicitly preserves the existing projection row id while durable `KnowledgeDocumentId` remains the product identity.

Production Prisma composition constructs one shared engine instance and injects it into both `KnowledgeNoteCommitService` and `KnowledgeRepositoryProjectionService`. A dedicated anti-resurrection surface test fails if either caller regains direct `projectionRepository`/`attachmentRepository` writes, if confirmed commits/webhook/reconciliation stop routing through the engine, or if production starts composing duplicate engine instances. The real-DB projection-ledger fixture was also updated to mirror the same shared-engine composition; this caught and closed the failure -> replay path that a unit-only seam would have missed.

**Acceptance evidence:** Repository typecheck PASS; Repository unit 37 files / 246 tests PASS; `knowledge-write-request-projection-ledger.integration.test.ts` real PostgreSQL 15/15 PASS including commit projection failure -> HTTP replay, valid/duplicate webhook, reconciliation and concurrent lease cases; Repository lint PASS with one pre-existing `index-lifecycle.spec.ts` unused-variable warning and no errors; Repository build PASS; direct production-service projection write scan reports only `knowledge-projection.engine.ts`; docs-check PASS; governance-check PASS; `git diff --check` PASS at documentation closure.

## EDITOR-1701 — Remove Editor capability from Portability V3

**状态：DONE — 2026-09-11。**

Editor is retired from both portability generations. The V2 public payload no longer accepts `data.editor`, the export selector no longer accepts `editor`, and the V2 export/import dispatch paths no longer project or recreate Editor workspaces. Because the V2 payload is strict, legacy backups containing `data.editor` fail validation explicitly instead of being silently dropped or routed through a compatibility warning/import path. V3 remains owner-capability driven; neither API nor Desktop production composition registers an Editor capability.

The PowerSync round-trip fixture deliberately keeps legacy `editor_*` source rows while proving that the exported envelope omits `workspaces` and the target import emits no writes to any Editor table. A dedicated anti-resurrection surface locks the V2 schema/selector/dispatch and both V3 production hosts. Legacy Prisma/PowerSync persistence plus dead Editor projection/importer/adapters/contracts remain intentionally staged only for `EDITOR-1702`; they are not a portability promise. Product/module-index documentation now states that retirement boundary.

**Acceptance evidence:** Contracts typecheck PASS; Contracts 79 files / 535 tests PASS; Data Portability typecheck PASS; Data Portability 35 files / 147 tests PASS; Contracts lint PASS with two pre-existing `no-explicit-any` warnings and zero errors; Data Portability lint PASS with one pre-existing `no-explicit-any` warning and zero errors; Contracts build PASS; Data Portability build PASS; active V2/V3 portability surface scan returns zero Editor references; docs-check PASS; governance-check PASS; `git diff --check` PASS at documentation closure.

## EDITOR-1702 — Drop legacy editor persistence

**状态：DONE — 2026-09-11。**

The retired Editor bounded context no longer has a persistence shadow. The four `editor_*` Prisma models and `Account` relations are deleted; generated Prisma client/schema expose no Editor delegate. PowerSync schema, API upload table/delegate maps, CRUD normalization, Desktop bootstrap tables and `docker/powersync/sync-config.yaml` all drop the same four tables in one cutover. The obsolete editor-workspace natural-key bootstrap source, Nx target, migrator step and tests are deleted, with `graph.json` updated only by the corresponding 10-line target removal.

Data Portability now has no Editor DTO, projection, importer, repository port, Prisma/PowerSync adapter or import-store write method. The residual Goal `resolveExportRef` architecture lock was renamed to Goal-only ownership, and a dedicated `editor-persistence-retirement.surface.spec.ts` prevents Prisma/PowerSync/portable persistence from being resurrected. Current product/module-index docs no longer describe Editor as a recoverable backup boundary; legacy `data.editor` remains fail-closed from EDITOR-1701.

**Acceptance evidence:** Prisma validate PASS and regenerated Prisma client contains zero `EditorWorkspace`/`editor_workspaces` references; production source scan contains zero Editor persistence/runtime references. Contracts 79 files / 535 tests PASS; Data Portability 36 / 148 PASS; PowerSync schema 1 / 6 PASS; Repository retirement locks 2 / 20 PASS; Utils dual-registry 1 / 40 PASS; API PowerSync 3 / 12 PASS; Desktop main PowerSync 3 / 6 PASS; Migrator 1 / 3 PASS. Data Portability, PowerSync Schema, Database and Migrator direct typechecks PASS; API canonical source+spec typechecks PASS; Desktop canonical typecheck PASS. Authored changed-file ESLint reports 0 warnings/errors. Data Portability, API, Migrator and Desktop production builds PASS. docs-check PASS; governance-check PASS after regenerating the test inventory; `git diff --check` PASS at commit closure.

# Parallel Governance reference lane — permanent, non-retirement

ADR-110 supersedes the earlier Governance -> Knowledge retirement plan. Governance stays as a deliberately simple but fully executable reference feature.

## GOV-1901 — Freeze executable reference-module invariants

**状态：DONE — 2026-09-11。**

Governance is now protected as an executable reference feature rather than only by ADR prose. `rule-reference-module-characterization.spec.ts` explicitly freezes the Rule DTO surface and Draft → Active → Deprecated → Active lifecycle; the existing CRUD/search/revision use-case suites remain the behavior ledger. `governance-persistence-parity.spec.ts` adds real Prisma/PowerSync mapper round-trip parity for Rule + append-only RuleRevision, equivalent blank-search behavior, and adapter query parity for code/title/description/tags + status/severity/tag filters. That gate exposed and fixed a real drift: Prisma search omitted tags and used database-default case sensitivity while PowerSync searched tags through SQLite LIKE; Prisma now includes tags and uses case-insensitive keyword matching.

`reference-module-invariants.surface.spec.ts` locks the four canonical package exports (`.`, `/api`, `/client`, `/electron`), the physical contracts/domain/application/transport/Prisma/PowerSync/UI vertical slice, API/Desktop host composers, and README/QUICK_REFERENCE synchronization. Existing transport parity and composition-root gates continue to prove common contracts validation, `GovernanceApplicationPort`, Result behavior and host-owned adapter selection. Package README, Governance QUICK_REFERENCE, product module and module index now point at the actual executable proof instead of retired layer-named seams.

**Acceptance evidence:** Governance full suite 28 files / 194 tests PASS; focused reference/persistence/transport/composition 5 / 15 PASS; API governance composer 2 / 7 PASS; App-Vue Governance focused surfaces 5 / 23 PASS (existing missing-English-locale warnings are deferred to GOV-1902 smoke-path hardening). Governance typecheck PASS and production build PASS. Authored changed-file ESLint PASS with 0 warnings/errors; test inventory regenerated to 1232 files; docs-check PASS; governance-check PASS; `git diff --check` PASS at commit closure.

## GOV-1902 — Define development-surface policy and smoke path

**状态：DONE — 2026-09-11。**

Governance remains a real routed feature in every build; only normal navigation visibility is policy-controlled. `governance-surface-policy.ts` keeps the route registered unconditionally, advertises the workbench automatically in Vite development mode, and permits an explicit production diagnostic opt-in through `VITE_ENABLE_GOVERNANCE_DEV_SURFACE=true`. Production/staging/test defaults are false. The Note shell hides the normal Governance segment when the surface is not advertised, while a direct/deep-linked `/governance/**` route still renders the active Governance segment so hidden navigation never turns the feature into an orphaned page. `governance-development-surface.surface.spec.ts` locks the router, Note shell and environment wiring together.

A real Vue workbench smoke now mounts the production Governance list/editor/detail/history views with Router, Pinia, Vue Query, production i18n and the public `GovernanceClientPort`. The stateful validated smoke service runs the user-visible list → create → detail → edit/update → revision-history flow and proves the second ledger entry is `RuleRevision` v2 / `Updated`; it does not replace or mock away the actual views/composables. During smoke hardening, `RuleEditorView.spec.ts` was corrected to use production locale messages, and `RevisionCard`, `RuleStatusBadge` and `CodeSnippetView` were moved off hard-coded Chinese strings so the English diagnostic workbench no longer renders a mixed-language history/status surface.

**Acceptance evidence:** App-Vue Governance + i18n focused suite 9 files / 36 tests PASS, including the complete create → update → revision smoke, surface-policy unit tests, wiring anti-drift lock and locale key completeness. App-Vue canonical `vue-tsc` PASS after rebuilding required workspace declarations; App-Vue production build PASS. Authored changed-file ESLint PASS with 0 warnings/errors; test inventory regenerated to 1235 files; docs-check PASS; governance-check PASS; `git diff --check` PASS at commit closure.

**Protected:** package/API/IPC/persistence/UI remain real; production navigation visibility is policy, not ownership.

## GOV-1903 — Add deterministic published rule-bundle boundary

**状态：DONE — 2026-09-11。**

Governance now exposes an explicit read-only publish boundary instead of requiring engineering tooling to inspect the live Rule database. `GovernanceRuleBundle` schema version 1 contains only Active rules, stable provenance (`ruleId`, `authorId`, created/updated timestamps, revision count and nullable latest revision), real engineering metadata (`ruleKey`, Rule severity/tags/reference path), and normalized good/bad examples. The semantic payload intentionally has no export wall-clock timestamp or machine identity. Rules, tags, examples, revision fields and JSON object keys use locale-independent deterministic ordering; SHA-256 is calculated over the canonical `{ kind, schemaVersion, rules }` payload and returned as `sha256:<64hex>`.

`ExportGovernanceRuleBundleUseCase` reads Rule/RuleRevision repositories only and performs zero persistence writes. The same application port is exposed through authenticated `GET /governance/rules/bundle`, `governance:rule-bundle:export` IPC and `GovernanceClientPort.exportRuleBundle()`. Transport-specific code never computes the hash or reads Prisma/PowerSync directly. Existing seeded Active rules are allowed to have `revisionCount: 0` / `latestRevision: null`; provenance is never fabricated. During implementation the bundle contract exposed an existing invalid seed default (`authorId = governance-seed`); the system seed now uses deterministic UUID `00000000-0000-4000-8000-000000000001`, preserving the existing IdentityId contract instead of weakening the bundle schema.

**Acceptance evidence:** Contracts typecheck PASS and full suite 80 files / 537 tests PASS; Governance direct typecheck PASS, full suite 30 / 199 PASS and production build PASS. Determinism tests prove identical bundle/hash under different Rule/Revision repository ordering, hash changes on published semantic changes, Active-only reads, nullable zero-revision provenance and zero writes. HTTP route, HTTP client, IPC client and Electron handler are locked to the same bundle contract/channel; GOV-1902 Vue create/update/revision smoke remains 1/1 PASS after the client seam expansion. Authored changed-file ESLint PASS with 0 warnings/errors; test inventory regenerated to 1238 files; docs-check PASS; governance-check PASS after satisfying Governance bilingual/public JSDoc requirements; `git diff --check` PASS at commit closure.

**Acceptance:** same Governance state + same bundle schema version produces the same semantic bundle/hash.

## GOV-1904 — Bridge Governance rules to engineering check/report/autofix adapters

Add an explicit adapter from a pinned/versioned rule bundle into `tools/governance`-style check/report/autofix proposal flows. CI must consume a repository-versioned or otherwise pinned snapshot, never a developer's live Rule DB. Autofix produces reviewable diffs/proposals rather than silently changing product source.

**Hard guards:**

- never migrate Rule/RuleRevision to Knowledge as replacement truth;
- never place `packages/governance` or Governance contracts in retirement manifests;
- repository engineering governance remains deterministic and independently runnable.

---

# Phase 3 — Goal and Task convergence

## GOAL lane — execute GOAL-7202..7211

Use Goal active plan as scoped detail. Hard dependency: KnowledgeDocumentId before durable Note relations.

Core outputs:

- lifecycle Planned/InProgress/Completed/Abandoned;
- GoalTimeframe target, no fake due/overdue;
- KR Measurement V3;
- Goal Brief as Knowledge;
- shared Labels/Relations;
- Goal Workspace read model;
- AI GoalPlanDraft V2 contract.

## TASK lane — continue Task plan from clean checkpoint

Resume only after Time/Label owner seams are ready. Continue from the existing TaskPlan/TaskOccurrence/schedule checkpoint, not from legacy templates.

Core outputs:

- Plan no longer owns occurrence collection;
- occurrence/result/checklist truth;
- reminder persistence parity;
- statistics read model;
- Goal link contribution semantics;
- Workspace composition.

---

# Phase 4 — Routine, Planner/Scheduler and Notification

## ROUTINE-2201 — Replace Legacy Reminder with Routine

Implement ADR-076~079:

- Definition/Profile/Trigger/RuntimeContext/TemporaryOverride;
- WallClock/Elapsed/ActiveUsage;
- Occurrence + Interaction;
- preserve reliability/fencing behavior through characterization while changing the model;
- delete ReminderTemplate/Group/Instance/Response storage/contracts in the same coordinated cutover; no row converter.

## PLAN-2301 — CalendarEntry vNext

Implement ADR-080:

- Timed/AllDay range;
- remove duration/conflict/priority truth;
- occupancy projection;
- cross-source conflict read model;
- update Goal/Task/Routine projections.

## SCHED-2302 — ScheduledInvocation + InvocationAttempt

Implement ADR-081~083 while preserving SchedulingPort/reconcile and runtime reliability.

Delete legacy ScheduleTask/config/source-module in the canonical Scheduler cutover once reliability behavior tests are green. No legacy row conversion.

## NOTIF-2401 — NotificationFact + Inbox lifecycle

Implement ADR-084/085:

- immutable content snapshot;
- readAt/archiveAt;
- WorkflowDefinition registry;
- tone/entity ref cleanup;
- retire template/category/type duplication.

## NOTIF-2402 — Delivery/Interaction boundary

Implement ADR-086~088:

- remove NotificationChannel aggregate truth;
- keep decision + outbox/receipt execution truth;
- typed action intents + Interaction;
- QuietHours with Product Time;
- product vs operations port split.

---

# Phase 5 — Home/Dashboard retirement and AI alignment

## HOME-1801 — Goal-owned progress summary

Add the minimum Goal read model required by TodayOverview and Goal capsule preview. Use Goal vNext lifecycle/target semantics; no `dueDate` compatibility in new contract.

## HOME-1802 — Replace Home Dashboard client

TodayOverview widgets consume owner services directly. Remove `useDashboard()` from Home/Goal capsule.

## HOME-1803 — Replace AI Dashboard analytics dependency

`ControlledAnalyticsReadAdapter` and Desktop equivalent compose explicit Goal/Task/Knowledge/activity read ports. Remove DashboardData cast.

## HOME-1804 — Decide ActivityLedger by evidence

If direct current product value exists, move to a narrow ActivityFeed capability; otherwise delete recorder/table. No generic analytics domain is invented.

## HOME-1805 — Hard-delete Dashboard

Remove package/contracts/API/IPC/Vue module/DashboardConfig/PowerSync mappings and delete the `/dashboard` compatibility redirect/tests.

## AI lane — execute AI-9602..9612 after owner contracts stabilize

Critical order:

- Conversation shell/Mastra authority;
- provider secret/model capability;
- ContextAssembler + UserTimeContext;
- Goal/Task/Routine owner contract alignment;
- stable KnowledgeDocumentId index;
- execution record cleanup;
- UI shadow workflow state removal;
- final eval/ops review.

---

# Phase 6 — Portable V3 owner registration and destructive residue deletion

## PORT-1610 — Implement owner capabilities for all surviving product facts

Each module registers its canonical V3 portable capability. No central persistence-shaped clone.

## PORT-1611 — Assert V3-only portability surface

Delete any remaining V1/V2 reader/writer/migrator code, old mini repository ports and compatibility fixtures. Only V3 owner capabilities remain.

## CLEAN-2601 — Whole-schema legacy sweep

Delete only after capability cutovers:

- old Repository/Folder/Resource tables;
- old Reminder tables;
- old ScheduleTask/Statistic models;
- NotificationTemplate/History/Channel legacy models;
- AI legacy quota/generation/message rows as approved by AI characterization;
- Account settings/contact residue;
- any orphan Dashboard/Editor schema. Governance schema is permanent reference-feature state and is not a deletion candidate.

Prisma + PowerSync parity is mandatory in the same batch.

---

# Phase 7 — Unified closure

## SYS-3001 — Cross-domain model review

Re-run the ownership matrix against actual code. Search for all retired vocabulary and forbidden imports. Every exception requires owner + reason + retire-by.

## SYS-3002 — Five-layer batch review

1. contract correctness;
2. vertical completeness;
3. behavioral completeness;
4. engineering quality;
5. plan/document truth.

Repair all P0/P1/P2 before delivery.

## SYS-3003 — Full validation

At minimum:

```bash
pnpm test:inventory
pnpm docs:check
pnpm governance:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Plus affected integration/E2E, PowerSync parity, fresh Prisma bootstrap/reset checks, local Docker product journeys, AI eval replay, and exact-head CI.

## SYS-3004 — Documentation truth and plan archive

- current product module docs describe actual implementation;
- target notices removed once code is canonical;
- completed module active plans archived;
- this system-wide plan archives only after exact-head required CI and final review are green.

## 5. Parallelism / single-writer matrix

| Lane           | Can parallel with           | Must not share writer with                                           |
| -------------- | --------------------------- | -------------------------------------------------------------------- |
| Time           | Label, portability skeleton | Setting regional contracts, Task schedule contracts during same edit |
| Label Registry | Time, Auth                  | Goal/Task assignment schema cutover                                  |
| Account/Auth   | Time, Portability skeleton  | Setting preference contract cutover                                  |
| Knowledge      | Account/Auth                | AI index schema                                                      |
| Goal           | Routine foundation          | Task shared relation/contracts without coordination                  |
| Task           | Routine foundation          | Goal shared link/contracts without coordination                      |
| Scheduler      | Notification                | Planner shared schedule contracts                                    |
| Notification   | Scheduler                   | Routine intervention contracts without coordination                  |
| Governance     | most owner-domain lanes     | tools/governance adapters while SYS governance manifests are edited  |
| AI             | Home cleanup                | owner workflow DTOs until owner contracts frozen                     |
| Portability    | most lanes                  | owner contract/schema edits in the same batch                        |

## 6. Rollback strategy

- each destructive batch starts from a clean commit/checkpoint;
- rollback means source/deployment rollback plus database reset/reseed, not runtime compatibility code;
- Prisma and PowerSync canonical parity must land in the same coherent batch;
- if a vertical journey fails after cutover, revert the coherent batch and recreate persistence from the prior source revision; never revive a second permanent truth.

## 7. Immediate next tickets

TIME-1204..1206, LABEL-1301..1305 and `SETTING-9207..9209` are complete. Current dependency-ready work is:

1. `SETTING-9210` — five-layer review, exact-head CI/build, docs integrity and Setting plan archive;
2. continue `PORT-1601/1602` surviving owner capability registration, then execute `PORT-1603` only when V3 can replace the production full-backup path without reducing current business-data coverage;
3. in parallel where file ownership is disjoint, continue Knowledge foundation before Goal/Task durable note relations.

`SETTING-9209` deliberately kept the current V2 full-backup envelope's `settings` singleton as a strict canonical UserPreferenceProfile adapter while deleting all legacy Setting persistence/protocol/client code. Therefore PORT-1603 remains independent cross-module work rather than a reason to retain `user_settings`.
