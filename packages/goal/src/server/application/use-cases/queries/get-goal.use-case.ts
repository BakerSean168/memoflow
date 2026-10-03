/**
 * Get Goal Use Case
 *
 * 获取单个目标详情的应用服务
 * 遵循共享 Result<T> contract
 */

import type { IGoalRepository } from '../../../domain';
import type { GetGoalRes, KeyResultClientDTO } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';

/**
 * Get Goal Use Case
 */
export class GetGoalUseCase {
  constructor(private readonly goalRepository: IGoalRepository) {}

  async getKeyResultMeasurementContext(
    goalId: string,
    keyResultId: string,
    identityId: string,
  ): Promise<Result<Pick<KeyResultClientDTO, 'id' | 'title' | 'progress'>>> {
    const result = await this.execute(goalId, identityId, true);
    if (!result.ok) return result;
    const kr = result.data.keyResults?.find((candidate) => String(candidate.id) === keyResultId);
    if (!kr) return error('NOT_FOUND', 'Key Result not found in Goal');
    return ok({ id: kr.id, title: kr.title, progress: kr.progress });
  }

  async execute(
    id: string,
    identityId: string,
    includeChildren?: boolean,
  ): Promise<Result<GetGoalRes>> {
    const goal = await this.goalRepository.findByIdForIdentity(identityId, id, {
      includeChildren,
    });

    if (!goal) {
      return error('NOT_FOUND', `Goal not found: ${id}`);
    }

    return ok(goal.toClientDTO(true));
  }
}
