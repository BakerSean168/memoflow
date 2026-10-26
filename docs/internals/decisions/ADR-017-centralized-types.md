# ADR-017: Absolute Type Centralization in Contracts

## Status

Superseded by ADR-049

## Supersession note

Absolute type centralization is no longer the target architecture. ADR-049 adopts boundary-first contracts: stable wire/public/durable types remain in `@memoflow/contracts`, while domain models and implementation-specific types remain in the owning feature.

## Context

Type definitions (Interfaces, DTOs, Enums) are currently scattered across `apps/`, `packages/domain`, and `packages/contracts`. This causes duplication, inconsistency, and confusion about the "Source of Truth".

## Decision

We enforce **Absolute Type Centralization**.

### The Rule

**All public data types, business entities, DTOs, and shared enumerations MUST reside in `@memoflow/contracts`.**

### Scope

- **MUST be in Contracts**:
  - Domain Entities Interfaces (`interface Task`).
  - API Request/Response DTOs (`interface CreateTaskDTO`).
  - Database Model interfaces (if shared).
  - Enums (`enum TaskStatus`).
  - React Component Prop Interfaces (if using domain objects).
- **ALLOWED in other packages**:
  - Private helper types (not exported).
  - Implementation-specific types (e.g., specific Prisma raw result types that never leave the repo).
  - Unit test mock types.

### Implementation

- `packages/contracts` becomes the **Type Registry** of the system.
- Other packages import types: `import type { Task } from '@memoflow/contracts/task';`.
- It is **FORBIDDEN** to `export interface` a domain object from `packages/domain-*`. Domain classes should `implements` the interface from Contracts.

## Consequences

- **Positive**:
  - Single source of truth.
  - Zero ambiguity for AI Agents on where to find types.
  - API and Frontend always in sync.
- **Negative**:
  - `packages/contracts` will grow large (must use submodule folders).
  - Making a change to a model requires editing `contracts` first, then the implementation.
