import type { RescheduleTaskInput, TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import { error, fail, ok, type Result } from '@memoflow/contracts/result';
import { asInstant, createTimeFacade, type UserTimeContextPort } from '@memoflow/time';
import { TaskTimeConfig } from '../../../domain/value-objects/task-time-config';
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
      if (request.newTime.startDate == null) {
        return error('VALIDATION_ERROR', 'Rescheduled task requires startDate');
      }

      const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
      const time = createTimeFacade({ context: timeContext });
      const targetDay = time.calendar.startOfDay(asInstant(request.newTime.startDate));
      const targetKey = String(instance.templateId) + ":" + time.calendar.toYmd(targetDay);
      const siblings = await this.instanceRepository.findByTemplateIdAndDateRange(
        String(instance.templateId),
        identityId,
        Number(targetDay),
        Number(time.calendar.endOfDay(targetDay)),
      );
      const collision = siblings.find(
        (candidate) => candidate.id !== instance.id && candidate.occurrenceKey === targetKey,
      );
      if (collision) {
        return error('CONFLICT', `Task occurrence already exists on target day (${collision.id})`);
      }

      const changed = instance.reschedule(
        TaskTimeConfig.fromDTO({ ...request.newTime, startDate: targetDay }),
        timeContext,
      );
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
