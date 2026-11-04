import { createAuthenticatedIpcWrapper } from '@memoflow/host-runtime/electron-ipc';
import type { AITransportModuleInstance } from '../../server/infrastructure';

export type StreamSession = {
  abortController: AbortController;
  webContentsId: number;
};

/**
 * Shared per-handle state passed to each channel group registrar.
 * 传给各通道组注册器的同一 handle 共享状态。
 */
export interface AIElectronHandlerDeps {
  readonly instance: AITransportModuleInstance;
  readonly activeStreamSessions: Map<string, StreamSession>;
  readonly workspaceOwners: Map<string, { identityId: string; webContentsId: number }>;
  readonly workspaceAcks: Map<string, { cursor: string; resolve: () => void }>;
  readonly installed: string[];
}

export const withAuthenticatedValue = createAuthenticatedIpcWrapper({
  unexpectedErrorCode: 'INTERNAL_ERROR',
  unexpectedErrorMessage: 'AI operation failed',
});
