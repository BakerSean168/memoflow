/**
 * Account Module - Adapter Types
 *
 * Local transport interfaces for dependency inversion.
 * Modules define their own transport interfaces and accept injected implementations.
 */

// Re-export the port interface from application-client
export type { IAccountApiClient } from '../../application-client';

/**
 * IPC Client interface (Result-returning).
 * Canonical definition in @memoflow/ipc-client (ResultIpcClient).
 */
export type { IResultIpcClient } from '@memoflow/ipc-client';
