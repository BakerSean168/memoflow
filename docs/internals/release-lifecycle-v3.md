---
tags:
  - architecture
  - release
  - deployment
  - desktop
description: MemoFlow Release Lifecycle V3，覆盖定时 Nightly、人工 Stable 晋升、Server digest promotion 与跨平台 Desktop 资产
created: 2026-09-02T16:15:00+08:00
updated: 2026-10-26T13:00:00+08:00
---

# MemoFlow Release Lifecycle V3

> Status: ADOPTED / IMPLEMENTING under ADR-066.

## 1. Authority boundaries

```text
Prepare Release   decides and prepares version metadata
Nightly Release   publishes verified prerelease Server/Desktop artifacts
Stable Promotion  manually promotes a selected verified Nightly source
Deploy Production selects a Published Release for runtime rollout
Runtime Watcher   mutates production safely
```

These authorities remain separate.

## 2. Prepare Release

### Trigger

- manual `workflow_dispatch` on `main`, after successful exact-SHA CI;
- no automatic release preparation or publication on ordinary main pushes.

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

The scheduler checks every 30 minutes, but creates a Nightly only when the current main SHA has successful complete CI and a canonical runtime build artifact, contains new commits and is at least six hours after the previous published Nightly. Main CI does not trigger publication through `workflow_run`.

```text
successful exact-SHA main CI + eligible timer/manual retry
        -> immutable candidate images and staging runtime
        -> native Desktop packages + source acceptance
        -> verified Nightly prerelease and channel feed
        -> explicit operator selection of a published Nightly
        -> same-source Desktop repack + immutable image digest retag
        -> verified Stable publication
        -> separate manual Production selection
```

Stable may select any still-verifiable published Nightly, not only the newest. It revalidates the selected tag, exact main CI, publication-run identity, manifest hashes, native asset hashes and image digest parity. A Draft, failed Nightly, foreign repository, version downgrade or tag collision cannot authorize promotion. Main can advance without changing the selected source SHA.

Root/Desktop versions and the Release Please manifest at the source SHA remain the version authority. Nightly applies a temporary prerelease suffix only in packaging metadata; Stable uses the prepared source version. Prepare and merge a new Release Please milestone before promoting a new stable version. See [Release runbook](../operations/release.md) for operator actions and recovery.

## 5. Draft-first publication

Release Publish first creates or resumes:

```text
vX.Y.Z-nightly.YYYYMMDD.run or vX.Y.Z immutable Git tag
Draft GitHub Release with explicit channel
```

A failed Server promotion, Desktop platform, release acceptance, manifest or postflight leaves the Release Draft and resumable. One same-source Nightly draft is resumed on retry; published tags and assets are immutable.

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
- signing state and channel-isolated update feed;
- same-run/source Web and Provider acceptance receipt;
- postflight result.

`nightly-manifest.json` additionally binds the publication run, the four canonical evidence documents and the immutable staging-runtime digest. Stable records the selected Nightly manifest digest, same-source repack policy and digest-retag policy.

Draft becomes Published only when all required identities and assets are present.

## 9. Production selection

`Deploy Production` is an explicit `workflow_dispatch` authority gated by the GitHub `production` Environment and `main` branch policy. It accepts an immutable Published Release tag only. Before mutation it revalidates tag -> SHA, source main CI, candidate-set, ACR/GHCR application digest parity and the runtime mirror digests owned by the exact release SHA.

It creates `memoflow.production-set/v1`, which binds release SHA/tag, candidate and delivery-manifest identity, exact application/runtime digests, and the current `controlPlaneSha`. The selector builds only `memoflow-production-runtime`, then moves one `production-selected` control pointer. It does not rebuild Web/API/Migrator, move their tags independently, run SSH commands, or mutate Compose on the runtime host.

The configured production host consumes that control artifact with `deployment/production/production-deploy-watch.sh`. The canonical production compose contains no Watchtower or mutable application fallback. Runtime mutation remains a host-owned transaction with backup, migrator-first rollout, health verification, atomic state, pre-migration restore and post-migration `BLOCKED` semantics.

## 10. Rollback

- Published Releases and immutable tags are never rewritten.
- Server rollback selects a previous compatible Published Release manifest.
- Desktop rollback means publishing a newer corrective version; existing installers remain immutable.
- Runtime watcher may restore the previous release only when migration/schema policy proves compatibility; otherwise it records BLOCKED for operator action.
