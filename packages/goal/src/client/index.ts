/**
 * Goal client seam.
 *
 * Public goal contracts stay centralized in
 * `@memoflow/contracts/goal`.
 * Callers depend on this seam instead of the old application-client /
 * infrastructure-client layered exports.
 */

import type { IResultHttpClient } from '@memoflow/http-client';
import {
  GoalClientService,
  createGoalClientService,
  createGoalServiceFromHttpClient,
  type GoalClientPort,
} from '../application-client';
import { Goal, GoalRecord, GoalReview, KeyResult } from '../domain-client';
import {
  GoalHttpAdapter,
  createGoalHttpAdapters,
  type GoalHttpAdapters,
} from '../infrastructure-client/adapters/http';
import {
  GoalIpcAdapter,
  createGoalIpcAdapters,
  type GoalIpcAdapters,
} from '../infrastructure-client/adapters/ipc';
import type { IGoalApiClient, IResultIpcClient } from '../infrastructure-client/adapters/types';

export type {
  GoalClientPort,
  GoalHttpAdapters,
  GoalIpcAdapters,
  IGoalApiClient,
  IResultHttpClient,
  IResultIpcClient,
};

export function createGoalHttpClient(httpClient: IResultHttpClient): GoalClientPort {
  return createGoalServiceFromHttpClient(httpClient);
}

export function createGoalIpcClient(ipcClient: IResultIpcClient): GoalClientPort {
  const adapters = createGoalIpcAdapters(ipcClient);
  return createGoalClientService(adapters.goal);
}

export {
  Goal,
  GoalClientService,
  GoalHttpAdapter,
  GoalIpcAdapter,
  GoalRecord,
  GoalReview,
  KeyResult,
  createGoalClientService,
  createGoalHttpAdapters,
  createGoalIpcAdapters,
};
