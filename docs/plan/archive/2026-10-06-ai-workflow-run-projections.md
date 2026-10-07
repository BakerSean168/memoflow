---
tags: [plan, archive]
description: Behavior-preserving extraction of durable AI workflow run projections
created: 2026-10-06T00:00:00
---

# AI workflow run projection extraction

Baseline: main `47e7afb54ae`, isolated branch `refactor/ai-workflow-run-projections`.
AIC-5001/Web Research is already merged; no overlapping open implementation PR.
The main checkout's operator scripts are excluded. Parent is the sole writer.

## Scope and acceptance

1. Move unknown snapshot decoding and typed workflow input dispatch to an internal module.
2. Move Goal/Task/Knowledge run read projections to an internal module; retain explicit owner-specific schemas rather than add a framework.
3. Preserve identity filtering before decoding, corruption failures, low-level status mapping, recovery receipts, timestamps, public failure sanitization, and schema validation.
4. Keep runtime execution, durable start/resume/cancel, usage enrichment, owner mutation ports, fail-closed tool policy, single Mastra instance, and public exports unchanged.
5. Add focused characterization tests, run AI tests/typecheck/lint, obtain fresh-context read-only ForgeFlow review, repair findings, and commit.

No deployment/runtime configuration changes: package verification is the relevant gate, not a production rollout.

## Outcome

Completed. Runtime shrank from 1669 to 1386 lines. Snapshot decoding/input dispatch and explicit Goal/Task/Knowledge run projections are internal modules, not package exports. Added 55 characterization cases and refreshed the deterministic test inventory.

Verification on the completed code candidate:
- `pnpm nx run ai:test --args='src/server/mastra/runtime/workflow-run-projection.spec.ts src/server/mastra/runtime/mastra-workflow.runtime.spec.ts --maxWorkers=2' --skip-nx-cache`: 82/82 passed, including 27 existing durable runtime tests.
- `pnpm nx run ai:test --args='--maxWorkers=2' --skip-nx-cache`: 556/556 passed across 91 files.
- `pnpm nx run ai:typecheck`, `pnpm nx run ai:build`, `pnpm nx run ai:lint`: passed; lint has five existing warnings outside changed files.
- `pnpm test:inventory` and `pnpm nx run memoflow:governance-check`: passed after inventory refresh.
- `git diff --check`: passed.

Initial verification caught lifecycle constants still required by resume; restored the three runtime imports without undoing extraction. Initial unbounded Vitest run also had three worker-start timeouts; the bounded two-worker full rerun passed. Initial governance failure was stale inventory from the new spec, repaired by the repository generator.

Fresh-context read-only ForgeFlow reviewer run `81f508e9-bcac-4767-90dc-f47e74c74a74` compared all eight extracted function bodies with main and reported no issues/blockers. Confirmed ownership checks, schema/error/default/status semantics, recovery receipt matching, timestamps, usage enrichment, public export stability, and no import cycle. Evidence saved in `/tmp/memoflow-projections-review.md`; command logs use `/tmp/memoflow-projections-*.log` (local ephemeral evidence).

Next priority: isolate workflow lifecycle request preparation/dispatch from assistant streaming orchestration, retaining storage and mutation authority in the single runtime. The small duplicated public failure adapter and additional edge-case tests are optional follow-ups, not blockers.
