---
tags:
  - adr
  - ci
  - cd
  - release
  - deployment
  - desktop
description: ADR-066 - 采用 MemoFlow Delivery Platform V3 与跨平台 build-once/promote-many 交付模型
created: 2026-09-02T16:15:00+08:00
updated: 2026-09-06T13:08:00+08:00
---

# ADR-066: Adopt MemoFlow Delivery Platform V3

**状态：** 已采纳并实施完成
**日期：** 2026-09-02  
**影响范围：** GitHub Actions、Nx、Desktop、Docker、GCP Staging、Alibaba Production、Release Please、仓库治理

## 1. Context

MemoFlow CI/CD V2 已建立 exact-SHA CI、versioned delivery manifest、stable Oracles、artifact manifest、双 Registry digest parity、Draft-first release 与 digest-pinned production runbook。它仍存在 Desktop scope 误选、staging 非 canonical、server release 重建和 production selection 手工化等缺口。

BodySense Delivery Platform V3 已真实验证 exact-SHA candidate、coherent staging channel、build-once/promote-many、Release Publish 与 Deploy Production 权限分离，以及 fail-closed staging/production watcher。

MemoFlow 同时拥有 BodySense 没有的复杂边界：

- Windows/Linux/macOS Desktop packages and updater metadata;
- Web/API/Migrator server artifact set;
- PowerSync runtime compatibility;
- ACR + GHCR dual distribution;
- large Nx monorepo and four-shard Web E2E;
- GitHub App production integration.

因此应吸收已验证机制，而不是复制另一项目的 workflow 文件。

## 2. Decision

### 2.1 One source truth, several artifact channels

`main` remains the only long-lived source integration truth.

```text
main HEAD             source truth
sha-<revision>        immutable server candidate
staging-latest        latest coherent validated main candidate
vX.Y.Z                immutable Published Release
prod-latest/desired   explicitly selected production release set
runtime deploy state  actually running release and digests
```

Staging and production are artifact projections, not Git branches.

### 2.2 Delivery Manifest V2 owns scope once

The detector classifies changes into explicit risks:

```text
docs, desktop, web, server, database, contract, runtime, release, root
```

and logical lanes:

```text
governance, quality, database, desktop, web-experience, packaging, full
```

Unknown or ambiguous changes upgrade to safer/full execution. Main pushes remain exhaustive.

### 2.3 Stable Oracles remain protected contracts

The initial migration preserves existing required contexts:

```text
Governance Oracle
Validate Oracle
Boundary Oracle
Integration Oracle
Web Flow Oracle
Coverage Oracle
Performance Oracle
Delivery Observation
```

New child jobs may be introduced or consolidated, but branch rules do not depend on dynamic matrix names. An Oracle passes only when every enabled child exists and succeeds; skipped/missing/cancelled enabled children fail closed.

### 2.4 Successful main CI creates the server candidate

After full exact-SHA main CI succeeds, Candidate Publish:

1. consumes the exact CI delivery manifest and verified build closure;
2. builds Web/API/Migrator OCI images once;
3. pushes immutable SHA identities to ACR and GHCR;
4. verifies OCI revision labels and registry digest parity;
5. emits a canonical `memoflow.candidate-set/v1` manifest;
6. promotes all components to `staging-latest` only when the candidate is still current main.

A component may not be independently promoted.

### 2.5 Canonical staging is watcher-owned

GCP staging watcher:

- accepts only the configured `staging-latest` channel;
- rejects mixed component revisions/digests;
- extracts versioned non-secret runtime files from a trusted runtime artifact;
- keeps secrets in host-owned external env files;
- runs migrator first;
- updates API then Web and validates PowerSync compatibility;
- resolves reviewed PostgreSQL / Redis / PowerSync mirrors from the candidate runtime contract to exact digests rather than host-stored mutable pins;
- records exact source revision, component digests and deployment time atomically;
- leaves the previous runtime available for bounded rollback.

Manual source-build staging remains diagnostic/emergency only and is not release evidence.

### 2.6 Release publication promotes Server candidates, builds Desktop per platform

Server release artifacts are promoted from the exact candidate digest; source is not rebuilt.

Desktop artifacts remain release-time builds because they are platform-specific and may require signing/notarization credentials. The required platform set is:

