# Runtime environments

The authoritative definitions are [`tools/runtime/profiles.json`](../../tools/runtime/profiles.json) and the `tools/runtime/` scripts. This page is an operator entry point, not a second port registry.

MemoFlow's current development workstation is **Windows WSL**. The former GCP Dev server was retired. Do not assume hostnames embedded in older profiles describe a live server; staging and production deployment status must be verified independently.

| Lane        | Purpose                                                          | Default port block |
| ----------- | ---------------------------------------------------------------- | ------------------ |
| `host-dev`  | WSL host development, API/Web hot reload                         | 20220–20239        |
| `prod-like` | Optional local Docker production-shaped validation               | 20200–20219        |
| `staging`   | Separate configured deployment surface; verify host availability | 20250–20269        |
| `prod`      | Production; not a local development lane                         | Deployment-owned   |

Local development command and preflight:

```bash
pnpm runtime:preflight:host-dev
pnpm nx run api:serve
pnpm nx run web:serve
```

The host-dev profile currently assigns Web 20220, API 20221, PowerSync 20222, PostgreSQL 20230 and Redis 20231. Exact overrides, service URLs, compose ownership and environment loading must come from the profile and active local environment, not this table. Dedicated E2E/test infrastructure has separate port ownership.

Use `pnpm runtime:preflight:prod-like` before starting a local Docker validation lane. Bind API/Web/PowerSync locally unless a trusted TLS terminator is deliberately configured. Do not route local tests into production or a concurrently running worktree's database.

For worktree isolation and Nx commands, see [Development](./development.md). For targeted container verification, see [Local Docker](./local-docker.md).
