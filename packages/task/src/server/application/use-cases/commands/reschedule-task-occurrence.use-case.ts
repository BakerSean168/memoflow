import type { RescheduleTaskInput, TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import { error, fail, ok, type Result } from '@memoflow/contracts/result';
import { asInstant, createTimeFacade } from '@memoflow/time';
import { TaskTimeConfig } from '../../../domain/value-objects/task-time-config';
import { buildTaskOccurrenceOccurrenceKey } from '../../../domain/value-objects/task-occurrence-occurrence-key';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import { mapTaskWriteErrorToResultError } from './task-write-support';

const time = createTimeFacade();

/** Owner command for one TaskOccurrence. It never mutates TaskPlan or Scheduler persistence. */
export class RescheduleTaskOccurrenceUseCase {
  constructor(private readonly instanceRepository: ITaskOccurrenceRepository) {}

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

      const targetDay = time.calendar.startOfDay(asInstant(request.newTime.startDate));
      const targetKey = buildTaskOccurrenceOccurrenceKey(
        String(instance.templateId),
        Number(targetDay),
      );
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
      );
      if (!changed) return ok(instance.toClientDTO());
      await this.instanceRepository.save(instance);
      return ok(instance.toClientDTO());
    } catch (caughtError) {
      return fail(
        mapTaskWriteErrorToResultError(caughtError, 'Failed to reschedule task instance'),
      );
    }
  }
}
