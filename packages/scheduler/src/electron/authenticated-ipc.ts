import { createAuthenticatedIpcWrapper } from '@memoflow/host-runtime/electron-ipc';
export const withAuthenticatedValue = createAuthenticatedIpcWrapper({
  unexpectedErrorCode: 'INTERNAL_ERROR',
  unexpectedErrorMessage: 'Scheduler IPC failed',
});
