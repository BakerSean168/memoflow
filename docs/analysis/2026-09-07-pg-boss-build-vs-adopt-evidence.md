---
tags:
  - analysis
  - scheduler
  - pg-boss
  - poc
description: POC-6401 pg-boss Build-vs-Adopt evidence and decision
created: 2026-09-07T16:05:00+08:00
updated: 2026-09-07T16:05:00+08:00
---

# POC-6401 — pg-boss Build-vs-Adopt Evidence

## Decision

**Outcome: `Keep custom`.**

MemoFlow should keep the current Scheduler / Temporal Engine for the current vNext release. pg-boss 12.30.0 is technically viable for the PostgreSQL cloud lane and remains a credible future adapter candidate, but adopting it now would not simplify the system as a whole: Desktop still requires the PowerSync/local engine, the SchedulingPort complete-set semantics still require a MemoFlow wrapper, and the retry contract cannot be represented exactly without semantic translation.

The PoC is intentionally retained as a dev-only, repeatable experiment. It is not exported from `@memoflow/scheduler`, is not wired into API/Desktop composition, and does not change Goal/Task/Routine/Reminder feature code.

## Scope and baseline

PoC implementation:

- `packages/scheduler/poc/pg-boss/pg-boss-scheduling.adapter.poc.ts`
- `packages/scheduler/poc/pg-boss/pg-boss-scheduling.poc.ts`
- `packages/scheduler/vitest.pgboss-poc.config.ts`
- `packages/scheduler/tsconfig.pgboss-poc.json`
- Nx targets: `scheduler:poc:pg-boss`, `scheduler:poc:pg-boss:typecheck`

Candidate version: `pg-boss@12.30.0` (devDependency only). The GCP Dev Node runtime is v22.22.1, satisfying the package's Node >=22.12 engine requirement.

## Evidence matrix

| Requirement | Result | Evidence |
| --- | --- | --- |
| SchedulingPort adapter without feature changes | PASS | PoC class implements `SchedulingPort`; no feature package is modified or wired to pg-boss |
| owner complete-set reconcile | PASS with wrapper | `findJobs(data.ownerKey)` + deterministic ids + upsert/delete inside one Prisma transaction |
| same-owner concurrent reconcile | PASS with wrapper | PostgreSQL transaction advisory lock serializes two concurrent complete-set reconciles; final state is one complete set, never a union |
| transaction crash / rollback | PASS | injected failure after pg-boss upsert rolls back both updates and inserts |
| transaction-aware enqueue | PASS | pg-boss per-call `db` adapter participates in caller-owned Prisma transaction; rolled-back enqueue is absent, committed enqueue is durable |
| claim correctness / multi-worker | PASS | two pg-boss instances concurrently fetch one ready job; exactly one claims it |
| retry / backoff | PASS with semantic gap | failed active job becomes deferred retry and retry count advances when re-claimed |
| DLQ / redrive | PASS | terminal failure reaches DLQ with source provenance; `redrive()` recreates work on source queue |
| heartbeat | PASS | active job exposes heartbeat metadata and `touch()` refresh succeeds |
| expiration | PASS | one-second active job is failed by explicit supervision after expiry |
| startup / recovery | PASS | deferred job created by one pg-boss instance is fetched after that instance stops and a new instance starts |
| terminal schedulingKey invariant | PASS with wrapper | changed semantics for an existing terminal key fail closed as `PERSISTED_KEY_COLLISION` |
| strict TypeScript | PASS | dedicated PoC tsconfig passes |
| PowerSync/Desktop | FAIL as single-engine replacement | current desktop DB contract is PowerSync/SQLite-like and is not a PostgreSQL pg-boss backend |

Final real-PostgreSQL PoC: **1 file, 10/10 tests passed**.

## SchedulingPort fit

### What pg-boss can own well

The PoC proves that pg-boss can own the cloud lane's low-level queue mechanics behind the existing `SchedulingPort`:

- PostgreSQL job claim and multi-worker exclusion;
- retry state and delayed retry scheduling;
- terminal failure + DLQ + redrive;
- active-job heartbeat and expiration;
- durable restart recovery;
- enqueue/update/delete within a caller-owned transaction through its DB adapter capability.

These capabilities are meaningfully stronger than rebuilding generic PostgreSQL queue primitives from scratch.

### What MemoFlow must still own

pg-boss does not eliminate MemoFlow's scheduling semantics:

