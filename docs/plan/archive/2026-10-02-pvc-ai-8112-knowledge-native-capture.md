---
tags: [plan, archive, ai, knowledge, repository, shell]
description: PVC-AI-8112 accepted Knowledge native AI capture workflow evidence
created: 2026-10-02T06:42:00+00:00
updated: 2026-10-02T10:24:05+00:00
---

# PVC-AI-8112 — Knowledge native AI capture workflow

## Evidence and owner boundary

Baseline: `0786512b669`, branch `product/vnext-ai-8112`.

KNOW-6102 deliberately converged Web/Desktop Knowledge presentation while preserving distinct host
ownership. Web is a GitHub projection/read/search/reference workspace and must not gain an
independent browser content-write path. Desktop owns its Local Vault/Obsidian capability.
Existing `knowledge.capture` persistence already respects that boundary: Mastra approves through
the host-bound `IKnowledgeNotePersistencePort`, API commits through
`RepositoryApplicationPort.createConfirmedKnowledgeNote`, and Desktop commits through its
Local Vault runtime.

Therefore AI-8112 migrates **review/editing ownership**, not durable mutation ownership. The
Repository module owns the native review surface/session; Mastra remains the durable workflow
authority and the host persistence port remains the only content-write boundary.

## Architecture decisions

- Add a host-neutral Knowledge capture source ref:
  - `{ kind: 'repository', connectionId }` for Web/API.
  - `{ kind: 'local_vault' }` for Desktop.
- Source ref is owner-selected review metadata, not planner-generated content. It is carried in the
  durable `KnowledgeDraft`, preserved across revise/regenerate, and forwarded to persistence only
  when relevant.
- Keep deterministic `KnowledgeDocumentId` stable for the workflow run and revision-independent.
- Add a Repository-owned native capture review dialog/session used by both
  `KnowledgeProjectionWorkspaceView` and `LocalVaultWorkspaceView`.
- The native session owns title/topic/Markdown/path/tags/source validation, dirty/busy state,
  focus, confirm coordination and cancel. Its submit returns a validated snapshot; it **does not**
  write Knowledge content itself.
- Web source options come only from currently Ready repository bindings. Desktop exposes one
  Local Vault source when a vault binding exists.
- AI projection opens `/repository?dialog=knowledge-capture`, patches the native owner draft, and
  never calls Repository write APIs from the browser.
- Confirm flow: lock owner -> validate/read native snapshot -> issue `edit_structured` if needed
  -> approve Mastra -> host persistence writes through canonical owner capability -> deep-link to
  the stable created document.
- Restore reprojects authoritative runtime review into the native owner without overwriting a
  dirty same-run/revision session.
- Cancel closes the native owner and cancels Mastra; retry/recovery stays workflow-owned.
- `AIKnowledgeCapturePanel` becomes status/clarification/recovery/result + open-native controls.
  Raw stable IDs and AI-only edit toggles are removed from the normal product path.
- No in-app general Knowledge editor, no new Web content mutation route, and no direct
  `createConfirmedKnowledgeNote` call from `KnowledgeProjectionWorkspaceView`.

## Implementation phases

1. Extend Knowledge capture contracts/workflow/apply/persistence with durable host-neutral source
   identity and regression coverage.
2. Add Repository native capture session + review dialog, shell host, Web/Desktop registrations and
   source validation.
3. Migrate `useAIKnowledgeCapture` to native projection/reconciliation/confirm/cancel/restore.
4. Simplify AI panel/view normal path and preserve completed stable-document deep-link behavior.
5. Upgrade browser P0 journeys for review/approve/deep-link, refresh/restore and cancel; run focused
   suites, serial typechecks, hygiene, governance and independent diff review.

## Acceptance gates

- Web projection-only architecture specs remain green and explicitly reject browser content-write
  ownership.
- Desktop Local Vault ownership remains host-local; no absolute path crosses the AI contract.
- Multi-repository Web users must select/retain an explicit ready source; single ready binding can
  be projected automatically.
- Native edits must advance workflow revision before approve; persistence receives the selected
  source identity and deterministic KnowledgeDocumentId.
- Refresh/retry cannot duplicate a note or change its stable identity.
- Normal AI Knowledge capture contains no AI-owned business editor and no raw internal stable ID.

## Continuation evidence — 2026-10-02

Implementation and delegated verification are complete, pending ChatGPT Web review and acceptance.
This plan remains active and is neither accepted nor frozen. ChatGPT Web owns acceptance,
commit/push, batch merge and archive. The sole continuation writer worked on
`product/vnext-ai-8112` in the existing dirty worktree, launched no other writer and performed no
commit, push, merge or PR. No other worktree was edited.

### Fixture review and production findings

