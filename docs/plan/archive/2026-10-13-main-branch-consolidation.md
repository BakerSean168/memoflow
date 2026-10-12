---
tags: [plan, maintenance, git]
description: Consolidate all useful MemoFlow work into main and remove redundant branches and worktrees.
created: 2026-10-13T00:00:00Z
updated: 2026-10-13T00:00:00Z
---

# Main branch consolidation

## Authorization and scope

The user requested review of every MemoFlow branch/worktree, integration of useful changes, repair of merge regressions, and a final main-only repository. This supersedes the earlier draft-only integration hold for PR #449, but does not imply production rollout, consumption of commercial model credits, or completion of untested cross-device/native-provider acceptance.

ChatGPT Web owns implementation and review. Do not start another implementation agent. Preserve running development/staging services and all user databases, credentials, and design files.

## Initial audit

- GCP: 13 worktrees (root plus 12 linked), 14 local branches, 2 stashes. Root main is at `1e79cbbadc4`, behind origin/main `4ba621daab0`, and contains uncommitted Provider, model-switching, public-error, and conversation-list repairs plus their tests/evidence.
- Eleven feature/fix branch tips have exactly the same Git tree as their recorded merged PR commits (#435, #437, #438, #439, #441, #442, #444, #445, #447, #448, #450). P72 is an ancestor of main. They are redundant, not missing implementations.
- PR #449 at `71b4343c29f` is useful and unmerged, based on current main; its exact-head CI is green. Review its documented remaining product acceptance limits honestly.
- Oracle2: clean root main and a detached historical prototype-source worktree. Inspect ignored runtime/design assets before removing the source worktree.
- WSL: Agent Fabric timed out and Tailscale reports the host offline. Do not claim this local copy has been inspected or cleaned.
- Release preparation automatically recreates a branch after main CI. Make preparation manual-only, with tests/documentation updated; close the pending metadata-only release PR without publishing a release.

## Execution

1. Commit the useful dirty root work on a temporary integration branch before switching or deleting anything. Review both stashes, preserving any genuinely unique material.
2. Integrate that checkpoint with PR #449/current main, resolving ownership, schema, UI lifecycle, test inventory, and generated-client conflicts deliberately.
3. Run relevant Nx unit/typecheck/lint/governance gates, isolated PostgreSQL/HTTPS-fixture browser tests, and build/runtime checks. Fix failures instead of weakening assertions.
4. Merge the reviewed result through a PR and verify exact-main CI. No production release/deployment is requested.
5. Delete proven redundant remote/local branches and clean linked worktrees, including temporary integration refs. Fast-forward retained host root checkouts to main. Drop superseded stashes only after the preservation audit.
6. Record exact SHAs, validation results, cleanup counts, and unreachable-host/remaining product-acceptance limits. Archive this plan at completion.

## Acceptance

Remote GitHub and each reachable repository contain only main, no redundant linked worktrees, and no uncommitted useful work. Useful implementation remains in main. Runtime data, credentials, and design assets remain intact. WSL is explicitly excluded until reachable; this is not evidence of cleanliness there.

## Implementation and review record

The implementation is consolidated in PR #449. This document is archived as the
implementation/audit record; the PR and its exact-head/main checks are the
source of truth for final merge and repository closure, not this pre-merge file.

- `4c84016f2ca`: preserve all useful dirty root changes before any branch cleanup.
- `15891020bb6`: merge the preservation commit with Ask User/business-surface work;
  resolve four source conflicts and regenerate four Prisma/inventory conflicts.
- `d567c913703`: repair the merged test contracts. The Ask User fixture now
  satisfies the real conversation interface and asserts list/activity refresh;
  the departure guard test checks each true departure, while behavioral tests
  preserve same-conversation model selection and drafts.

### Verified checks before archival

| Check                                | Result                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------- |
| Prisma generation and test inventory | Passed; 1,394 test files, no collection failures                           |
| AI runtime unit suite                | 109 files, 733 passed; one subprocess fixture excluded from the parent run |
| Focused merged UI/Goal regressions   | 4 files, 84 passed                                                         |
| Desktop Profile rerun                | 18 passed with the original timeout unchanged                              |
| Typecheck                            | 9 projects and 32 dependency tasks passed                                  |
| Affected lint                        | 41 projects passed, with existing warnings reported                        |
| Governance                           | Main gate and all 6 dependency tasks passed                                |
| Release workflow tests               | 20 passed                                                                  |
| Provider browser/API/PostgreSQL      | 4 passed; 1 credentialed live-provider canary intentionally not enabled    |

The first broad test run identified two test contract mismatches (fixed above)
and resource-contention timeouts in GoalDialog/Profile tests (passed on bounded
concurrency without changing assertions or timeout thresholds). The complete
UI/Desktop rerun, exact-head CI and production-shaped local Docker startup are
recorded in the PR final verification comment; they must pass before merge.
The browser suite used a newly created isolated PostgreSQL database and removed
only that database in its finally block. No commercial inference was invoked.

### Branch and worktree disposition

The 11 already-merged feature/fix branches were checked against the **entire
Git tree of their merged PR commit**, and each merge commit is an ancestor of
main. P72 is directly an ancestor of main. Thus squashed commit IDs were not
mistaken for unmerged implementations. Eleven linked GCP worktrees, 12 local
obsolete branches and 11 remote feature branches were removed after clean-status,
process-CWD and ignored-file checks.

Release PR #446 changed only the version manifest, CHANGELOG and package
versions. It was closed, its branch removed, and no version/tag was published.
Future release preparation is manual-only with successful-current-main exact-SHA
CI verification; publication retains its separate existing gates.

Oracle2's detached prototype source worktree was removed. Its generated
node_modules were moved into the canonical main checkout, and the old source
entry is now a symlink to that checkout. Prototype scripts, captures and design
assets outside the source worktree were retained.

Both root stashes were reviewed: every referenced path exists in the integrated
current tree; profile/BYOA documents and code have been merged or superseded by
the tested unified Agent Registry implementation. The final cleanup removes the
stashes only after their useful implementations are reachable from main. Historic
patch/tar review archives outside Git worktrees are not live branches and remain
unchanged.

### Final closure contract

After successful exact-head checks, merge PR #449 normally (no administrator
bypass), fast-forward both reachable canonical checkouts, remove the last linked
integration worktree and its two temporary local refs, and prune the remote head.
Require `git ls-remote --heads origin` to contain only main, each reachable
`git worktree list` to contain one canonical main checkout, empty status/stashes,
and no open PR. Record the final main SHA and post-merge CI in the PR audit.

