/** Planner/Calendar client seam. */
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import {
  createScheduleClientService,
  createScheduleServiceFromHttpClient,
  type ScheduleClientPort,
} from '../application-client';
import {
  ScheduleEventHttpAdapter,
  createScheduleEventHttpAdapter,
} from '../infrastructure-client/adapters/http';
import {
  ScheduleEventIpcAdapter,
  createScheduleEventIpcAdapter,
} from '../infrastructure-client/adapters/ipc';
import type { IScheduleEventApiClient } from '../infrastructure-client/adapters/types';

export type {
  IResultHttpClient,
  IResultIpcClient,
  IScheduleEventApiClient,
  ScheduleClientPort,
};

export function createScheduleHttpClient(httpClient: IResultHttpClient): ScheduleClientPort {
  return createScheduleServiceFromHttpClient(httpClient);
}

export function createScheduleIpcClient(ipcClient: IResultIpcClient): ScheduleClientPort {
  return createScheduleClientService(createScheduleEventIpcAdapter(ipcClient));
}

export {
  ScheduleEventHttpAdapter,
  ScheduleEventIpcAdapter,
  createScheduleClientService,
  createScheduleEventHttpAdapter,
  createScheduleEventIpcAdapter,
};
