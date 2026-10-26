---
name: validate-local-deploy
description: Verify a deliberately requested local Docker/prod-like deployment scenario and produce structured evidence. Not the default PR validation path.
---

# Validate local deployment

Use this only when the user asks to validate local production-shaped behavior or a defect must be reproduced inside Docker. Routine development uses [AGENTS.md](../../../AGENTS.md) and `pnpm check:changed`; PR CI owns normal build-lane evidence.

Read [Local Docker](../../../docs/operations/local-docker.md) and [Runtime environments](../../../docs/operations/runtime.md). Ensure the current worktree and services are isolated from other agents and production state. Use the repository's existing tool rather than creating another validation checklist:

```bash
node tools/agent-skills/validate-local-deploy/scripts/run-validation.mjs --workspace <repo-root>
```

The script can run targeted Nx and local Docker checks and produces `reports/local-deploy-validation/latest.json` and `latest.md`. Confirm the actual commands and evidence before reporting success. If the container or toolchain prerequisites are unavailable, report that limitation rather than claiming a code regression. Do not modify production or bypass security gates.

The helper modules under `scripts/` also implement shared local-Docker evidence and are imported by repository tests; they must not be removed as though they were prompts.
