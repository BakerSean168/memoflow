/**
 * Goal Infrastructure Client - Transport Types
 *
 * Transport-specific interfaces and re-exports of port interfaces.
 * Port interfaces moved to application-client/ports/.
 */

import type { IResultHttpClient } from '@memoflow/http-client';

// ============ Transport Client Interfaces ============
// Module only defines what it needs — concrete implementations injected from App layer.

// IResultHttpClient imported from @memoflow/http-client
export type { IResultHttpClient };

/**
 * IPC Client interface (Result-returning).
 * Canonical definition in @memoflow/ipc-client (ResultIpcClient).
 */
export type { IResultIpcClient } from '@memoflow/ipc-client';

// ============ Port Interface Re-exports ============
export type { IGoalApiClient } from '../../application-client/ports/goal-api-client.port';
