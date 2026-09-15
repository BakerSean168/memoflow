import type { RescheduleTaskInput, TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import { error, fail, ok, type Result } from '@memoflow/contracts/result';
import type { UserTimeContextPort } from '@memoflow/time';
import { TaskOccurrenceScheduleSnapshot } from '../../../domain/value-objects/task-occurrence-schedule-snapshot';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import { mapTaskWriteErrorToResultError } from './task-write-support';

/** Owner command for one TaskOccurrence. It never mutates TaskPlan or Scheduler persistence. */
export class RescheduleTaskOccurrenceUseCase {
  constructor(
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  async execute(
    id: string,
    identityId: string,
    request: RescheduleTaskInput,
  ): Promise<Result<TaskOccurrenceClientDTO>> {
    try {
      const occurrence = await this.occurrenceRepository.findByIdForIdentity(identityId, id);
      if (!occurrence) return error('NOT_FOUND', `TaskOccurrence ${id} not found`);
      if (occurrence.version !== request.expectedVersion) {
        return error(
          'CONFLICT',
          `TaskOccurrence ${id} version conflict: expected ${request.expectedVersion}, current ${occurrence.version}`,
        );
      }
      if (!occurrence.canReschedule()) {
        return error('VALIDATION_ERROR', 'Cannot reschedule this task occurrence');
      }
      const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
      const nextSchedule = TaskOccurrenceScheduleSnapshot.create(request.scheduleSnapshot);
      const targetDate = nextSchedule.date;
      const targetKey = String(occurrence.planId) + ':' + targetDate;
      const siblings = await this.occurrenceRepository.findByPlanIdAndDateRange(
        String(occurrence.planId),
        identityId,
        targetDate,
        targetDate,
      );
      const collision = siblings.find(
        (candidate) => candidate.id !== occurrence.id && candidate.occurrenceKey === targetKey,
      );
      if (collision) {
        return error('CONFLICT', `Task occurrence already exists on target day (${collision.id})`);
      }

      const changed = occurrence.reschedule(nextSchedule, timeContext);
      if (!changed) return ok(occurrence.toClientDTOAt(timeContext));
      await this.occurrenceRepository.save(occurrence);
      return ok(occurrence.toClientDTOAt(timeContext));
    } catch (caughtError) {
      return fail(
        mapTaskWriteErrorToResultError(caughtError, 'Failed to reschedule task occurrence'),
      );
    }
  }
}
