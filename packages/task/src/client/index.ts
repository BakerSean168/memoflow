/**
 * Task client seam.
 *
 * Task vNext exposes Action + Execution only. Project-management graph/folder
 * helpers are intentionally absent from this public surface.
 */
import type { IResultHttpClient } from '@memoflow/http-client';
import {
  TaskClientService,
  createTaskClientService,
  createTaskServiceFromHttpClient,
  type TaskClientPort,
} from '../application-client';
import { TaskOccurrence } from '../domain-client/aggregates/task-occurrence';
import { TaskPlan } from '../domain-client/aggregates/task-plan';
import {
  TaskOccurrenceHttpAdapter,
  TaskPlanHttpAdapter,
  createTaskHttpAdapters,
  createTaskOccurrenceHttpAdapter,
  createTaskPlanHttpAdapter,
  type TaskHttpAdapters,
} from '../infrastructure-client/adapters/http';
import {
  TaskOccurrenceIpcAdapter,
  TaskPlanIpcAdapter,
  createTaskIpcAdapters,
  createTaskOccurrenceIpcAdapter,
  createTaskPlanIpcAdapter,
  type TaskIpcAdapters,
} from '../infrastructure-client/adapters/ipc';
import type {
  IResultIpcClient,
  ITaskOccurrenceApiClient,
  ITaskPlanApiClient,
  TaskPlanListParams,
} from '../infrastructure-client/adapters/types';

export type {
  IResultHttpClient,
  IResultIpcClient,
  ITaskOccurrenceApiClient,
  ITaskPlanApiClient,
  TaskClientPort,
  TaskHttpAdapters,
  TaskIpcAdapters,
  TaskPlanListParams,
};

export function createTaskHttpClient(httpClient: IResultHttpClient): TaskClientPort {
  return createTaskServiceFromHttpClient(httpClient);
}

export function createTaskIpcClient(ipcClient: IResultIpcClient): TaskClientPort {
  const adapters = createTaskIpcAdapters(ipcClient);
  return createTaskClientService(adapters.template, adapters.instance);
}

export {
  TaskClientService,
  TaskOccurrence,
  TaskOccurrenceHttpAdapter,
  TaskOccurrenceIpcAdapter,
  TaskPlan,
  TaskPlanHttpAdapter,
  TaskPlanIpcAdapter,
  createTaskClientService,
  createTaskHttpAdapters,
  createTaskOccurrenceHttpAdapter,
  createTaskOccurrenceIpcAdapter,
  createTaskIpcAdapters,
  createTaskPlanHttpAdapter,
  createTaskPlanIpcAdapter,
};
