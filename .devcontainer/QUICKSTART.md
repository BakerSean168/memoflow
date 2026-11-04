# MemoFlow Codespaces quickstart

1. Choose Lite: `gh codespace create -R BakerSean168/memoflow -b main --devcontainer-path .devcontainer/devcontainer.json --idle-timeout 10m --retention-period 24h`.
2. Connect via `gh codespace ssh` (or VS Code). Run `bash .devcontainer/post-create.sh --check`.
3. If the task needs dependencies: `pnpm install --frozen-lockfile`. Do not remove or rewrite `pnpm-lock.yaml` to fix installation issues.
4. Edit on a task branch and run targeted checks: `pnpm exec nx affected -t lint,typecheck,test --base=origin/main`.
5. Push changes and open a PR; `gh codespace stop -c NAME` then delete the unused Codespace.

Choose Full with `--devcontainer-path .devcontainer/full/devcontainer.json` only for Docker/DB/Playwright tasks. The Full profile installs the Docker toolchain, but does not auto-start services or install all project dependencies. See [README](README.md).

The GitHub Education personal-account allowance is **180 core-hours and 20 GB-month storage per month**. Always confirm actual remaining billing quota before automatic creation.
