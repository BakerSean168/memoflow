import type { IResultHttpClient } from '@memoflow/http-client';
import { ScheduleTaskHttpAdapter } from './schedule-task-http.adapter';
export { ScheduleTaskHttpAdapter } from './schedule-task-http.adapter';
export function createSchedulerHttpAdapter(httpClient: IResultHttpClient): ScheduleTaskHttpAdapter {
  return new ScheduleTaskHttpAdapter(httpClient);
}
