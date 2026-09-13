import type { RescheduleTaskInput, TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import { error, fail, ok, type Result } from '@memoflow/contracts/result';
import type { UserTimeContextPort } from '@memoflow/time';
import { TaskOccurrenceScheduleSnapshot } from '../../../domain/value-objects/task-occurrence-schedule-snapshot';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import { mapTaskWriteErrorToResultError } from './task-write-support';

/** Owner command for one TaskOccurrence. It never mutates TaskPlan or Scheduler persistence. */
export class RescheduleTaskOccurrenceUseCase {
  constructor(
    private readonly instanceRepository: ITaskOccurrenceRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  async execute(
    id: string,
    identityId: string,
    request: RescheduleTaskInput,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    try {
      const instance = await this.instanceRepository.findByIdForIdentity(identityId, id);
      if (!instance) return error('NOT_FOUND', `TaskOccurrence ${id} not found`);
      if (instance.version !== request.expectedVersion) {
        return error(
          'CONFLICT',
          `TaskOccurrence ${id} version conflict: expected ${request.expectedVersion}, current ${instance.version}`,
        );
      }
      if (!instance.canReschedule()) {
        return error('VALIDATION_ERROR', 'Cannot reschedule this task instance');
      }
      const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
      const nextSchedule = TaskOccurrenceScheduleSnapshot.create(request.scheduleSnapshot);
      const targetDate = nextSchedule.date;
      const targetKey = String(instance.planId) + ':' + targetDate;
      const siblings = await this.instanceRepository.findByTemplateIdAndDateRange(
        String(instance.planId),
        identityId,
        targetDate,
        targetDate,
      );
      const collision = siblings.find(
        (candidate) => candidate.id !== instance.id && candidate.occurrenceKey === targetKey,
      );
      if (collision) {
        return error('CONFLICT', `Task occurrence already exists on target day (${collision.id})`);
      }

      const changed = instance.reschedule(nextSchedule, timeContext);
      if (!changed) return ok(instance.toClientDTOAt(timeContext));
      await this.instanceRepository.save(instance);
      return ok(instance.toClientDTOAt(timeContext));
    } catch (caughtError) {
      return fail(
        mapTaskWriteErrorToResultError(caughtError, 'Failed to reschedule task instance'),
      );
    }
  }
}
