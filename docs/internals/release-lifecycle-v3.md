---
tags:
  - architecture
  - release
  - deployment
  - desktop
description: MemoFlow Release Lifecycle V3，覆盖自动 Release PR、Server candidate promotion 与跨平台 Desktop 资产
created: 2026-09-02T16:15:00+08:00
updated: 2026-09-05T13:05:00+08:00
---

# MemoFlow Release Lifecycle V3

> Status: ADOPTED / IMPLEMENTING under ADR-066.

## 1. Authority boundaries

```text
Prepare Release   decides and prepares version metadata
Release Publish   publishes immutable Server/Desktop artifacts
Deploy Production selects a Published Release for runtime rollout
Runtime Watcher   mutates production safely
```

These authorities remain separate.

## 2. Prepare Release

### Trigger

- successful `CI` workflow completion for a `push` to `main`;
- manual `workflow_dispatch` for retry/reconciliation.

### Effect

Release Please may:

- calculate next semantic version from conventional commits;
- update root/Desktop version identity;
- update `.release-please-manifest.json`;
- update `CHANGELOG.md`;
- create/update the Release PR.

### Non-effects

It never creates tags, GitHub Releases, OCI images, staging pointers or production state.

## 3. Release PR

The Release PR is an ordinary protected PR. Its merge SHA must pass full main CI. The Release PR may move while new development merges; release-please updates the same pending PR rather than creating one per commit.

## 4. Release candidate resolution

The automatic publication trigger is a successful `Publish Main Candidate` completion for `main`, not raw CI completion. This orders the lifecycle as:

```text
successful exact-SHA main CI
        ↓
Publish Main Candidate
        ↓
validated candidate-set/v1
        ↓
Release Publish
```

Manual `workflow_dispatch` remains recovery-only. In both automatic and manual paths, Release Publish independently resolves the exact successful `ci.yml` push run and requires it to match the candidate-set identity.

Release Publish is eligible only when it can prove:

1. exact SHA belongs to `main`;
2. exact successful main CI exists;
3. release commit/version/CHANGELOG identities agree;
4. exact server candidate manifest exists for the SHA;
5. candidate images pass ACR/GHCR digest parity;
6. no immutable tag/release identity collides;
7. required Desktop platform policy is known.

## 5. Draft-first publication

Release Publish first creates or resumes:

```text
vX.Y.Z immutable Git tag
Draft GitHub Release
```

A failed Server promotion, Desktop platform, manifest or postflight leaves the Release Draft and resumable.

## 6. Server artifact promotion

For Web/API/Migrator:

```text
candidate sha-<revision>@digest A
                ↓ carbon-copy promotion
release vX.Y.Z@digest A
```

The release workflow must not rebuild source. Before any release-tag mutation, it validates every China/global candidate tag and fails if an existing release or immutable release tag points to another digest. Promotion uses exact `repository@sha256` inputs with single-manifest carbon-copy semantics, then re-verifies both release tags against the candidate digest. A top-level digest change caused by an OCI wrapper/index is a failure unless a narrowly defined one-member wrapper recovery proves the child digest is the expected candidate digest.

## 7. Cross-platform Desktop publication

### 7.1 Required matrix

```text
windows-x64
linux-x64
macos-x64
macos-arm64
```

Each build checks out the exact release SHA, installs the frozen lockfile, builds the Desktop graph, packages on a native runner, emits platform evidence, and uploads immutable workflow artifacts.

### 7.2 Signing policy

Initial V3 pilot state:

- Windows: existing unsigned/publisher-unknown behavior retained unless signing credential is present;
- Linux: unsigned package hashes are canonical;
- macOS: unsigned/unnotarized artifacts may be used for internal/manual installation only and must be marked `signingState=unsigned-pilot`.

Production-grade macOS manual-download distribution uses an explicit credentialed gate. Release Publish reads `MACOS_RELEASE_MODE` (default `unsigned-pilot`); the only trusted-public value is `signed-notarized`. Signed mode requires a Developer ID Application certificate plus App Store Connect API-key credentials and fails closed if any required input is absent or malformed.

```text
Developer ID Application certificate
+ hardened-runtime app signing
+ app notarization + staple
+ Developer-ID-signed DMG
+ final-DMG notarization + staple
+ independent codesign/stapler/Gatekeeper verification of app + DMG
+ architecture proof
= signed-notarized platform receipt
```

The trust receipt is self-digested and bound into the Desktop platform evidence; canonical manifest construction revalidates it. No workflow may silently fall back from requested signed mode to unsigned output. Current GitHub configuration has no Apple credentials, so the active policy remains `unsigned-pilot`. macOS updater/feed readiness remains separate from trusted manual-download signing.

### 7.3 Asset identity

File names include platform and architecture to prevent matrix collisions. The Desktop manifest records:

```json
{
  "schemaVersion": 2,
  "kind": "desktop-release",
  "tag": "v0.12.0",
  "gitSha": "...",
  "requiredPlatforms": ["windows-x64", "linux-x64", "macos-x64", "macos-arm64"],
  "platforms": {
    "macos-arm64": {
      "signingState": "unsigned-pilot",
      "assets": []
    }
  },
  "assets": []
}
```

Every asset includes SHA-256 and size. Publication fails if a required platform is absent, has duplicate names, or produces no installer/archive.

### 7.4 Update metadata

Windows and Linux continue to publish their current updater metadata. macOS updater metadata is not considered production-ready until signing/notarization and architecture-aware feed behavior are explicitly validated. Pilot macOS artifacts are manual-download packages.

## 8. Canonical release manifest

`release-manifest.json` binds:

- release tag/version/SHA;
- source main CI run and delivery manifest digest;
- server candidate manifest digest;
- Web/API/Migrator image digests and both distributions;
- Desktop manifest digest and platform coverage;
- signing state;
- postflight result.

Draft becomes Published only when all required identities and assets are present.

## 9. Production selection

`Deploy Production` is an explicit `workflow_dispatch` authority gated by the GitHub `production` Environment and `main` branch policy. It accepts an immutable Published Release tag only. Before mutation it revalidates tag -> SHA, source main CI, candidate-set, ACR/GHCR application digest parity and the runtime mirror digests owned by the exact release SHA.

It creates `memoflow.production-set/v1`, which binds release SHA/tag, candidate and delivery-manifest identity, exact application/runtime digests, and the current `controlPlaneSha`. The selector builds only `memoflow-production-runtime`, then moves one `production-selected` control pointer. It does not rebuild Web/API/Migrator, move their tags independently, run SSH commands, or mutate Compose on the runtime host.

Alibaba consumes that control artifact with `deployment/production/production-deploy-watch.sh`. The canonical production compose contains no Watchtower or mutable application fallback. Runtime mutation remains a host-owned transaction with backup, migrator-first rollout, health verification, atomic state, pre-migration restore and post-migration `BLOCKED` semantics.

## 10. Rollback

- Published Releases and immutable tags are never rewritten.
- Server rollback selects a previous compatible Published Release manifest.
- Desktop rollback means publishing a newer corrective version; existing installers remain immutable.
- Runtime watcher may restore the previous release only when migration/schema policy proves compatibility; otherwise it records BLOCKED for operator action.
