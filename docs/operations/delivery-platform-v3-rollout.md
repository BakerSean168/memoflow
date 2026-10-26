---
tags:
  - runbook
  - ci
  - cd
  - release
  - deployment
description: MemoFlow Delivery Platform V3 渐进切换、验证、回滚与事故处置手册
created: 2026-09-02T16:15:00+08:00
updated: 2026-09-02T16:15:00+08:00
---

# Delivery Platform V3 Rollout Runbook

## 1. Safety rule

V3 is introduced beside V2. Do not delete a V2 authority until the corresponding V3 transition has real evidence.

```text
code present != workflow proven
workflow green != artifact promoted
artifact promoted != staging deployed
release Published != production selected
production selected != runtime healthy
```

## 2. Phase 1 rollout

### Preflight

- branch starts from current `origin/main`;
- canonical main worktree remains clean;
- no Release PR or release workflow is manually edited during migration;
- required check names are unchanged;
- release signing policy is recorded.

### CI scope validation

Run historical fixtures:

```text
Desktop/Electron-only  → desktop=true, web=false
Web-only               → web=true
shared UI/contract     → desktop=true, web=true when required
migration              → database/integration
CI/Docker/release      → full
main push              → full
```

Inspect the PR delivery manifest artifact before merging.

### Cross-platform release dry contract

Before publication:

- workflow YAML and matrix tests pass;
- macOS artifacts use architecture-specific names;
- Desktop manifest validation fails when one platform directory is absent;
- unsigned pilot state is visible;
- Draft release upload remains centralized.

## 3. First cross-platform release

1. Merge V3 Phase 1 PR after all current required checks pass.
2. Confirm exact main CI success.
3. Confirm Prepare Release creates/updates the next Release PR.
4. Review version and CHANGELOG; merge Release PR.
5. Observe exact release merge SHA CI.
6. Observe `Publish Main Candidate` complete successfully for that exact SHA and retain `candidate-set-<SHA>`.
7. Observe Release Publish start only after candidate publication, then create/resume the Draft Release.
8. Verify platform child jobs:
   - Windows x64;
   - Linux x64;
   - macOS x64;
   - macOS arm64.
9. Verify `candidate-set-v1.json`, `docker-release-manifest.json`, `desktop-release-manifest.json` and `SHA256SUMS.txt` before publication.
10. Confirm release Web/API/Migrator tags preserve the exact candidate digests in both ACR and GHCR.
11. Confirm Published Release/tag SHA identity and asset coverage.
12. Do not deploy production solely because the Release is Published.

### macOS trusted-public activation

Default policy is `unsigned-pilot`. Do not describe these macOS assets as Gatekeeper-ready public distribution. To activate `signed-notarized` for a future release:

1. provision repository/environment secrets `MACOS_CSC_LINK`, `MACOS_APPLE_API_KEY_P8`, `MACOS_APPLE_API_KEY_ID`, `MACOS_APPLE_API_ISSUER` and, when needed, `MACOS_CSC_KEY_PASSWORD`;
2. set repository variable `MACOS_RELEASE_MODE=signed-notarized`;
3. verify both x64 and arm64 lanes pass credential preflight, app signing/notarization, final-DMG notarization, trust verification and packaged runtime smoke;
4. inspect each embedded `macos-trust-receipt`: app + DMG Gatekeeper source must be `Notarized Developer ID`, their Developer ID authority must match, the app must prove hardened runtime and the expected architecture;
5. publish only after the canonical Desktop manifest contains `signingState=signed-notarized` for both macOS identities.

If trusted distribution is not being activated, leave `MACOS_RELEASE_MODE` unset (or explicitly `unsigned-pilot`) and keep the pilot labeling. Do not create placeholder Apple secrets.

### Failure handling

- platform build failure: leave Draft; fix code/workflow in a new PR; retry the same Draft only if release SHA remains valid;
- duplicate/missing asset: do not manually upload around validator;
- Git tag collision: stop; immutable tag must never move;
- Server release-tag digest collision: stop before promotion; never overwrite a tag that points to a different candidate digest;
- missing/expired candidate-set or candidate/main-CI mismatch: do not rebuild Server images; keep/resume the Draft only after the exact candidate evidence is restored;
- requested `signed-notarized` mode with missing/invalid Apple credentials, non-Accepted notary result, missing staple, Developer ID drift or Gatekeeper rejection: leave Draft and fail closed; never downgrade that run to unsigned;
- unsigned macOS policy mismatch: stop rather than dropping the platform silently.

## 4. Candidate/staging cutover

### Shadow

Candidate Publish first builds immutable SHA images and manifest without moving `staging-latest`.

Acceptance:

- CI source SHA is exact successful main;
- ACR/GHCR digests match;
- candidate manifest validates;
- repeated execution reuses or confirms the same immutable identity.

### Channel enablement

`Publish Main Candidate` is triggered only by a successful `CI` push run on `main` (manual dispatch is recovery-only and revalidates the exact successful CI run). It publishes immutable candidates first, rechecks current `main` immediately before mutation, and only then moves the coherent ACR/GHCR `staging-latest` channel. A stale but valid candidate remains available by `sha-<full SHA>` and skips channel promotion.

### Watcher installation

Install GCP user service/timer from `deployment/staging/` with:

