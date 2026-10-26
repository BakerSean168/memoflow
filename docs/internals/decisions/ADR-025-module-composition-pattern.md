# ADR-025: Module Composition Pattern

**Status:** Accepted
**Date:** 2026-01-21
**Context:** Monorepo architecture optimization and Dependency Injection strategy.

## Context

As we refactor to Clean Architecture (ADR-023), we are moving away from Global Singletons (`Container.getInstance()`) in the Infrastructure layer.
We need a standard pattern for how the `apps/api`, `apps/worker`, and other applications assemble the system.

## Decision

We will adopt the **Module Composition Pattern**.

### 1. Infrastructure Modules

Each domain in `packages/infrastructure-server` will export a **Module Class** (e.g., `GoalModule`, `AccountModule`).
This class is responsible for:

- Accepting "Global Dependencies" (DB Connection, Event Bus, Config) in its constructor.
- Instantiating concrete Repositories.
- Instantiating Application Services with those Repositories.
- Exposing the instantiated Services as public readonly properties.

### 2. Composition Root (The App)

The Application Entry Point (`main.ts` in `apps/api`) acts as the Composition Root.

- It initializes the fundamental technical drivers (Prisma, Redis).
- It instantiates the Infrastructure Modules.
- It passes the Services from the Modules to the Interface Layer (Controllers/Routes).

## Example

**Infrastructure Module:**

```typescript
export class GoalModule {
  public readonly archiveGoal: ArchiveGoal;

  constructor(prisma: PrismaClient) {
    const repo = new PrismaGoalRepository(prisma);
    this.archiveGoal = new ArchiveGoal(repo); // DI Wiring happens here
  }
}
```

**Application Assembly:**

```typescript
// apps/api/src/main.ts
const prisma = new PrismaClient();
const goalModule = new GoalModule(prisma); // Wire the module

// Pass service to route factory
const goalRouter = createGoalRouter(goalModule.archiveGoal);
```

## Consequences

- **Explicit Wiring:** No hidden dependencies.
- **Multi-App Support:** Easy to reuse the same `GoalModule` in CLI or Worker apps.
- **Testing:** Easy to swap `GoalModule` with `MockGoalModule` in integration tests.

## Update: Host Runtime Composers Own Assembly (2026-08-13)

Since this ADR, the composition responsibility has narrowed from module classes
to dedicated **host runtime composers** (reference: `apps/api/src/runtime/compose-governance.ts`
and `apps/desktop/src/main/runtime/compose-governance.ts`):

- Host runtimes (`apps/api/src/runtime`, `apps/desktop/src/main/runtime`) select the
  concrete adapters (Prisma / PowerSync), build repositories and runtime adapters,
  assemble the transport-neutral feature instance, and bind it into a module handle
  before `register()` is ever called.
- Package `api` / `electron` modules are **transport + lifecycle adapters**, not
  composition roots: `register()` wires routes / IPC handlers against the pre-assembled
  instance and starts it; `destroy()` disposes it. They never read `context.db` or
  construct repositories/use cases.
- Packages expose **ingredient factories** (`create*Repositories`) through the package
  root so hosts can pick adapters without importing concrete adapter classes; concrete
  `*PrismaRepository` / `*PowerSyncRepository` classes remain internal.
- RefArch Phase 6 governance-first contract: module handles extend the shared
  `ServerModuleHandle<TContext>` and registration contexts are transport-only
  (`ServerTransportModuleContext`, no `db`). The `context.db` fallback is retired —
  all modules receive their database/adapters/application instance through host-bound
  options before `register()`; the migration converges sibling modules onto host
  composers in Phase 6 rather than temporarily reading `context.db`.

This keeps the original ADR-025 intent (explicit wiring, multi-app reuse, testability)
while moving the wiring seam to the outermost runtime, so feature packages expose
stable ingredient factories and transport adapters instead of performing assembly
themselves.
