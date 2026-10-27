/**
 * Setting Infrastructure Client - Transport Types
 *
 * Transport-specific interfaces and re-exports of port interfaces.
 */

import type { IResultHttpClient } from '@memoflow/http-client';

// ============ Transport Client Interfaces ============

export type { IResultHttpClient };

/**
 * IPC Client interface (Result-returning).
 * Canonical definition in @memoflow/ipc-client (ResultIpcClient).
 */
export type { IResultIpcClient } from '@memoflow/ipc-client';

// ============ Port Interface Re-exports ============
export type { ISettingApiClient } from '../../application-client/ports/setting-api-client.port';
