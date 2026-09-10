import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import type { TimeContext, UserTimeContextPort } from '@memoflow/time';
import type { TaskOccurrence } from '../../domain/aggregates/task-occurrence';

/**
 * Application projection boundary for user-time-derived TaskOccurrence fields.
 *
 * The domain aggregate receives a plain TimeContext and never imports Setting.
 * This service is the only application helper that resolves the current user's
 * Product Time context before projecting dynamic fields such as `isOverdue`.
 */
export class TaskOccurrenceProjectionService {
  constructor(private readonly userTimeContextPort: UserTimeContextPort) {}

  getTimeContext(identityId: string): Promise<TimeContext> {
    return this.userTimeContextPort.getUserTimeContext(identityId);
  }

  projectWithContext(
    instance: TaskOccurrence,
    timeContext: TimeContext,
    now = Date.now(),
  ): TaskOccurrenceClientDTO {
    return instance.toClientDTOAt(timeContext, now);
  }

  projectManyWithContext(
    instances: readonly TaskOccurrence[],
    timeContext: TimeContext,
    now = Date.now(),
  ): TaskOccurrenceClientDTO[] {
    return instances.map((instance) => instance.toClientDTOAt(timeContext, now));
  }

  async project(
    identityId: string,
    instance: TaskOccurrence,
    now = Date.now(),
  ): Promise<TaskOccurrenceClientDTO> {
    const timeContext = await this.getTimeContext(identityId);
    return this.projectWithContext(instance, timeContext, now);
  }

  async projectMany(
    identityId: string,
    instances: readonly TaskOccurrence[],
    now = Date.now(),
  ): Promise<TaskOccurrenceClientDTO[]> {
    const timeContext = await this.getTimeContext(identityId);
    return this.projectManyWithContext(instances, timeContext, now);
  }
}