No material P0/P1 production defect surfaced, so this continuation changed no production seam.
The existing implementation was retained. Browser fixtures were tightened to:

- Validate Ready-binding, projected note, catalog and tree responses with current Repository schemas.
- Return precise catalog/tree responses; unrelated GET routes fall through rather than receiving
  an arbitrary empty object. Repository requests after capture starts are asserted GET-only.
- Assert the selected repository, stable document identity, edited title/revision and absence of
  the AI-only editor/confirm control, with `edit_structured -> approve -> host_persist` ordering.
- Prove refresh retrieves the same durable run without starting a replacement run.
- Retain completed/cancelled mock state on subsequent get and await cancellation telemetry,
  avoiding an assertion race with the native dialog closing.

Each test uses its own real registered account, browser context, route handlers, telemetry and
workflow maps. Refresh retains the page-scoped mock authority; no fake auth tokens are seeded.
Browser workflow/Repository responses are mocked: `host_persist` is boundary telemetry, not a
real GitHub write. API/Desktop adapter tests separately exercise host persistence mappings.

The normal Knowledge capture path renders the Repository dialog through the shell host, with no
AI-owned business editor or raw stable ID in the AI panel. Native submit validates a snapshot
without writing content. Mastra approves before host persistence; Web stays projection-only,
Desktop owns Local Vault, and only relative paths enter the AI contract. Focused runtime tests
cover deterministic document identity and preservation of owner source across revise/recovery.

### Fresh focused matrices and checks

| Gate                                                                                    | Actual result                                                                                                           |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| App-Vue native dialog/surface/composable/panel/chat/Web Repository/Local Vault/AppShell | 8 files / 71 tests passed                                                                                               |
| AI durable runtime, capture persistence, client workflow and deterministic identity     | 4 files / 17 tests passed                                                                                               |
| Contracts capture source/draft and knowledge-note DTO                                   | 2 files / 9 tests passed                                                                                                |
| API host persistence adapter                                                            | 1 file / 5 tests passed                                                                                                 |
| Desktop host persistence adapter                                                        | 1 file / 3 tests passed                                                                                                 |
| Total focused regressions                                                               | 16 files / 105 tests passed                                                                                             |
| contracts:typecheck, uncached                                                           | passed                                                                                                                  |
| ai:typecheck, uncached                                                                  | passed                                                                                                                  |
| app-vue:typecheck, uncached                                                             | passed                                                                                                                  |
| Targeted ESLint, all changed source/tests                                               | passed; final fixture edit checked again                                                                                |
| Prettier, all changed files                                                             | fails only on the two preserved Repository locale baselines                                                             |
| Final E2E fixture Prettier                                                              | passed                                                                                                                  |
| Test inventory                                                                          | passed: 1345 files (1164 unit, 34 integration, 3 smoke, 8 boundary-ipc, 8 boundary-main, 63 e2e, 2 perf, 63 governance) |
| git diff --check                                                                        | passed                                                                                                                  |
| Full uncached pnpm governance:check                                                     | passed: target plus 6 dependency tasks; runtime governance 34/34, HARD-7101 22/22 bindings                              |

The three typechecks ran sequentially with `nx run-many -t typecheck`, one project at a time,
`--skip-nx-cache --parallel=1`. Locale diffs remain +18/+17 lines, with no removals or unrelated
formatting churn. The two full-file formatting failures are also present on HEAD; the full
changed-file Prettier gate is not claimed green.

### Current-worktree isolated Knowledge P0

Read-only Prisma `migrate diff --from-config-datasource --to-schema` with the current test
configuration reported **No difference detected** before the existing test DB was reused.
No database push, accept-data-loss, reset or schema mutation command ran.

`api:build --skip-nx-cache` freshly built this worktree's API and all 27 dependency tasks.
The API then ran through `api:start` with task dependencies excluded, at `127.0.0.1:38112`;
`/healthz` reported `lane=e2e`. Web ran through this worktree's `web:serve` at
`127.0.0.1:48112`, with the established temporary deep-Vue/utils source aliases.
No API artifact from another worktree was used and no product runtime config was changed.

The final fixture has **3/3 passing P0 journeys across five test attempts**, not a clean
first-attempt 3/3 batch. Earlier fixture versions add four attempts, making nine total in this
continuation (four passes and five pre-workflow failures). Automatic retries were disabled.

