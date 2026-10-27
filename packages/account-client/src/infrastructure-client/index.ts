/**
 * Account Infrastructure Client Layer - Barrel Export
 */

// Types (port interfaces + transport interfaces)
export type { IResultIpcClient, IAccountApiClient } from './adapters/types';

// Adapters
export {
  AccountHttpAdapter,
  createAccountHttpAdapter,
  createAccountHttpAdapters,
  AccountIpcAdapter,
  createAccountIpcAdapter,
  createAccountIpcAdapters,
} from './adapters';
