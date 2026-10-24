/**
 * Data Portability Infrastructure Client
 */

export type {
  IDataPortabilityApiClient,
  IResultHttpClient,
  IResultIpcClient,
} from './adapters/types';
export {
  DataPortabilityHttpAdapter,
  createDataPortabilityHttpAdapter,
} from './adapters/http/data-portability-http.adapter';
export { DataPortabilityIpcAdapter } from './adapters/ipc/data-portability-ipc.adapter';
