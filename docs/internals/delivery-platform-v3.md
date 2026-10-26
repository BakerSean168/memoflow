---
tags:
  - architecture
  - ci
  - cd
  - delivery
description: MemoFlow Delivery Platform V3 目标架构、状态机、artifact channel 与控制面边界
created: 2026-09-02T16:15:00+08:00
updated: 2026-09-02T16:15:00+08:00
---

# MemoFlow Delivery Platform V3

> Status: ADOPTED / IMPLEMENTING under ADR-066.

## 1. North star

MemoFlow delivery separates six decisions:

```text
source integration
CI verification
candidate publication
staging deployment
release publication
production deployment
```

No step is allowed to infer the next step merely from a mutable tag or a green process.

## 2. End-to-end topology

```text
feature/fix/refactor branch
            │
            ▼
        pull request
            │
            ▼
 Delivery Manifest V2
            │
   ┌────────┼─────────┬──────────┐
   ▼        ▼         ▼          ▼
Governance Quality  Desktop  DB/Web Experience
   │        │         │          │
   └────────┴── Stable Oracles ──┘
            │
            ▼
           main
            │
            ▼
 full exact-SHA CI
            │
            ▼
 Server Candidate Publish
   Web + API + Migrator
            │
   ACR digest == GHCR digest
            │
            ▼
 candidate-set-v1.json
            │
            ▼
 staging-latest coherent channel
            │
            ▼
 GCP staging deploy watcher
            │
            ▼
 canonical staging state

 successful main CI
            │
            ▼
 Prepare Release / release-please
            │
            ▼
 protected Release PR
            │
            ▼
 release merge SHA full CI
            │
            ▼
 Release Publish
   ┌────────┴────────┐
   ▼                 ▼
promote Server   build Desktop installers
candidate digest Win/Linux/mac Intel/arm64
   └────────┬────────┘
            ▼
 canonical release-manifest.json
            │
            ▼
 Published GitHub Release
            │
            ▼
 explicit Deploy Production
            │
            ▼
 coherent production channel
            │
            ▼
 Alibaba deploy watcher
 backup → migrate → deploy → verify
            │
            ▼
 production deploy state
```

## 3. State and identity model

| State               | Authority          | Immutable identity                        | Mutable pointer       |
| ------------------- | ------------------ | ----------------------------------------- | --------------------- |
| PR                  | GitHub branch      | head SHA + manifest digest                | branch head           |
| Main verified       | GitHub CI          | merge SHA + CI run                        | main                  |
| Candidate           | Candidate Publish  | image digests + candidate manifest digest | `sha-<revision>`      |
| Staging selected    | Artifact publisher | exact candidate manifest                  | `staging-latest`      |
| Staging deployed    | GCP watcher        | revision + digests + state file           | running containers    |
| Release             | Release Publish    | tag SHA + release manifest + asset hashes | Latest Release marker |
| Production selected | Deploy Production  | release manifest digest                   | desired/prod channel  |
| Production deployed | Alibaba watcher    | deployment state + image digests + schema | running containers    |

Mutable pointers are discovery mechanisms only. Every mutating consumer re-resolves immutable identities before acting.

## 4. Delivery Manifest V2

### 4.1 Shape

```json
{
  "schemaVersion": 2,
  "commit": "<head SHA>",
  "base": "<base SHA>",
  "head": "<head SHA>",
  "event": "pull_request",
  "risk": {
    "level": "desktop",
    "matchedLevels": ["desktop"]
  },
  "scope": {
    "projects": ["desktop", "repository"],
    "desktop": true,
    "web": false,
    "server": false,
    "database": false,
    "contracts": false
  },
  "lanes": {
    "governance": true,
    "validate": true,
    "build": true,
    "web": false,
    "coverage": false,
    "performance": false,
    "integration": true,
    "boundary": true
  },
  "digest": "sha256:..."
}
```

The actual schema evolves compatibly from V1. New fields are explicit; existing consumers continue to validate one canonical self-digest.

### 4.2 Risk precedence

From lowest to highest:

```text
docs
package
desktop / web / server / database / contract
runtime
root
release
```

A mixed change selects the union of lanes and the highest safety class. Unknown CI/root/deployment changes force full validation.

Phase 1 records Desktop as scope/risk and routes it through the existing Validate/Boundary evidence. A distinct `desktop` lane/Oracle is introduced only with a dedicated receipt producer, so enabled manifest lanes can never be observationally incomplete.

### 4.3 Representative mapping

