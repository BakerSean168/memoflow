---
tags: [plan, active, release, database]
description: Complete bounded production schema preparation before the vNext release
created: 2026-10-07T22:30:00Z
updated: 2026-10-07T22:30:00Z
---

# Production schema cutover repair

A host-local copy of the v0.14.1 production database failed the exact v0.15.1
migrator before production selection. Prisma refused to remove populated retired
Account/Cloud Auth/Setting fields and add the AI Knowledge document unique index.
The temporary database was removed; the production snapshot and logs remain in
the restricted host-local release backup. Production remains v0.14.1.

## Scope and guardrails

- Follow ADR-104/105/111 and the existing account-lifecycle SQL: Account owns
  profile/lifecycle, Cloud Auth owns email and disabled access, and legacy Setting
  data is retired. No compatibility reader, dual write, generic data-loss flag,
  or database reset is introduced.
- Preserve surviving account IDs, profiles, Cloud Auth credentials/email and
  disabled access. Normalize the known legacy account lifecycle values; reject
  unknown states. Apply the bounded cutover transactionally and idempotently.
- Remove only explicitly retired columns/table. Recovery remains the production
  watcher's mandatory database backup, plus the verified host-local rehearsal
  snapshot. No production data or credentials leave the host.
- Extend the existing duplicate-checking unique-index preparation for the exact
  AI Knowledge key. Missing columns may only be added to an empty table; populated
  ambiguous data must still fail closed.
- Wire the same preparation into the packaged migrator and local Prisma push.

## Acceptance

1. Real PostgreSQL regression: legacy account survives with current lifecycle,
   canonical email/profile remain intact, and disabled access never reactivates.
2. Unknown lifecycle rolls back all changes; repeat and fresh-schema runs pass.
3. AI Knowledge index succeeds on safe data and rejects duplicates/unsafe backfill.
4. Migrator ordering, affected tests/types/lint, runtime scripts and governance pass.
5. The corrected packaged migrator passes on a fresh host-local production snapshot
   without global data-loss override before any production selection.
6. Review and merge, then publish corrective v0.15.2 through every required gate.
   Preserve immutable v0.15.0/v0.15.1 Draft identities; verify production and cleanup.
