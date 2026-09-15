/**
 * List Task Templates Service
 *
 * Retrieves task plans by account, automatically checking
 * and replenishing occurrences for active plans.
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { TaskPlan } from '../../../domain/aggregates/task-plan';
import type {
  QueryTaskPlansInternal,
  QueryTaskPlansRes,
  TaskPlanStatus as TaskPlanStatusType,
} from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import { createTimeFacade, type UserTimeContextPort } from '@memoflow/time';

/**
 * List Task Templates Service
 */
export class ListTaskPlansUseCase {
  constructor(
    private readonly planRepository: ITaskPlanRepository,
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(request: QueryTaskPlansInternal): Promise<Result<QueryTaskPlansRes>> {
    let plans: TaskPlan[];

    // Shared Label filtering is repository-owned AND semantics. Other legacy filters
    // can further narrow the already identity-scoped result without inventing a
    // second Label filtering engine in the application layer.
    if (request.labelIdsAll && request.labelIdsAll.length > 0) {
      plans = await this.planRepository.findByLabelIdsAll(
        request.identityId,
        request.labelIdsAll,
      );
      if (request.status && request.status.length > 0) {
        plans = plans.filter((plan) =>
          request.status!.includes(String(plan.status)),
        );
      }
      if (request.goalId) {
        plans = plans.filter(
          (plan) => String(plan.goalBinding?.goalId ?? '') === String(request.goalId),
        );
      }
      if (request.keyResultId) {
        plans = plans.filter(
          (plan) =>
            String(plan.goalBinding?.keyResultId ?? '') === String(request.keyResultId),
        );
      }
    } else if (request.goalId && request.keyResultId) {
      plans = await this.planRepository.findByGoalAndKeyResultId(
        request.identityId,
        request.goalId,
        request.keyResultId,
      );
      if (request.status && request.status.length > 0) {
        plans = plans.filter((plan) =>
          request.status!.includes(String(plan.status)),
        );
      }
    } else if (request.status && request.status.length > 0) {
      plans = await this.planRepository.findByStatus(
        request.identityId,
        request.status[0] as TaskPlanStatusType,
      );
      if (request.goalId) {
        plans = plans.filter(
          (plan) => String(plan.goalBinding?.goalId ?? '') === String(request.goalId),
        );
      }
      if (request.keyResultId) {
        plans = plans.filter(
          (plan) =>
            String(plan.goalBinding?.keyResultId ?? '') === String(request.keyResultId),
        );
      }
    } else if (request.goalId) {
      plans = await this.planRepository.findByGoalId(request.identityId, request.goalId);
    } else {
      plans = await this.planRepository.findByIdentityId(request.identityId);
    }

    // R2-3：列表查询保持纯读——实例补充由显式 maintenance worker 负责。
    // Completion statistics use the same identity-scoped Product Time window
    // in both Prisma and PowerSync lanes.
    const asOf = this.now();
    const timeContext = await this.userTimeContextPort.getUserTimeContext(request.identityId);
    const taskTime = createTimeFacade({ context: timeContext });
    const windowStart = taskTime.calendar.toYmd(taskTime.calendar.addDays(asOf, -29));
    const asOfDate = taskTime.calendar.toYmd(asOf);
    const statsByTemplateId =
      (await this.occurrenceRepository.getPlanStats(
        plans.map((plan) => plan.id),
        request.identityId,
        { windowStart, asOf: asOfDate },
      )) ?? {};

    return ok({
      plans: plans.map((plan) => {
        const dto = plan.toClientDTOAt(timeContext, false, asOf);
        const stats = statsByTemplateId[plan.id];

        if (!stats) {
          return dto;
        }

        return {
          ...dto,
          occurrenceCount: stats.occurrenceCount,
          completedOccurrenceCount: stats.completedOccurrenceCount,
          pendingOccurrenceCount: stats.pendingOccurrenceCount,
          dueOccurrenceCount: stats.dueOccurrenceCount,
          completedDueOccurrenceCount: stats.completedDueOccurrenceCount,
          completionWindowDays: stats.completionWindowDays,
          futurePendingOccurrenceCount: stats.futurePendingOccurrenceCount,
          singleOccurrenceStatus: stats.singleOccurrenceStatus,
          completionRate: stats.completionRate,
        };
      }),
      total: plans.length,
    });
  }
}
