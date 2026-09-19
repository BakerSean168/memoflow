---
tags:
  - analysis
  - system
  - vnext
  - sys-3002
description: SYS-3002 five-layer whole-system review evidence for the integrated vNext
created: 2026-09-19T00:00:00+00:00
updated: 2026-09-19T00:00:00+00:00
---

# SYS-3002 — Five-layer vNext review

## Result

The review covered the integrated vNext at canonical base `aca743e00fdc5e3cc4675a92479e9988c3b1b141` (accepted SYS-3001 head). Two verified defects were found and repaired:

- P1: workflow mutation failures copied provider/database/adapter messages into durable receipts and recovery suspensions that are later exposed over HTTP and IPC.
- P2: assistant cancellation clients trusted an erased generic `{ cancelled: boolean }` response without runtime validation.

No P0/P1/P2 finding remains after the repair pass and adjacent-path re-review. This worker did not start SYS-3003, push, open a PR, or merge.

## Review method and severity

The review traced source-to-runtime paths across the canonical HTTP and Electron transports, authenticated execution context, Mastra runtime, owner application ports, Prisma/PowerSync persistence, durable workflow snapshots/receipts, and Vue-facing clients. Existing unit tests were treated as evidence, not as a substitute for the cross-module trace.

Severity follows the system plan: P0 blocks the system; P1 is a material security, data-integrity, or user-flow defect; P2 is a bounded contract or reliability defect; P3 is accepted low-risk residue or follow-up.

## Critical paths traced

| Path                    | Boundary evidence                                                                                                                         | Review result                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web assistant           | auth middleware → `defaultExtractContext`/Express context → `/ai/runtime/assistant/*` → `MastraAIRuntime` → owner capabilities → SSE/JSON | Identity is host-owned; client identity injection is rejected; event/history/delete/cancel outputs are schema-bound.                                                      |
| Desktop assistant       | authenticated Electron context → IPC handlers → the same Mastra runtime → sender-scoped stream/cancel → runtime client                    | IPC has the same identity and cancellation contract as HTTP; malformed cancel results now fail closed in the client.                                                      |
| Workflow apply/recovery | start → durable snapshot → approval/retry → apply service → deterministic owner mutations → receipt → workflow view/suspension            | Goal/Task/Knowledge receipts now public-project failure messages before durable state crosses a transport boundary; deterministic replay and partial retry remain intact. |
| Owner persistence       | workflow mutation ports → Goal/Task/Knowledge/Relation application owners → Prisma/PowerSync                                              | Ownership and idempotency remain in owner modules; no AI-side persistence writer or identity projection was added.                                                        |
| Auth and projection     | authenticated identity → resource-scoped Mastra history/workflow lookup → response DTO                                                    | Resource identity checks fail closed before projection; no client-supplied identity is trusted.                                                                           |

## Findings and repairs

| ID           | Layer(s) | Severity | Finding                                                                                                                                                                                                                                                                                            | Root-cause repair and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SYS-3002-001 | 1, 3, 4  | P1       | `ApplyGoalPlanService`, `ApplyTaskPlanService`, and `ApplyKnowledgeNoteService` copied `ResultError.message` or thrown exception text into `failures[].message`. `AIWorkflowRunViewSchema` exposes those failures, so route-level transport projection did not protect durable recovery responses. | Added `workflow-failure.ts`, reusing the canonical `toAIPublicFailure` allowlist at the durable workflow boundary. Known public codes retain safe public messages; unknown/exception failures become `INTERNAL_ERROR` with a safe workflow message; retryability is still calculated from the original structured error. Regression evidence: partial Task failure asserts `SERVICE_UNAVAILABLE` → `AI service is unavailable`; thrown label failure includes URL/token text and asserts only the safe message is retained. `rg` confirms no raw `error.message`/exception string remains in the three apply services. |
| SYS-3002-002 | 1, 4     | P2       | HTTP and IPC `cancelRun` clients used generic erased response types and directly read `.cancelled`; the route and IPC handler also returned an ad-hoc object rather than the named runtime DTO.                                                                                                    | Added strict `AssistantRuntimeCancelResultSchema`/type; HTTP and IPC clients decode `unknown` with `safeParse`; HTTP route and Electron handler parse the response; `AIRpcMap` uses the shared type. Regression evidence: malformed HTTP and IPC `{ cancelled: 'yes' }` responses fail with `AI_RUNTIME_PROTOCOL_ERROR`; route and Electron surface tests pass.                                                                                                                                                                                                                                                        |

