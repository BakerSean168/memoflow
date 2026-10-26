# ADR-009: Standard - Clean Architecture Layers

## Status

Accepted

> **关联 ADR-031（互补，非取代）**：本 ADR 定义分层原则与依赖方向（domain ← application ← infrastructure ← ui）。
> 服务端 feature 包这些层的**具体目录形态**（`domain-server/` `application-server/` `infrastructure-server/` …）
> 由 [ADR-031: Server Feature Standard Shape](./ADR-031-server-feature-standard-shape.md) 定义。
> 组合根允许 `domain`→`infra` 的例外见 [ADR-023](./ADR-023-server-side-clean-architecture-refactor.md) 与 `eslint.config.ts` 的 `layer:domain` 约束。

## Date

2026-01-15

## Context

Without strict architectural boundaries, business logic leaks into UI components, and database details pollute the domain. This leads to a rigid, hard-to-test codebase where changing a library (e.g., ORM, UI framework) breaks the entire application.

## Decision

We enforce a strict **Clean Architecture** with a unidirectional dependency flow.

### 1. Layers & Dependency Rules (Inner to Outer)

**Domain Layer (Core)**

- **Contains:** Entities, Value Objects, Domain Services, Repository _Interfaces_, Domain Events.
- **Dependencies:** ZERO. Must depend on nothing but itself (and shared Contracts).
- **Forbidden:** Importing from App, Infra, or UI layers.

**Application Layer (Use Cases)**

- **Contains:** Application Services, Use Case definitions, Command/Query handlers.
- **Dependencies:** Domain.
- **Forbidden:** Importing from Infra or UI.

**Infrastructure Layer**

- **Contains:** Database Implementations (Prisma), External Adapters (Stripe, Email), OS interactions (FileSystem).
- **Dependencies:** Domain, Application.

**Presentation Layer (UI)**

- **Contains:** Vue/React Components, Controllers, IPC Handlers.
- **Dependencies:** Application, Domain.

### 2. Layer Responsibilities

这些是**分层职责**，在每个 feature 包内以同名目录承载（`packages/<feature>/src/<layer>/`，
目录形态见 ADR-031），不是独立的顶层包：

- `contracts`: Shared types (No deps) —— 这是独立包。
- `domain-server`/`domain-client`: Pure business logic.
- `application-server`/`application-client`: Use cases.
- `infrastructure-server`/`infrastructure-client`: Technical implementations.
- `ui-*`: Visuals —— 独立包。

### 3. Code Example

```typescript
// Domain (Interface)
export interface ITaskRepository {
  save(task: Task): Promise<void>;
}

// Application (Use Case)
export class CreateTask {
  constructor(private repo: ITaskRepository) {} // Depends on abstraction
}

// Infra (Implementation)
export class PrismaTaskRepo implements ITaskRepository { ... } // Depends on Domain
```

## Consequences

- **Positive:** High testability (can mock Domain interfaces); Framework independence; Clear separation of concerns.
- **Negative:** More boilerplate files (Interfaces, Implementations, DTOs) compared to "Transaction Script" patterns.