```text
Windows x64
Linux x64
macOS Intel x64
macOS Apple Silicon arm64
```

The canonical release manifest binds both:

- promoted Server digests;
- Desktop asset hashes/platform/architecture/signing state.

Draft Release becomes Published only after every required platform and server component passes postflight.

### 2.7 Prepare Release is automatic after successful main CI

Release Please is triggered by successful `CI` workflow completion on `main`, with manual dispatch retained for recovery. It prepares/updates version files, CHANGELOG and Release PR only.

It must not:

- create/move tags;
- create/publish GitHub Release;
- publish images;
- mutate staging/production.

### 2.8 Production selection and runtime mutation are separate authorities

`Deploy Production(vX.Y.Z)` validates Published Release, exact tag SHA, canonical manifest, successful source CI and immutable digests. It selects/promotes the coherent release set.

Alibaba watcher owns:

```text
lock
→ preflight
→ backup
→ migrator
→ schema acceptance
→ API/Web rollout
→ PowerSync/external health
→ deployment state commit
→ safe rollback or BLOCKED
```

GitHub Actions does not SSH into production to perform ad-hoc Compose mutation.

### 2.9 External Actions are SHA-pinned

All third-party GitHub Actions are pinned to reviewed 40-character commits with an adjacent version comment. Tags are documentation, not execution identity.

## 3. Protected contracts

1. `main` remains the sole permanent source branch.
2. PR workflow cannot publish artifacts or mutate staging/production.
3. Main pushes retain full validation during and after optimization.
4. Existing protected Oracle names remain stable until a separate ruleset migration.
5. Build/release/deploy identities are exact SHA plus content/OCI digest.
6. Release Publish remains Draft-first and resumable.
7. ACR and GHCR immutable image digests must match.
8. API and Migrator are one compatibility unit; Migrator runs first.
9. Production does not trust `prod-latest` without release-manifest proof.
10. Desktop release cannot silently omit a required platform.
11. Unsigned/unnotarized artifacts are explicitly represented; absence of credentials must not masquerade as signed release.
12. GitHub App, database and environment secrets remain outside artifacts and repository evidence.

## 4. Consequences

### Positive

- Desktop-only PRs stop paying for unrelated Web E2E;
- staging becomes a trustworthy exact-main environment;
- server artifact identity is preserved from staging through release and production;
- release PRs are maintained automatically without coupling release publication to every push;
- Windows/Linux/macOS distributions share one audited release manifest;
- production selection is reviewable and runtime mutation remains fail closed;
- action supply-chain drift is reduced.

### Cost

- Candidate publication adds ACR/GHCR storage and main-CI follow-up time;
- GCP and Alibaba watchers require explicit installation/configuration;
- macOS runners add release cost;
- Apple signing/notarization needs credentials and a separate trust decision;
- migration requires shadow metrics and several independently merged phases.

## 5. Rejected alternatives

### A. Keep manual staging and manual SSH production

Rejected as the target architecture. The runbook is safe but cannot provide durable artifact-channel/deployment evidence.

### B. Build Server images again for every release

Rejected. Same source SHA does not prove the same OCI artifact. Release must promote the validated candidate digest.

### C. Build Desktop packages on every main push

Rejected. Cross-platform hosted runners are expensive and Desktop binaries are not required to validate every server change. PR/main use Desktop quality and packaging smoke; full installers are release-time.

### D. Automatically deploy every Published Release to production

Rejected. Publication and production selection are distinct product/operations decisions.

### E. Use one large workflow job with no logical lanes

Rejected. Physical job consolidation may reduce runner overhead, but logical evidence, fail-closed Oracles and independent lane observability must remain.

## 6. Rollout

Implementation completed under the archived plan `docs/plan/archive/2026-09-02-delivery-platform-v3.md`. V3 is now the canonical candidate/staging/release/production authority; the historical V2/manual production path is emergency recovery context only. The accepted production proof is v0.13.3 with exact production-set/control-artifact identity and watcher-owned idempotent `DEPLOYED` state. Trusted-public macOS signing remains an explicit future credentialed policy activation; it is not required to keep the implemented V3 server/unsigned-pilot authority canonical.
