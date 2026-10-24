# ADR-008: Standard - API Response Format

## Status

Accepted

## Date

2026-01-15

## Implementation note (Residual 617 / 2026-07-22)

Stage-6 deleted the zero-consumer `ActionResult` / `actionOk` dual-track helpers from
`@memoflow/contracts/result`. Transport truth is **only** `Result<T>` plus boundary
envelopes `IpcResult<T>` / `HttpResponse<T>`. Do not reintroduce `success: boolean`
or `ActionResult`-style parallel types.

## Context

Inconsistent API response formats make frontend integration and cross-service communication error-prone. Different modules using `success: true`, `ok: true`, or just returning raw data leads to confusion and defensive programming overhead.

## Decision

All operations must return a unified response object structure. We adopt the `ok: boolean` pattern defined in `@memoflow/contracts`.

### 1. Unified Response Structure

```typescript
interface BaseResponse<T> {
  ok: boolean; // ✅ REQUIRED: Indicates operation success/failure
  data?: T; // OPTIONAL: Result payload on success
  error?: ErrorInfo; // OPTIONAL: Error details on failure
}
```

### 2. Forbidden Patterns

- ❌ `success: boolean` (Do not use "success")
- ❌ Raw data return (e.g., returning just `User` object instead of `{ ok: true, data: User }` for operations prone to failure)

### 3. Usage of Contract Types

Implementations must use the exact types from `@memoflow/contracts/result`:

- **All operations:** `Result<T>` (`ok` / `fail` / `error` helpers)
- **IPC boundary:** `IpcResult<T>` (`toIpcResult` / `fromIpcResult`)
- **HTTP boundary:** `HttpResponse<T>` (`toHttpResponse` / `fromHttpResponse`)
- **Batch payloads:** `BatchResult<T>` / `okBatch` when a multi-item summary is needed

### 4. Code Example

```typescript
import type { Result } from '@memoflow/contracts/result';
import { ok, fail } from '@memoflow/contracts/result';

// Correct
export async function getUser(id: string): Promise<Result<User>> {
  try {
    const user = await db.find(id);
    return ok(user);
  } catch (e) {
    return fail({ code: 'INTERNAL_ERROR', message: 'Failed to load user' });
  }
}
```

## Consequences

- **Positive:** Predictable client-side error handling; Type safety across the stack.
- **Negative:** Legacy endpoints returning raw JSON must be refactored to wrap responses.
