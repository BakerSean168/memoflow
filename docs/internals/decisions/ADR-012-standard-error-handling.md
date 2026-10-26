# ADR-012: Standard - Error Handling

## Status

Accepted — Amended by ADR-049

## Date

2026-01-15

## Implementation note (Residual 617 / 2026-07-22)

Boundary layers convert thrown/structured errors into `Result<T>` failures
(`fail` / `error`), then map to `IpcResult` or `HttpResponse` at the transport edge.
Do not convert to retired `ActionResult` helpers.

## 2026-08-17 amendment

ADR-049 replaces the single AppError/DomainError-with-HTTP model with separate Domain Fault, Operation Outcome, Public Failure, Provider Failure, Transport Projection and Diagnostic Failure ownership. Existing structured Result boundaries remain protected during migration.

## Context

Random error throwing (strings, generic Errors) and inconsistent catching make debugging impossible. A unified error strategy is needed for reliable operation.

## Decision

We adopt a typed classification of errors and a structured handling pattern.

### 1. Custom Error Types

Use specific error classes extending a base `AppError`.

- `NotFoundError`: Resource missing (404).
- `ValidationError`: Bad input (422).
- `AppError`: Generic application base.

### 2. Error Codes

Errors must carry a machine-readable `code` (e.g., `AUTH_TOKEN_EXPIRED`, `TASK_NOT_FOUND`) to allow frontend localization and logic.

### 3. Try/Catch & Result Pattern

- **Service Layer:** Throw specific errors (`throw new NotFoundError()`) to abort logic flow.
- **Boundary Layer (Controller/IPC):** Catch exceptions and convert them to `Result<T>`.
  ```typescript
  import { ok, fail } from '@memoflow/contracts/result';

  try {
    await service.doIt();
    return ok(null);
  } catch (e) {
    // Convert exception to serializable Result failure
    return fail({ code: 'INTERNAL_ERROR', message: 'Operation failed' });
  }
  ```

### 4. Forbidden

- ❌ `throw "string"`
- ❌ Silent `catch (e) { }` (swallowing errors).
- ❌ Returning generic "Error" without codes.

## Consequences

- **Positive:** Frontend can react to specific errors (e.g., show login modal on `AUTH_EXPIRED`); Logs are meaningful.
- **Negative:** Requires wrapping external library errors (e.g., catching Prisma errors and re-throwing AppErrors).