1. **Owner complete-set reconcile.** `SchedulingPort.reconcile(owner, desired)` means `desired` is the entire desired set. The adapter still needs owner lookup, diffing, deterministic identity, stale deletion and an owner-level lock.
2. **Terminal key collision policy.** MemoFlow deliberately forbids silently changing a terminal `schedulingKey`; the wrapper must enforce this before pg-boss upsert.
3. **Reconcile receipts.** The production adapter currently persists/returns `SchedulingReconcileReceipt` semantics. The PoC only returns the receipt; a production pg-boss adapter would still need MemoFlow-owned durable receipt/audit persistence.
4. **Handler Registry and payload contracts.** These remain MemoFlow-owned regardless of queue engine.
5. **Cross-host product semantics.** API and Desktop must still behave consistently through the same SchedulingPort contract.

## Retry semantic mismatch

MemoFlow currently models:

```text
initialDelayMs      millisecond precision
maxDelayMs          millisecond precision
backoffMultiplier   arbitrary value >= 1
```

pg-boss 12.30 models retry delay in seconds and exposes exponential backoff as a boolean rather than an arbitrary multiplier. The PoC translation therefore:

- rounds millisecond delays up to seconds;
- maps multiplier `1` to no exponential backoff;
- maps multiplier `2` to exponential backoff;
- cannot exactly preserve arbitrary values such as `3`.

This is not a blocker for a future adapter if MemoFlow intentionally narrows the contract, but silently approximating the current contract is not acceptable for vNext.

## Type/API friction found during PoC

pg-boss 12.30.0 runtime command responses for operations such as `touch()` / `deleteJob()` contain `jobs`, `requested` and `affected`, but the installed public `CommandResponse` TypeScript interface is empty. The PoC avoids depending on the missing type surface and records the gap instead of introducing `any` into production code.

This is a minor adoption cost, not a runtime correctness failure.

## Desktop / PowerSync implication

Desktop's canonical `IElectronDatabase` is a structural PowerSync transaction API (`execute/getAll/getOptional/get/writeTransaction`). It is not a PostgreSQL connection and cannot run pg-boss's PostgreSQL schema/maintenance/claim SQL directly.

pg-boss 12 has an embedded PGlite backend, but adopting it for MemoFlow Desktop would introduce a second local database/runtime next to PowerSync solely for scheduling. That would increase local lifecycle, backup/recovery, packaging and consistency complexity rather than reuse the existing local-first store.

Therefore pg-boss cannot replace the current engine across both hosts without a larger persistence architecture change.

## Complexity / operational comparison

Measured on the current repository after CLEAN-6304:

```text
Cloud-specific Scheduler Prisma implementation        ~757 LOC
Desktop-specific Scheduler PowerSync implementation   ~834 LOC
Shared runtime/queue/reconcile/lease coordinator     ~1903 LOC
PoC pg-boss adapter                                    ~380 LOC
```

A cloud-only pg-boss migration would not remove the ~834 LOC Desktop adapter or ~1903 LOC shared local runtime needs. It would instead add a second execution engine plus a MemoFlow reconciliation/receipt wrapper.

Database surface measured in the PoC test database:

```text
Current custom Scheduler persistence: 4 tables / 13 indexes
pg-boss PoC schema:                    12 tables / 27 indexes / 5 functions / 26 types
```

The pg-boss schema is reasonable for a mature queue product, but it is not operationally free. Because the current custom engine must remain for Desktop, this extra schema would be additive under a Hybrid decision.

## Why not `Adopt pg-boss cloud`

A full cloud adoption is rejected for vNext because:

- it cannot be the single cross-host engine;
- it requires custom wrappers for complete-set reconcile, terminal-key policy and durable receipts;
- exact retry semantics do not match the current contract;
- raw worker diagnostics/persistence would need a new pg-boss-backed adapter/read model;
- current Scheduler already has passing PostgreSQL + PowerSync concurrency/recovery tests, so there is no demonstrated production failure that justifies migration risk now.

## Why not `Hybrid cloud pg-boss + local adapter`

Hybrid is technically feasible, but the PoC does not show a net simplification today. It would create two scheduler engines that must remain semantically equivalent, while most shared Scheduler semantics and all Desktop code remain. The cloud-specific code removed is smaller than the ongoing dual-engine test/ops surface added.

## Revisit triggers

Re-run the adoption decision if one of these becomes true:

1. production API needs materially higher multi-worker scheduling throughput or has repeated claim/lease/retry incidents;
2. maintaining the custom PostgreSQL queue becomes a measurable reliability/operations burden;
3. Desktop moves to a PostgreSQL/PGlite-compatible canonical local store, making one engine plausible across hosts;
4. MemoFlow intentionally narrows retry semantics to seconds + standard exponential backoff;
5. pg-boss gains a cleaner typed command surface and/or a backend compatible with MemoFlow's canonical local store.

Until then, keep `SchedulingPort` and `ScheduledHandlerRegistry` stable and keep pg-boss as a dev-only benchmark/candidate rather than production infrastructure.
