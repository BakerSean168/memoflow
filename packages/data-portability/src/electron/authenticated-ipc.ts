import { createAuthenticatedIdentityIpcWrapper } from '@memoflow/host-runtime/electron-ipc';

export const withAuthenticatedIdentity = createAuthenticatedIdentityIpcWrapper({
  unexpectedErrorCode: 'INTERNAL_ERROR',
  unexpectedErrorMessage: 'DataPortability IPC failed',
});
