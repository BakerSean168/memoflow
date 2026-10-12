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
