---
tags: [analysis, data-portability, vnext]
description: Data Portability current V3-only system map after PORT-1611
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-18T00:00:00+00:00
---

# Data Portability Current-System Map

## Executive finding

PORT-1611 completes the owner-driven destructive cutover. Data Portability owns
only orchestration: V3 envelope decoding, capability registry, dependency and
reference ordering, safety checks, dry-run/apply coordination and receipts.
Business facts remain in their owner modules. There is no Data Portability
mini-repository, persistence-shaped projection, legacy backup parser or V1/V2
product route.

## Runtime composition

Both production hosts pass the same ten semantic owner capabilities to the same
V3 registry:

```text
account-profile@3                 depends on preferences
preferences@3
notification-delivery-preferences@3
routines@3
schedules@3
notifications@3
labels@3
goals@3                           depends on labels
tasks@3                           depends on labels, goals
ai-conversations@3
```

The registry topologically orders a complete operation as:

```text
preferences → account-profile → notification-delivery-preferences
→ routines → schedules → notifications → labels → goals → tasks
→ ai-conversations
```

The API and Desktop transports share the application port and expose only:

- `export` — V3 envelope and capability summary;
- `dry-run` — owner validation/conflict receipt with zero mutation;
- `apply` — isolated preflight followed by owner apply and receipt.

## Former V2 coverage disposition

The former full-backup branches were reviewed before deletion. Preferences,
notification delivery choices, goals/KRs/reviews/records, task plans and
occurrences, canonical schedule entries, and the AI conversation shell are
covered by the owner capabilities above. Current-product labels, account
profile, routine facts and notification facts are also covered by their current
owners even though they were absent from the old full-backup shape.

The following are intentionally not portable business facts: old
Repository/Folder/Resource projections; schedule duration/priority projection
metadata; AI timestamps, transcripts and runtime metadata; scheduler/outbox/
audit state; notification delivery/device state; database ids, source identity,
credentials and secrets. These remain owner/runtime/schema concerns and are not
recreated by Data Portability.

The old `reminders` selector had no exporter branch. Canonical Routine facts are
provided by `routines@3`; no empty legacy selector survives.

## Server-held disclosure boundary

`server-held-data-disclosure` is a separate authenticated Web export. It is a
transparency artifact for server-held Knowledge/repository observations and
cached bytes, with `importMode: not-importable` and
`includesImportableBusinessDataBackup: false`. It is not registered as a V3
capability, has no Desktop IPC channel, and the V3 parser rejects its envelope
before owner payload validation.

## Deleted authority

PORT-1611 deletes the old V1/V2 API DTOs and envelope contracts, selectors,
reader/writer use cases, importer/projector tree, sanitize/runtime helpers,
mini-repository ports and Prisma/PowerSync portability adapters/stores. It also
removes old portability event topics and compatibility fixtures. Unrelated
whole-schema tables and owner domain objects remain in scope for CLEAN-2601.

See the [PORT-1611 closure evidence](./2026-09-18-port-1611-v3-only-cutover-evidence.md)
for the source ledger, deletion inventory, exact verification and residue scan.
