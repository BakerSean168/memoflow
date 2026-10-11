import type { ExecutionContext } from '@memoflow/contracts/shared';
export function executionContext(requestContext: {
  getRaw(key: string): unknown;
}): ExecutionContext {
  if (requestContext.getRaw('permissionMode') === 'read-only')
    throw new Error('Read-only Assistant cannot execute MemoFlow data mutations');
  const raw = requestContext.getRaw('executionContext');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('MemoFlow product command requires canonical executionContext');
  }
  const context = raw as Record<string, unknown>;
  const identityId = typeof context.identityId === 'string' ? context.identityId.trim() : '';
  const requestId = typeof context.requestId === 'string' ? context.requestId.trim() : '';
  const traceId = typeof context.traceId === 'string' ? context.traceId.trim() : '';
  const startedAt = context.startedAt;
  const source = context.source;
  if (
    !identityId ||
    !requestId ||
    !traceId ||
    typeof startedAt !== 'number' ||
    !Number.isFinite(startedAt) ||
    (source !== 'http' && source !== 'ipc' && source !== 'system')
  ) {
    throw new Error('MemoFlow product command requires canonical executionContext');
  }
  return { identityId, requestId, traceId, startedAt, source };
}

export function identityId(requestContext: { getRaw(key: string): unknown }): string {
  const value = requestContext.getRaw('identityId');
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('MemoFlow product read requires authenticated identityId');
  }
  return value;
}
