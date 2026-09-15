/**
 * Search Goals Use Case
 *
 * 搜索目标的应用服务
 * 遵循 governance 模块 Result<T> 规范
 */

import type { IGoalRepository } from '../../../domain';
import { Goal } from '../../../domain';
import type { GoalSystemView, QueryGoalsRes } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';

/**
 * Search Goals Use Case
 */
export class SearchGoalsUseCase {
  constructor(private readonly goalRepository: IGoalRepository) {}

  async execute(
    identityId: string,
    query: string,
    systemView?: GoalSystemView,
  ): Promise<Result<QueryGoalsRes>> {
    const allGoals = await this.goalRepository.findByIdentityId(identityId, { systemView });

    const filteredGoals = allGoals.filter(
      (g) =>
        g.name.toLowerCase().includes(query.toLowerCase()) ||
        g.summary?.toLowerCase().includes(query.toLowerCase()),
    );

    const total = filteredGoals.length;

    return ok({
      data: filteredGoals.map((g: Goal) => g.toClientDTO()),
      pagination: {
        page: 1,
        pageSize: total,
        total,
        hasMore: false,
        totalPages: total > 0 ? 1 : 0,
      },
    });
  }
}
