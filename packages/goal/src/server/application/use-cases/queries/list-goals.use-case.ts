/**
 * List Goals Use Case
 *
 * 获取用户目标列表的应用服务
 * 遵循 governance 模块 Result<T> 规范
 */

import type { IGoalRepository } from '../../../domain';
import { Goal } from '../../../domain';
import type { ListGoalsQuery, QueryGoalsRes } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';

/**
 * List Goals Use Case
 */
export class ListGoalsUseCase {
  constructor(private readonly goalRepository: IGoalRepository) {}

  async execute(input: ListGoalsQuery): Promise<Result<QueryGoalsRes>> {
    const goals = await this.goalRepository.findByIdentityId(input.identityId, {
      includeChildren: input.includeKeyResults,
      status: input.status?.[0],
      systemView: input.systemView,
      labelIdsAll: input.labelIdsAll,
    });

    const normalizedQuery = input.query?.trim().toLowerCase();
    const filteredGoals = normalizedQuery
      ? goals.filter(
          (g) =>
            g.name.toLowerCase().includes(normalizedQuery) ||
            g.summary?.toLowerCase().includes(normalizedQuery),
        )
      : goals;

    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? filteredGoals.length;
    const total = filteredGoals.length;

    return ok({
      data: filteredGoals.map((g: Goal) => g.toClientDTO(Boolean(input.includeKeyResults))),
      pagination: {
        page,
        pageSize,
        total,
        hasMore: page * pageSize < total,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      },
    });
  }
}
