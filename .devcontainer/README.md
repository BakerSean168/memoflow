# MemoFlow Codespaces configuration

Two cost-aware Dev Container profiles are available:

| Profile            | Path                                   | Environment                                                      |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------- |
| **Lite (default)** | `.devcontainer/devcontainer.json`      | Node 22.20.0, pnpm 11.20.0, GH CLI, SSHD; no Docker daemon       |
| **Full**           | `.devcontainer/full/devcontainer.json` | Lite plus Docker-in-Docker / Compose for API, PostgreSQL and E2E |

Both profiles match the root `package.json` pnpm version, use a non-root `vscode` user, and do not impose an artificial `--cpus=2 --memory=8g` container limit. Select the VM machine type in Codespaces. SSHD supports `gh codespace ssh`.

We intentionally **do not** auto-install the Nx monorepo, create a swapfile, copy `.env.example`, launch containers or mount repo-provided MCP settings into a user profile. Use task-scoped Codespaces secrets, never committed credentials. The preexisting `mcp-config.json` is still available as an optional editor reference.

## Creating workers

```bash
# Owner completes this interactively once on their trusted controller:
gh auth refresh -h github.com -s codespace

# Lite, typically 2-core
gh codespace create -R BakerSean168/memoflow -b main \
  --devcontainer-path .devcontainer/devcontainer.json \
  --idle-timeout 10m --retention-period 24h

# Full, choose 4-core or bigger if database/E2E resources require it
gh codespace create -R BakerSean168/memoflow -b main \
  --devcontainer-path .devcontainer/full/devcontainer.json \
  --idle-timeout 10m --retention-period 24h
```

Once connected:

```bash
bash .devcontainer/post-create.sh --check
pnpm install --frozen-lockfile   # when needed; not on every instance
pnpm exec nx show projects
pnpm exec nx affected -t lint,typecheck,test --base=origin/main
```

Use `gh codespace list` / `gh codespace ssh -c NAME` / `gh codespace stop -c NAME` / `gh codespace delete -c NAME`. Always commit and push a task branch before stopping/deleting the worker; never run production services inside it. Keep ports private and do not expose PostgreSQL.

Verified GitHub Education students receive **180 core-hours + 20 GB-month of storage** each month for personal-account Codespaces; this is a shared quota, not per repository. Check actual available usage and budgets before scheduling agents. No prebuild is enabled here.
