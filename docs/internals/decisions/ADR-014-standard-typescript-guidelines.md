# ADR-014: Standard - TypeScript Guidelines

## Status

Accepted

## Date

2026-01-15

## Context

TypeScript offers many ways to do things. Without standardization, we get a mix of `type` vs `interface`, `any`, and unsafe access patterns.

## Decision

We enforce strict TypeScript usage to maximize safety and compiler help.

### 1. Strict Mode

`"strict": true` is mandatory.

- No implicit `any`.
- Strict null checks required (`if (obj && obj.prop)`).

### 2. Imports

- Use `import type { ... }` for type-only imports to aid bundlers/transpilers.
  ```typescript
  import type { Task } from '@memoflow/task-contracts';
  ```

### 3. No Inline Types

Avoid defining complex types inline in function signatures. Use named types/interfaces in `contracts` or the file header.

### 4. Utility Types

Prefer standard utilities (`Partial<T>`, `Pick<T>`, `Omit<T>`) over re-declaring similar types manually.

### 5. Generics

Name generics meaningfully (`Repository<TEntity>`) instead of single letters (`Repo<T>`) unless trivial.

## Consequences

- **Positive:** Catch null pointer exceptions at compile time; Easier refactoring; Clearer intent.
- **Negative:** Slightly more verbose code (type guards, null checks).
