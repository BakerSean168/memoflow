/**
 * Setting Module - Infrastructure Client
 *
 * Adapters for Setting module communication.
 */

// Port Interfaces
export type { ISettingApiClient, IResultHttpClient, IResultIpcClient } from './adapters/types';

// HTTP Adapters
export {
  SettingHttpAdapter,
  createSettingHttpAdapters,
  type SettingHttpAdapters,
} from './adapters/http';

// IPC Adapters
export {
  SettingIpcAdapter,
  createSettingIpcAdapters,
  type SettingIpcAdapters,
} from './adapters/ipc';
