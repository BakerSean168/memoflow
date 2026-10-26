# MemoFlow — Agent instructions

This is the only repository-wide instruction file. `CLAUDE.md` imports it; other integrations must refer here rather than copy rules. User instructions take precedence over defaults below.

## What to trust

Read the relevant code, tests and configuration first; use `docs/` for decisions the code cannot explain. If docs disagree with code, fix the docs. Use CodeGraph for symbols/call chains and Nx tools for affected projects when available.

MemoFlow is a Vue/Web + Electron/Desktop + Express/Mastra monorepo. Business ownership is in real modules (Goal, Task, Schedule, Notification, Knowledge, etc.). Cross-surface contracts, API/IPC transport and persistence boundaries must remain consistent. Do not invent a reference business module or a second governance runtime.

## Work safely

- GitHub Issues own requirements, implementation decisions, acceptance and handoffs. Git commits record the implementation; PRs and CI record delivery evidence. Do not add task plans, reviews or scratch logs to `docs/`.
- Keep PRs focused; do not force-push or push directly to `main`.
- PRs may merge when their required checks pass, subject to GitHub rules and merge conflicts. Do not require every agent to wait for another PR or for post-merge Main CI before starting an independent task.
- For a complex handoff or interruption, leave a short checkpoint on the Issue: branch, commit, tests, blocker and next action. Do not duplicate it in a repository document.
- Prefer the simplest fix that preserves current behavior and required contracts. No speculative compatibility shims or architecture for imaginary features.

## Develop and verify

- Use `pnpm` and explicit Nx targets: `pnpm nx run <project>:<target>`. Web/API/Desktop start commands: [Development](docs/operations/development.md).
- Iterate with the nearest relevant test (`pnpm exec vitest run <file>` or a package Nx target). Add a focused failing regression test for a logic or protocol bug; provide before/after evidence for visual-only changes.
- Before pushing, run `pnpm check:changed` for code changes; for documentation or governance changes run `pnpm nx run memoflow:docs-check` and `pnpm nx run memoflow:governance-check`. CI owns broad suites; don't run repo-wide lint/test/typecheck locally by default.
- Run specialized integration, browser, Desktop or container tests only when the change crosses their boundary. Test owners and commands: [Testing](docs/operations/testing.md).
- Never operate on live credentials, production data or persistent user profiles for development. Isolate test databases and dev services.

## Documentation

- [Docs index](docs/README.md) routes to [internals](docs/internals/README.md) (architecture/decisions), [operations](docs/operations/README.md) (development/release), and [product contracts](docs/internals/product/README.md).
- Add a permanent document only for a cross-component decision, an operational procedure or a surprising constraint absent from code/tests. Prefer editing the existing canonical page.
- Do not maintain file catalogs, dated implementation reports, task plans, duplicated prompts or commented-out legacy workflows in the repository. Historical detail is in Git/Issues/PRs.
- Engineering rules executable by lint, Nx or governance checks belong in code/config; documentation explains why when necessary. Relevant [standards](docs/internals/standards/README.md) and [ADRs](docs/internals/decisions/README.md) are read on demand.

## Client integrations

`CLAUDE.md` is `@AGENTS.md`; `.github/copilot-instructions.md` contains only Copilot-specific guidance. Reusable project skills live in `tools/agent-skills/`; consult them only when applicable.
