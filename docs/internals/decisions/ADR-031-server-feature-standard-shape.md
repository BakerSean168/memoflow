# ADR-031: Server Feature Standard Shape

## Status

Accepted

## Date

2026-05-25

## Context

The monorepo has **11** active business feature families in this shape (account, ai, authentication,
data-portability, goal, notification, reminder, repository, schedule, setting, task)
that share a common internal structure. The former `editor` feature package was retired under
ADR-034 (Obsidian Vault / GitHub knowledge repository); portable `editor_*` tables remain only
for re-importable business backups, not as a live feature package. This ADR documents the shape
so new modules stay consistent.

Additionally, `dashboard` is a read-model module that intentionally does NOT follow the full server feature shape — it has no write side, no controllers, no infrastructure-server.

`schedule-orchestration` is also not one of the 12 business feature packages.
It is a cross-feature orchestration package that owns schedule projection and
source-execution wiring between feature modules. Its current `ports/`,
`projectors/`, `runtime/`, `execution/`, and `infrastructure-server/` shape is
an explicit orchestration-package exception, not a template for new feature
packages. If it later grows API/client/electron seams, it should get its own ADR
or be migrated into the standard feature shape.

## Decision

### Standard Server Feature Shape

The canonical internal structure for business feature packages is:

```
packages/<feature>/
├── src/
│   ├── api/                    # Express route definitions
│   │   ├── routes/
│   │   ├── module.ts           # API module registration
│   │   └── index.ts
│   ├── client/                 # Stable renderer client seam
│   │   └── index.ts
│   ├── electron/               # Stable desktop main seam
│   │   └── index.ts
│   ├── server/
│   │   ├── domain/             # Pure business logic
│   │   │   ├── aggregates/     # Aggregate roots
│   │   │   ├── entities/       # Entities
│   │   │   ├── value-objects/  # Value objects
│   │   │   ├── services/       # Domain services
│   │   │   ├── repositories/   # Repository interfaces
│   │   │   └── index.ts
│   │   ├── application/        # Server-side use cases / application port
│   │   │   ├── use-cases/
│   │   │   │   ├── commands/
│   │   │   │   └── queries/
│   │   │   └── index.ts
│   │   ├── transport/          # Controllers and transport translation
│   │   │   └── index.ts
│   │   ├── infrastructure/     # Adapters, transport-neutral deep module, ingredient factories
│   │   │   ├── adapters/
│   │   │   ├── runtime/
│   │   │   ├── <feature>.module.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   └── index.ts                # Root barrel
├── project.json                # Nx config (tagged layer:domain)
└── package.json
```

The older `domain-server` / `domain-client` / `domain-shared` /
`application-server` / `application-client` / `infrastructure-server` /
`infrastructure-client` / `controllers` layout is a legacy transition shape.
It may exist temporarily behind an explicit migration baseline, but it is no
longer the architectural standard for new work.

### Layer Responsibilities

| Layer                   | Contains                                                                                                                                                                             | Depends On                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `server/domain`         | Entities, VOs, domain services, repo interfaces                                                                                                                                      | `contracts`                                   |
| `server/application`    | Use cases, command/query handlers, app port                                                                                                                                          | `server/domain`                               |
| `server/transport`      | Request/response handling, transport translation                                                                                                                                     | `server/application`                          |
| `server/infrastructure` | Prisma repos, PowerSync repos, runtime adapters, transport-neutral deep module (`<feature>.module.ts`), ingredient factories (`create*Repositories`); host composers select adapters | `server/domain`, `server/application`         |
| `api`                   | Express route + lifecycle adapter (transport only, host-composed instance)                                                                                                           | `server/infrastructure`, `server/application` |
| `client`                | Client service interface, factory functions                                                                                                                                          | `contracts`                                   |
| `electron`              | Desktop main seam: IPC + lifecycle adapter (transport only, host-composed instance)                                                                                                  | `client`, `contracts`                         |

### Composition Root Pattern

The composition root lives in the **host runtime composers**, not in the
feature package: `apps/api/src/runtime` and `apps/desktop/src/main/runtime`
select the concrete adapters (Prisma / PowerSync), build repositories via the
package ingredient factories (`create*Repositories`), and assemble the
transport-neutral feature instance (see "Composition Ownership" below). The
feature package's module factory (`server/infrastructure/<feature>.module.ts`)
is a transport/lifecycle adapter, not the composition path; package-internal
convenience roots may remain for rollback during migration, but they are not
the composition root. Keeping ingredient factories and adapters inside a
`layer:domain` tagged package is allowed because:

- They are infrastructure assembly code, not domain logic
- The ESLint `layer:domain -> layer:infra` rule exists specifically for this pattern
- Package-internal boundary enforcement is now implemented as a repo-level governance audit
  (`tools/governance/package-internal-boundary-audit.mjs`) and runs via
  `pnpm nx run memoflow:governance-check`
- Some tracked known violations may still exist temporarily, but they are treated as
  explicit technical debt to remove, not as absence of the rule

### Composition Ownership

Long-term composition ownership lives in the **host runtime composers**, not in
the package transport modules:

- `apps/api/src/runtime` and `apps/desktop/src/main/runtime` select the concrete
  adapters (Prisma / PowerSync), build repositories and runtime adapters, assemble
  the transport-neutral feature instance, and turn it into an already-bound module
  handle (real-owner examples include Goal, Task, Account and Notification composers).
- Package `api` / `electron` modules are transport + lifecycle adapters only:
  `register()` wires routes/IPC handlers and starts the pre-assembled instance,
  `destroy()` disposes it. They never read `context.db` and never construct
  repositories/use cases.
- Packages expose **ingredient factories** (`create*Repositories`) through the
  package root so hosts can select adapters without importing concrete adapter
  classes; concrete `*PrismaRepository` / `*PowerSyncRepository` classes stay
  internal to the package.
- RefArch Phase 6 established shared `ServerModuleHandle<TContext>` and the canonical
  transport-only `ServerTransportModuleContext` (no `db`). The `context.db` fallback
  is retired; future changes validate the contract on a real-owner vertical slice before
  broader rollout.

### Client Creation Language

All client-side services expose a unified factory function:

```typescript
export function createXxxServiceFromHttpClient(httpClient: IResultHttpClient): XxxClientService;
```

This pattern remains the target for business feature packages. During the
rollout period, repository governance scripts maintain an explicit legacy baseline for
packages not yet migrated to the canonical `server/*` layout.

### Read-Model Exception

Modules that are pure read-models (like `dashboard`) use a simplified shape:

- `src/domain/` — projection logic and port interface (`DashboardReadSource`)
- No infrastructure-server, no controllers, no api
- API/Desktop adapters wire their own data sources to the port interface

## Consequences

- New feature packages have a clear template to follow
- The composition root pattern is documented and justified
- Read-model modules have a recognized exception path
- Package-internal layering is already guarded by repo-level governance audit
- A future enhancement is to decide whether parts of that audit should also move into ESLint
