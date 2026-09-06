/**
 * Schedule client seam.
 *
 * Calendar commands remain product-facing. Raw Scheduler worker jobs are
 * exposed as read-only diagnostics only.
 */

import type { IResultHttpClient } from '@memoflow/http-client';
import {
  createScheduleClientService,
  createScheduleServiceFromHttpClient,
  type ScheduleClientPort,
} from '../application-client';
import { ScheduleTask } from '../domain-client';
import {
  ScheduleEventHttpAdapter,
  ScheduleTaskHttpAdapter,
  createScheduleHttpAdapters,
  type ScheduleHttpAdapters,
} from '../infrastructure-client/adapters/http';
import {
  ScheduleEventIpcAdapter,
  ScheduleTaskIpcAdapter,
  createScheduleIpcAdapters,
  type ScheduleIpcAdapters,
} from '../infrastructure-client/adapters/ipc';
import type {
  IScheduleEventApiClient,
  IScheduleTaskApiClient,
  IResultIpcClient,
} from '../infrastructure-client/adapters/types';

export type {
  IResultHttpClient,
  IResultIpcClient,
  IScheduleEventApiClient,
  IScheduleTaskApiClient,
  ScheduleClientPort,
  ScheduleHttpAdapters,
  ScheduleIpcAdapters,
};

export function createScheduleHttpClient(httpClient: IResultHttpClient): ScheduleClientPort {
  return createScheduleServiceFromHttpClient(httpClient);
}

export function createScheduleIpcClient(ipcClient: IResultIpcClient): ScheduleClientPort {
  const adapters = createScheduleIpcAdapters(ipcClient);
  return createScheduleClientService(adapters.event, adapters.task);
}

export {
  ScheduleEventHttpAdapter,
  ScheduleEventIpcAdapter,
  ScheduleTask,
  ScheduleTaskHttpAdapter,
  ScheduleTaskIpcAdapter,
  createScheduleClientService,
  createScheduleHttpAdapters,
  createScheduleIpcAdapters,
};
