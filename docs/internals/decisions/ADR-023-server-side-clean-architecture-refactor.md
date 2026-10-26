# ADR-023: Server-Side Layer Decoupling & Pure Dependency Injection

**Status:** Accepted
**Date:** 2026-01-21
**Context:** Circular Dependency between `packages/application-server` and `packages/infrastructure-server`.

## Context

The current server-side architecture suffers from a bi-directional dependency cycle:

1.  **Valid:** `infrastructure-server` depends on `application-server` (to execute Use Cases).
2.  **Invalid:** `application-server` imports `infrastructure-server` to access Dependency Injection Containers (`GoalContainer`, `AccountContainer`) via static methods (`getInstance`).

This "Service Locator" anti-pattern inside the Application Layer violates the **Dependency One-Way Rule** of Clean Architecture. The Inner Layer (Application) is actively fetching implementation details from the Outer Layer (Infrastructure).

## Decision

We will refactor the system to strict **Pure Dependency Injection** and remove the Service Locator usage within the Application Layer.

### 1. Composition Root in Infrastructure

The **Composition Root** (the place where objects are wired together) will be exclusively located in the infrastructure/runtime layer.

- Module factories and runtime assembly code will instantiate Application Services.
- Concrete Repository implementations will be injected into the Service constructors.

### 2. "Passive" Application Services

Application Services class files must be "pure":

- **NO** static `getInstance()` methods.
- **NO** `import` statements referencing `@memoflow/infrastructure-server`.
- **NO** default parameter values that rely on global state.
- Dependencies are exclusively received via **Constructor Injection**.

### 3. Bootstrap Migration

Infrastructure-specific bootstrapping code (e.g., `SchedulerBootstrap`) that initializes libraries like `Bree` or `Prisma` must be moved from `application-server` to `infrastructure-server`.

## Detailed Design

**Before (Invalid):**

```typescript
// packages/application-server/src/goal/services/archive-goal.ts

export class ArchiveGoal {
  static getInstance() { ... } // ❌ Static State

  constructor(private repo = createOuterLayerDependency()) {} // ❌ Implementation coupling
}
```

**After (Valid):**

```typescript
// packages/application-server/src/goal/services/archive-goal.ts
import { IGoalRepository } from '@memoflow/domain-server/goal';

export class ArchiveGoal {
  // ✅ Pure Constructor Injection
  constructor(private readonly repo: IGoalRepository) {}

  async execute(id: string) { ... }
}
```

**Infrastructure Wiring:**
Repository implementations are created in the composition root and passed directly into use cases/services.

## Consequences

### Positive

- **Breaks Circular Dependency:** `application-server` no longer depends on `infrastructure-server`.
- **Testability:** Services can be easily unit tested with mocks without resetting global singletons.
- **Clarity:** Dependencies are explicit in the constructor signature.

### Negative

- **Refactoring Effort:** Requires updating ~50 service files and their call sites.
- **Boilerplate:** Composition roots must write explicit factory code for every service.