- `deployment/staging/install-staging-deploy-watch.sh`;
- host-owned non-secret `~/.config/memoflow/staging-channel.env`;
- external `~/.config/memoflow/staging.env` secret file;
- dedicated state/runtime directories;
- host-owned Docker credentials for the configured distribution (`global`/GHCR on GCP staging);
- lock and bounded health timeouts;
- `~/.local/bin/memoflow-staging-deploy-watch --check-only` before timer enablement.

The runtime OCI artifact embeds the exact candidate manifest, reviewed `runtime-image-mirrors.json`, and versioned Compose/PowerSync/watcher files. The watcher deploys `repository@sha256:...` refs rather than mutable channel tags. PostgreSQL, Redis and PowerSync runtime dependencies are resolved from that candidate-bound mirror contract, not from host image pins.

**PowerSync migration compatibility:** never downgrade a staging/production database to a PowerSync image older than the migration history already recorded in its storage. The 2026-09-05 GCP cutover proved this fail-closed behavior when a stale 1.20.4 mirror encountered migration `1784900000000-source-metadata` written by 1.25.0. Do not delete migration history to bypass this guard; advance the reviewed runtime mirror instead.

### Staging acceptance

Record:

```text
main SHA
candidate manifest digest
Web/API/Migrator digests
migration result
API/Web/PowerSync health
public/private ingress result
deploy-state content
```

Pre-migration failure restores the previous exact runtime automatically. Once Migrator succeeds, an uncertain rollout records `BLOCKED` rather than performing a blind schema rollback. Never rebuild locally under an existing candidate identity. The historical source-build staging stack is emergency/diagnostic only and is not release evidence after cutover.

## 5. Production cutover

Repository implementation and the first canonical Published-release rollout are accepted. Keep these steps as the required procedure for subsequent production selections.

1. Confirm GitHub Environment `production` still allows only `main`.
2. Publish the real release under test; do not create a synthetic release solely for deployment acceptance.
3. Dispatch `Deploy Production` with that Published tag. The resolve lane must prove tag/SHA, source main CI, candidate-set, ACR/GHCR application parity and release-owned runtime mirror digests.
4. Confirm the selector created one `memoflow.production-set/v1` and moved only `memoflow-production-runtime:production-selected`; Web/API/Migrator tags are not a deployment channel.
5. Install `deployment/production/install-production-deploy-watch.sh` on Alibaba as root. Leave the timer disabled.
6. Run `/usr/local/bin/memoflow-production-deploy-watch --check-only`; it must report one coherent release/set without mutating containers.
7. Preserve current runtime evidence, then run `systemctl start memoflow-production-deploy-watch.service`. The watcher must take a non-empty PostgreSQL backup before Migrator starts.
8. Verify `production-deploy-state`, exact container image refs and migration result. The host watcher must validate API/Web/PowerSync through the canonical HTTPS Host/SNI routes forced to local Caddy (`--resolve <host>:443:127.0.0.1`) so the transaction is independent of Alibaba public DNS/hairpin behavior. Then verify true public ingress, GitHub App and PowerSync product flows from an independent external host (GCP Dev during acceptance).
9. Run the service again and prove idempotent `already deployed` behavior without rerunning Migrator.
10. Only then run the installer with `--enable` and verify the timer is enabled/active.

**First canonical production acceptance — 2026-09-06**

- Release: `v0.13.3 -> 4e24cffd64b2255a188d28dbe37308a1e2a3fe3a`;
- control plane: `64521cf122753a23c0d954b2a7c46a65b93ba028`;
- selector: `34005198389`; production-set `sha256:2ea3a1127ffc179e4f24deb1d518246a7f9522bbe4a2801e7ed6c8647f1ae0ae`; control artifact `sha256:4d9b493f41c330dd31fc6ecb183d8cc165851ab38cd226ed6da4daf0943175fa`;
- live host: guarded recovery verified `runtime.prev` against all six live long-running services, took a new PostgreSQL backup, completed the offline Migrator, converged API -> PowerSync -> Web -> Caddy and committed `status=DEPLOYED`;
- replay: `already deployed`, no additional backup, no Migrator rerun, deployment state unchanged;
- independent public acceptance: after one retained transient Web timeout, three GCP rounds passed API/Web/PowerSync 9/9 HTTP 200;
- timer: enabled/active; the first Persistent catch-up invocation returned `already deployed` and the timer scheduled the next two-minute run.

The selector is not a runtime writer. It never SSHes into Alibaba. The historical `/opt/memoflow/docker-compose.prod.yml` is first-cutover rollback evidence/emergency tooling only; `deployment/production/` becomes canonical runtime authority after acceptance.

## 6. Rollback / block policy

| Failure point                                     | Action                                             |
| ------------------------------------------------- | -------------------------------------------------- |
| before candidate promotion                        | no runtime impact                                  |
| staging pre-migration                             | keep current staging                               |
| staging post-migration                            | restore only when schema compatibility is proven   |
| release pre-publish                               | keep Draft                                         |
| production pre-migration                          | restore previous selected release                  |
| production post-migration, compatible             | restore previous app set and verify                |
| production post-migration, uncertain/incompatible | mark BLOCKED; preserve evidence; operator decision |

## 7. Evidence closeout

A phase is complete only when repository tests, GitHub workflow run, artifact identities and runtime state all agree. Record exact IDs in the owning GitHub Issue/PR and infrastructure SSOT. Keep this runbook for repeatable operator steps; do not create repository task-plan files.