### P0/P1/P2 closure

No P0 was found. The P1 and P2 repairs above were re-reviewed through both transports, the durable recovery view, the authenticated identity path, and the existing restart/partial-retry/idempotency tests. No adjacent P0/P1/P2 issue was introduced or remains verified.

## Layer-by-layer disposition

### 1. Contract correctness

The workflow failure DTO was a real public contract boundary even though it originated inside the runtime. It is now projected through the same public failure policy as route errors. Assistant cancellation has one strict response schema across HTTP, IPC, and the RPC map. Existing request/event/history/workflow schemas remain strict or discriminated at their transport edges.

### 2. Vertical completeness

The reviewed verticals are complete at the current vNext boundary: assistant message/history/delete/cancel, Goal/Task/Knowledge draft approval and recovery, deterministic owner mutation, Goal–Knowledge linking, persistence receipt, HTTP response, and Electron response. No new product surface was added.

### 3. Behavioral completeness

The existing integrated behavior evidence covers restart/reconnect, HITL approval, terminal duplicate approval, partial retry, deterministic entity identity, cancellation, resource scoping, provider replacement/revocation, and knowledge identity/context limits. Relation creation is owner-idempotent and persistence uses the established owner concurrency contracts. The new tests add safe failure projection and malformed cancellation payload behavior.

### 4. Engineering quality

The repair preserves dependency direction: workflow services depend on the shared public-failure projector, not on HTTP/IPC; hosts still own composition and authenticated identity; owner ports still own product mutations. Runtime clients now validate cancellation data as `unknown`. Existing observability and bounded execution-record behavior remained unchanged. No dead fallback or second persistence writer was introduced.

One P3 follow-up remains: several legacy/non-vNext AI product adapters still express response shapes through generic HTTP/IPC type parameters rather than operation-specific decoders. The canonical vNext assistant/workflow clients reviewed here are decoded; no integrity or authorization failure was observed on the traced path, so broad legacy adapter conversion is outside SYS-3002 and not a blocker.

### 5. Documentation and plan truth

Updated the active-plan index and system-wide plan to reflect accepted AI/SYS-3001/CLEAN closure state, SYS-3002 completion, and the fact that SYS-3003/SYS-3004 were not started. Historical analysis documents retain retired vocabulary where they record past states; that is accepted P3 historical residue, not current product guidance.

## Required gates

| Gate           | Command/evidence                                                                                  | Result                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Governance     | `pnpm governance:check`                                                                           | PASS; all governance audits passed. Nx reported the repository's existing flaky `test-system-v2:test:governance` diagnostic, with no governance failure. |
| Typecheck      | `NX_DAEMON=false pnpm typecheck`                                                                  | PASS: 37 projects / 31 dependency tasks; the affected AI and contracts typechecks are included.                                                          |
| Lint           | `NX_DAEMON=false pnpm lint`                                                                       | PASS with zero errors; only pre-existing warnings, including five in AI and two in contracts.                                                            |
| Affected tests | `NX_DAEMON=false pnpm nx run ai:test`; `NX_DAEMON=false pnpm nx run contracts:test`               | PASS: AI 88 files / 406 tests; Contracts 86 files / 490 tests. Focused HTTP/IPC, workflow, route, and Electron targets also pass.                        |
| Affected build | `NX_DAEMON=false pnpm nx run ai:build`; contracts build dependency                                | PASS, including dependent contract and infrastructure builds.                                                                                            |
| Docs           | `pnpm docs:check`                                                                                 | PASS after the review document and active-plan truth updates.                                                                                            |
| Inventory/diff | `pnpm test:inventory`; `pnpm test:inventory:check`; `pnpm test:targets:check`; `git diff --check` | PASS: 1,184 files; `unit=1017`, `integration=34`, `smoke=3`, `boundary-ipc=8`, `boundary-main=6`, `e2e=57`, `perf=1`, `governance=58`.                   |

## Remaining P3 only

- Legacy/non-vNext AI adapters use generic transport type parameters without operation-specific runtime decoders; no traced vNext path depends on this fallback, and conversion is deferred rather than expanded into SYS-3002.
- Historical analysis text may contain retired vocabulary by design; current active plan/index text was repaired.
- Existing toolchain warnings (Nx daemon/Vite native-loader notices and unrelated lint warnings) remain non-blocking diagnostics; no new warning was introduced by this change.