| Invocation / P0              | UTC test start | Duration  | Result                          |
| ---------------------------- | -------------- | --------- | ------------------------------- |
| knowledge-p0 / Capture       | 10:08:12.941   | 16.757 s  | pre-workflow auth/shell failure |
| knowledge-p0 / Cancel        | 10:08:32.340   | 119.529 s | passed                          |
| knowledge-p0 / Restore       | 10:10:32.356   | 36.451 s  | pre-workflow auth/shell failure |
| capture-2 / Capture          | 10:12:11.166   | 16.615 s  | pre-workflow auth/shell failure |
| knowledge-p0-final / Capture | 10:15:16.824   | 42.718 s  | pre-workflow auth/shell failure |
| knowledge-p0-final / Cancel  | 10:16:01.315   | 21.864 s  | passed                          |
| knowledge-p0-final / Restore | 10:16:23.343   | 24.633 s  | passed                          |
| capture-4 / Capture          | 10:17:58.133   | 15.180 s  | pre-workflow auth/shell failure |
| capture-5 / Capture          | 10:18:57.852   | 20.419 s  | passed                          |

Capture passed native source selection and manual edit, revision 2 reconciliation, approval,
mocked host persistence and stable-document resolution/preview, with no legacy endpoint call.
Restore passed native dialog reopening with the same retrieved durable run and no persistence.
Cancel passed closure and cancellation with neither approval nor persistence.

Failed attempts occurred in real-auth registration/navigation or the initial app-shell wait,
before Knowledge workflow assertions. Retained traces show `ERR_NETWORK_CHANGED` and/or
failed dynamic import of `src/bootstrap/app.ts`. Initial overlapping verification builds also
triggered Vite reloads of dependency dist files; those contaminated attempts are recorded above.
After build-dependent checks finished, cancel/restore passed; capture passed after restarting the
dedicated Web server and retrying on the warm lane. No product assertions were weakened and no
production patch was made for startup failures.

Logs, JSON results, schema proof, temporary runners and failure traces/videos/screenshots are
under `/tmp/ai8112-continuation/`; the fresh API build log is
`/tmp/ai8112-current-api-build.log` and schema log is `/tmp/ai8112-current-schema-diff.log`.
No tracked Playwright report/result artifact changed, and no temporary runner was added to the repo.
Both dedicated API/Web servers were stopped after verification; isolated ports have no listeners.

### Outstanding findings and acceptance boundary

- P0/P1: no unresolved material product finding identified by this continuation.
- P2: pre-existing real-auth/app-bootstrap/network startup flake remains; repeated attempts were
  needed and a clean three-test batch is not claimed.
- P2: full-file Prettier flags two preserved Repository locale baselines; minimal locale changes
  were retained rather than introducing unrelated formatting churn.
- P2: the ordinary Web deep-Vue source alias setup still requires the established temporary
  isolated-lane override; runtime setup repair remains outside PVC-AI-8112.

## ChatGPT Web acceptance — 2026-10-02

**Accepted / frozen.** Independent review after delegated implementation confirmed:

- `knowledge.capture` review/edit ownership is Repository-native while Web remains projection-only;
- no production Vue path calls Repository/Local-Vault content-write APIs directly;
- Web source selection is limited to active Ready bindings and Desktop exposes only `local_vault` when bound;
- planner revise/regenerate cannot overwrite owner-selected source, while `edit_structured` can advance source/content together;
- approve fails closed without source and host persistence receives the durable source plus deterministic `KnowledgeDocumentId`;
- same-run/same-revision native reopen reuses/focuses the owner session without overwriting dirty edits; newer authority only reprojects a clean session;
- transient native projection failure preserves the durable workflow pointer and allows later reopen;
- completed capture is production-wired to `/repository?note=<stable-id>`; normal AI UI exposes no raw stable ID or AI-owned Knowledge business editor;
- native surface registration/disposal, KeepAlive lifecycle, busy/dirty/cancel behavior and no-write validation are covered by focused tests.

ChatGPT Web independently reran the critical acceptance matrix after the delegated writer exited:

- App-Vue native/orchestration critical set: **4 files / 37 tests passed**;
- AI runtime + persistence critical set: **2 files / 10 tests passed**;
- Knowledge capture contract critical set: **1 file / 2 tests passed**;
- independent hygiene scan: `git diff --check` clean, no new TODO/FIXME/HACK/`as any`, no direct Web Knowledge write path, no normal-path AI Knowledge editor remnants.

The delegated full gates remain valid: **16 files / 105 focused tests**, serial uncached contracts/ai/app-vue typechecks, full uncached governance (runtime governance 34/34 and HARD-7101 22/22), docs/inventory/diff checks, plus passing browser evidence for capture, cancel and refresh/restore on a freshly built current-worktree isolated lane.

Known non-blocking P2s remain outside this ticket: real-auth/Vite startup `ERR_NETWORK_CHANGED` flakiness, the temporary isolated-lane deep-Vue alias workaround, and pre-existing full-file Prettier baseline drift in the two Repository locale files. These did not alter product assertions or acceptance.

AI-8112 is ready for commit and canonical batch integration.
