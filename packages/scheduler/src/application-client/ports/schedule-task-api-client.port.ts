/**
 * Read-only ScheduleTask API client port.
 *
 * Raw ScheduleTask worker jobs are Scheduler-owned persistence. Product
 * surfaces may inspect them for diagnostics, but mutations must flow through
 * owner-domain commands -> SchedulingPort.
 */

import type { Result } from '@memoflow/contracts/result';
import type { SourceModule, ScheduleTaskClientDTO } from '@memoflow/contracts/schedule';

export interface IScheduleTaskApiClient {
  getTasks(): Promise<Result<ScheduleTaskClientDTO[]>>;
  getTaskById(taskId: string): Promise<Result<ScheduleTaskClientDTO>>;
  getDueTasks(params?: {
    beforeTime?: string;
    limit?: number;
  }): Promise<Result<ScheduleTaskClientDTO[]>>;
  getTaskBySource(
    sourceModule: SourceModule,
    sourceEntityId: string,
  ): Promise<Result<ScheduleTaskClientDTO[]>>;
}