| Change                                | Required lanes                                              |
| ------------------------------------- | ----------------------------------------------------------- |
| docs only                             | Governance                                                  |
| `apps/desktop/**`                     | Validate, Build, Desktop, Boundary/Integration              |
| `packages/repository/src/electron/**` | Desktop + affected Repository tests, not Web E2E by default |
| `apps/web/**`                         | Validate, Build, Web Flow                                   |
| `apps/api/**`, server package         | Validate, Build, Integration                                |
| Prisma/migration/schema               | Validate, Database, Integration, Boundary                   |
| shared UI/contract                    | Desktop + Web + Boundary as graph indicates                 |
| Docker/CI/release/root                | Full                                                        |
| main push                             | Full regardless of path                                     |

## 5. Logical lanes and physical execution

Logical evidence remains independent:

```text
governance
static-analysis
unit
typecheck
build
desktop
integration
boundary
web-flow
coverage
performance
observation
```

Physical jobs may be consolidated after shadow comparison. A consolidated quality runner must still emit per-logical-lane receipts and cannot turn multiple failures into an opaque single boolean.

## 6. Candidate set

`memoflow.candidate-set/v1` binds:

```json
{
  "schema": "memoflow.candidate-set/v1",
  "gitSha": "<full SHA>",
  "ciRunId": "<successful main CI run>",
  "deliveryManifestDigest": "sha256:...",
  "images": {
    "web": { "digest": "sha256:..." },
    "api": { "digest": "sha256:..." },
    "migrator": { "digest": "sha256:..." }
  },
  "distribution": {
    "china": "<ACR namespace>",
    "global": "<GHCR namespace>"
  },
  "digest": "sha256:..."
}
```

Candidate publication invariants:

- source event is successful `push` CI on `main`;
- downloaded build closure belongs to exact SHA and delivery manifest;
- each image has `org.opencontainers.image.revision=<gitSha>`;
- ACR and GHCR top-level manifest digests equal build output;
- candidate manifest is self-digested and uploaded as durable workflow evidence;
- `staging-latest` moves only as one coherent set and only for current main.
- The staging runtime also carries the reviewed runtime-dependency mirror contract; PostgreSQL, Redis and PowerSync are resolved to exact mirrored digests from that candidate-bound contract, never from stale host image pins.

## 7. Canonical staging

The watcher accepts only a coherent set. Deployment order:

```text
pull and verify exact channel
→ render Compose with external secrets
→ PostgreSQL/Redis/PowerSync infrastructure health
→ migrator one-shot
→ API health
→ Web health
→ PowerSync contract/sync smoke
→ external ingress smoke
→ atomic state commit
```

State file minimum:

```text
revision=<sha>
candidate_digest=sha256:...
web_digest=sha256:...
api_digest=sha256:...
migrator_digest=sha256:...
deployed_at=<UTC>
```

## 8. Release and Desktop

Server artifacts are promoted from candidate digest. Desktop packages are built on native hosted runners and hashed into `desktop-release-manifest.json`.

Required initial platform coverage:

| Platform | Architecture | Package            |
| -------- | ------------ | ------------------ |
| Windows  | x64          | NSIS `.exe`        |
| Linux    | x64          | AppImage, deb, rpm |
| macOS    | x64          | dmg, zip           |
| macOS    | arm64        | dmg, zip           |

The manifest records signing/notarization state explicitly. An unsigned pilot may publish only when policy says `allowUnsignedMacPilot=true`; it must not emit a false signed claim.

## 9. Production

Production selection consumes only Published Release + canonical manifest. Runtime watcher performs migration-aware coherent rollout. A failed or uncertain post-migration state becomes `BLOCKED`, not an automatic blind rollback.

## 10. Observability and performance targets

Baseline from PR #286:

```text
wall: 11m08s
runner job time: 43m25s
web shards: ~25m43s
```

Initial V3 targets for comparable Desktop-only PRs:

```text
Web Flow selected: false
wall P50: <= 8m
runner-minutes P50: <= 22m
required evidence omissions: 0
false skipped required lanes: 0
```

Performance optimization is accepted only from comparable run summaries; a single fast run is not sufficient.

Final Phase-4 paired evidence used five identical `desktop-pr286` workloads on main `55f2825196008030ef390178e98cf6c6393168d6` and is versioned at `reports/ci-cd-platform/quality-shadow/2026-09-06/report-v1.json` (digest `7286921ed867531e478dbc0f93bac5718bd5e5f9c2ff4c40634fcde1515f84e9`):

```text
split wall P50/P95:          247.706s / 266.173s
consolidated wall P50/P95:   458.639s / 473.372s
split runner-min P50/P95:     11.108 / 11.207
consolidated runner-min P50/P95: 7.644 / 7.890
```

The predeclared gate required non-regressing wall P50/P95 **and** improved runner-minutes. Consolidation saved runner cost but regressed wall time by about 3.5 minutes, so V3 **retains the physically split Static / Unit / Typecheck / Build topology**. Reconsider consolidation only with a new comparable paired experiment.
