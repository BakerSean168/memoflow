import { createAuthenticatedIpcWrapper } from '@memoflow/host-runtime/electron-ipc';

/**
 * Account IPC auth wrapper — resolves the canonical `ExecutionContext` once per
 * invocation (RefArch Phase 2) and passes it to the controller/application.
 */
export const withAuthenticatedValue = createAuthenticatedIpcWrapper({
  unexpectedErrorCode: 'INTERNAL_ERROR',
  unexpectedErrorMessage: 'Account IPC failed',
});
