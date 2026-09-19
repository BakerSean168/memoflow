---
tags:
  - analysis
  - ai
  - closure
  - vnext
  - evidence
description: AI-9612 AI vNext five-layer exact-head closure findings, repairs, and verification evidence
created: 2026-09-18T00:00:00+00:00
updated: 2026-09-18T14:11:05+00:00
---

# AI-9612 — AI vNext closure evidence

## Closure decision

AI-9612 remains the integrated AI vNext closure after accepted AI-9611 and does not start
`PORT-1611`. ChatGPT Web review identified the two findings below after the prior closure head;
the accepted behavior and documentation are preserved while those repairs are applied. The
review-repaired content passed the exact-head matrix below.

Acceptance rule satisfied: the final-head matrix is green, with zero unresolved P0/P1/P2 findings.
Historical risk severity is retained for auditability.

## Five-layer findings and disposition

| Layer                     | Severity | Finding                                                                                                                                                                                                                                     | Evidence                                                                                                         | Disposition                                                                                                                                                                                                       |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Contract correctness    | P1       | A resolved Mastra SDK model retained the original fetch/credential after Vault revoke or Connection replacement.                                                                                                                            | `packages/ai/src/server/mastra/models/model-resolver.ts`; resolver capability tests                              | Fixed with an identity-scoped request-time Connection + SecretVault guard. Revoke, replace, disable, delete, endpoint change, and ownership mismatch fail closed before provider fetch.                           |
| 1 Contract correctness    | P1       | HTTP/SSE/Electron runtime catches collapsed capability/configuration/provider failures into generic transport errors.                                                                                                                       | `packages/ai/src/api/routes/ai-runtime.routes.ts`; `packages/ai/src/electron/index.ts`; runtime client contracts | Fixed with shared AI public failure projection, safe messages/statuses, and requestId-only context. Raw provider text, URLs, credentials, and internal structured metadata do not cross transport.                |
| 1 Contract correctness    | P1       | `extractStructuredResultError()` was treated as public-safe: arbitrary structured code/status/context could cross HTTP/IPC and leak provider diagnostics or unstable internal vocabulary.                                                   | `packages/ai/src/server/transport/ai-controller-errors.ts`; new public-failure regression tests                  | Fixed: non-AI structured codes are explicitly allowlisted; unknown codes use the operation fallback code/message/status; context is projected to a string requestId only. HTTP and Electron IPC stay parity-safe. |
| 1 Contract correctness    | P2       | Mastra runtime imported `server/transport` solely for runtime failure normalization, reversing runtime → transport dependency direction.                                                                                                    | `packages/ai/src/server/mastra/runtime/mastra-ai.runtime.ts`; Mastra architecture surface test                   | Fixed: transport-neutral projection moved to `packages/ai/src/shared/ai-public-failure.ts`; transport adds HTTP status. The surface test prevents Mastra from importing transport.                                |
| 1 Contract correctness    | P2       | An unused exported provider-template catalog duplicated ProviderDefinition vocabulary and retained default-model semantics.                                                                                                                 | `packages/contracts/src/modules/ai/configs/ai-provider-template.ts` consumer audit                               | Fixed by deleting the dead catalog/test/export; canonical `ai-provider-catalog.ts` is the only provider-definition registry.                                                                                      |
| 2 Vertical completeness   | —        | Open chat, restore/delete, goal/task/knowledge workflows, Knowledge QA, Routine approval, provider onboarding/replacement, Prisma/PowerSync, HTTP/IPC, Vue, portability, eval/operations traced.                                            | Module index; API/Desktop composition roots; focused tests listed below                                          | Complete. No unresolved P0/P1/P2 gap found.                                                                                                                                                                       |
| 3 Behavioral completeness | —        | Restart/reconnect, HITL interrupt/resume, stale overlay, unsupported/stale capability, partial retry/idempotent approval, Knowledge identity, context budget/injection, secret leak, and legacy-table cutover required executable evidence. | Focused AI/AppVue/Web/Data Portability/PowerSync suites listed below                                             | Complete on accepted AI-9610/AI-9611 base plus AI-9612 regressions; provider revoke and transport failure regressions added here.                                                                                 |
| 4 Engineering quality     | —        | Single Mastra runtime; owner ports; Product Time; bounded execution record; API/Desktop parity; no compatibility fallback or raw owner repository in AI tools.                                                                              | `ai-vnext-no-legacy.surface.spec.ts`; capability surface tests; composition roots; source audit                  | Complete. Direct provider gateways remain bounded onboarding/Knowledge-QA adapters, not a second Agent/Workflow runtime.                                                                                          |
| 5 Docs/plan truth         | —        | ADRs, current-system analysis, product/module docs, file index, active plan, and portability wording had stale target/deferred claims.                                                                                                      | Changed docs in this commit                                                                                      | Fixed. ADR-096..099 and AI-9602..9612 statuses now match implementation; PORT-1611 remains separate.                                                                                                              |