WSL was offline and is **not** represented as inspected or clean. Real-provider,
cross-device, unarmed approval adoption/read-only restart persistence and streamed
answer continuation retain their existing product acceptance limits. Main-only
repository cleanup does not mean that every future product acceptance item is done.

Raw logs, branch SHA/tree proofs and the stash path audit are retained outside the
repository in `/home/dev/projects/.memoflow-consolidation-20261013/` so validation
does not leave another dirty worktree or branch.

## Exact-head CI regression repairs

The first consolidated exact-head CI run (`38287436740`, `7de6793795c`)
passed unit, coverage, typecheck, static analysis, build, boundary, performance
and governance checks, and identified the following remaining integration
contracts before merge:

- The synthetic Agent Registry E2E fixture had no live model-catalog endpoint.
  The composer correctly failed closed after discovery returned no models.
  The fixture now returns the schema-validated catalogue for its own synthetic
  provider only; production readiness and authorization checks are unchanged.
- The real-PostgreSQL Registry test still asserted first-Agent lifetime ownership.
  The useful same-conversation switching implementation intentionally maintains
  a mutable current selection. The test now verifies both concurrent selections
  succeed with one binding, a subsequent switch survives repository recreation,
  Owner/CAS/deletion protections remain, and the conversation and Provider
  defaults are unchanged. The existence check selects only provider ID instead
  of loading unrelated provider columns. The focused real-DB test passes.
- Four shared shell visual baselines used an explicitly empty Provider fixture.
  Manual image review confirmed the only changed pixels are the empty-state
  footer: an unusable model/permission selector becomes Open Provider settings.
  Only those four images were updated; shared web/desktop parity and the strict
  zero-difference threshold are unchanged.

The earlier local prod-like images started and migrated successfully, but a
browser preflight raced the web health check and a second preflight correctly
rejected a dirty-source revision mismatch. These are not recorded as browser
passes. Final browser evidence must come from a clean, exact-revision healthy
build after these repairs. Final CI/merge/cleanup evidence is attached to PR #449.
