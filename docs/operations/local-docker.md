# Local Docker validation

Local `prod-like` is an **opt-in diagnostic lane**, not a mandatory step for every PR. Normal Web/API/Desktop development and PR CI use the host development and targeted test lanes.

Use the checked-in compose and preflight commands; never copy old GCP Dev configuration or reuse a live production database.

```bash
pnpm runtime:preflight:prod-like
pnpm docker:local:up
# Run the affected smoke/contract flow.
pnpm docker:local:down
```

The stack is described by [`docker-compose.local.yml`](../../docker-compose.local.yml) and `tools/runtime/profiles.json`; the `prod-like` port block is distinct from `host-dev`. Production-shaped tests must use isolated data and loopback bindings unless an explicit TLS ingress is configured. Stop the stack after the investigation.

Prefer CI build-lane evidence for ordinary Docker/runtime changes; use this lane when the problem only reproduces in the container or an operator explicitly requests local production-shaped validation. See [Testing](./testing.md) and [Runtime environments](./runtime.md).