## Implementation repairs

- Added request-time provider Connection/Vault validation to `MastraModelResolver` and a revoke
  regression test.
- Added one redacted AI public failure projection for HTTP JSON, SSE, Electron IPC, and Mastra
  runtime events; added API/Desktop parity regressions.
- Moved the transport-neutral projection into `packages/ai/src/shared/ai-public-failure.ts`, with
  an explicit AI runtime code allowlist and requestId-only context projection; server transport
  now adds HTTP status, and a surface test prevents Mastra from importing transport.
- Removed the dead provider-template registry and its stale surface test/export.
- Updated current truth docs to describe shell-only conversations, Mastra transcript/workflow
  authority, `AIExecutionRecord`, stable Knowledge IDs, capability evidence, and shell-only
  portability.

## Focused behavioral evidence

- Restart/reconnect and Mastra transcript authority: `assistant-history.persistence.spec.ts`,
  `mastra-workflow.runtime.spec.ts`, `apps/web/e2e/ai/multi-engine-host.spec.ts`.
- HITL interrupt/resume, duplicate approval, partial retry: goal/task workflow and apply-service
  suites under `packages/ai/src/server/mastra/workflows/`.
- Stale unsaved editor overlay and runtime-unavailable recovery:
  `packages/app-vue/src/modules/ai/composables/useAIWorkflowPersistence.spec.ts`.
- Capability fail-closed and stale evidence: `model-resolver.spec.ts`.
- Knowledge rename/move/delete identity: Knowledge index repository suites.
- Context truncation, prompt-injection trust boundary, and secret redaction:
  `ai-context-assembler.spec.ts` and adjacent runtime observability suites.
- Legacy-table cutover and anti-resurrection: Prisma/PowerSync/Data Portability schema and
  round-trip suites; production source has no `AiMessage`/`ai_messages` authority.

## Exact-head verification

The prior closure matrix is historical evidence only. The matrix below was rerun after these
review repairs on the final review-repaired content.

| Gate                                     | Result                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm nx run ai:test`                    | PASS — 87 test files, 400 tests                                                                                       |
| `pnpm nx run ai:eval:replay`             | PASS — recorded replay; passRate 1.000; cost delta -4.81%; p95 latency delta -10.61%                                  |
| `pnpm nx run ai:typecheck`               | PASS — exit 0; Nx reported the existing `database:prisma-generate` flaky-task diagnostic                              |
| `pnpm nx run ai:build`                   | PASS — exit 0; Nx reported the existing `database:prisma-generate` flaky-task diagnostic                              |
| `pnpm nx run app-vue:test`               | PASS — 198 test files, 789 tests                                                                                      |
| `pnpm nx run app-vue:typecheck`          | PASS — exit 0; Nx reported the existing `database:prisma-generate` flaky-task diagnostic                              |
| `pnpm nx run api:typecheck`              | PASS — exit 0; Nx reported the existing `database:prisma-generate` flaky-task diagnostic                              |
| `pnpm nx run desktop:typecheck`          | PASS — exit 0; Nx reported the existing `database:prisma-generate` flaky-task diagnostic                              |
| `pnpm nx run database:prisma-generate`   | PASS — Prisma Client v7.8.0 generated and 5 generated files normalized                                                |
| Prisma validate                          | PASS — `pnpm --dir packages/database exec prisma validate --config ./prisma/prisma.config.ts`                         |
| `pnpm nx run powersync-schema:test`      | PASS — 1 test file, 8 tests                                                                                           |
| `pnpm nx run data-portability:test`      | PASS — 36 test files, 152 tests                                                                                       |
| `pnpm nx run data-portability:typecheck` | PASS — exit 0; Nx reported the existing `database:prisma-generate` flaky-task diagnostic                              |
| `pnpm e2e:ai-workspace`                  | PASS — 11 passed; exit 0                                                                                              |
| `pnpm nx run web:e2e:ai-provider`        | PASS — 1 passed, 1 explicit opt-in live-provider test skipped; exit 0                                                 |
| `pnpm docs:check`                        | PASS — exit 0                                                                                                         |
| `pnpm governance:check`                  | PASS — exit 0                                                                                                         |
| `pnpm test:inventory`                    | PASS — 1201 files; unit 1035, integration 34, smoke 3, boundary-ipc 8, boundary-main 6, e2e 57, perf 1, governance 57 |
| `git diff --check`                       | PASS — no whitespace errors                                                                                           |

## Residual non-blocking notes

- P3: archived/historical ADR and plan rationale may still mention retired names when explaining
  the cutover; current-state sections and anti-resurrection assertions are authoritative.
- P3: the full repository gate may report pre-existing Nx flaky-task diagnostics; a gate is green
  only when its command exits successfully.

## Final disposition

All required final-head gates passed after the ChatGPT review repairs. AI-9612 has zero unresolved
P0/P1/P2 findings and is ready for ChatGPT Web acceptance; the single existing closure commit is
amended with this repaired content.
