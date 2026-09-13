/**
 * Get Task Instances By Date Range Service
 *
 * 鏍规嵁鏃ユ湡鑼冨洿鑾峰彇浠诲姟瀹炰緥
 */

import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { GetTaskOccurrencesByRangeRes } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import type { TaskOccurrenceProjectionService } from '../../services/task-occurrence-projection.service';
import { createTimeFacade } from '@memoflow/time';

/**
 * Get Task Instances By Date Range Service
 */
export class GetTaskOccurrencesByDateRangeUseCase {
  constructor(
    private readonly instanceRepository: ITaskOccurrenceRepository,
    private readonly projection: TaskOccurrenceProjectionService,
  ) {}

  async execute(
    identityId: string,
    startDate: number,
    endDate: number,
  ): Promise<Result<GetTaskOccurrencesByRangeRes>> {
    const timeContext = await this.projection.getTimeContext(identityId);
    const time = createTimeFacade({ context: timeContext });
    const instances = await this.instanceRepository.findByDateRange(
      identityId,
      time.calendar.toYmd(startDate),
      time.calendar.toYmd(endDate),
    );

    return ok({
      data: this.projection.projectManyWithContext(instances, timeContext),
      total: instances.length,
    });
  }
}
