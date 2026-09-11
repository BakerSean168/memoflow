/**
 * Goal 跨模块查询服务
 *
 * 为其他模块提供目标和关键结果的查询服务
 * 依赖注入模式：通过构造函数注入 Goal Repository
 */

import { calculateKeyResultProgress, type IGoalRepository } from '../../../domain';
import type { Goal } from '../../../domain';
import type { GoalStatus } from '@memoflow/contracts/goal';
import { createLogger } from '@memoflow/utils/logger';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';

const logger = createLogger('GoalCrossModuleQueryService');

/**
 * 目标绑定选项（供任务模块使用）
 */
export interface GoalBindingOption {
  id: string;
  title: string;
  summary?: string | null;
  status: GoalStatus;
  dueDate?: number | null;
  progress?: number;
}

/**
 * 关键结果绑定选项（供任务模块使用）
 */
export interface KeyResultBindingOption {
  id: string;
  title: string;
  description?: string | null;
  goalId: string;
  progress: {
    current: number;
    target: number;
    percentage: number;
  };
  weight: number;
}

/**
 * Goal 模块跨模块查询服务
 */
export class GoalCrossModuleQueryServiceUseCase {
  constructor(private readonly goalRepository: IGoalRepository) {}

  /**
   * 获取可用于任务绑定的目标列表
   * @param identityId 账户 ID
   * @param status 目标状态筛选（默认：进行中、未开始）
   */
  async getGoalsForTaskBinding(params: {
    identityId: string;
    status?: GoalStatus[];
  }): Promise<Result<GoalBindingOption[]>> {
    // 默认只返回进行中和未开始的目标
    const statusFilter = params.status ?? ['InProgress', 'Planned'];

    const goals = await this.goalRepository.findByIdentityId(params.identityId);

    return ok(
      goals
        .filter((goal: Goal) => (statusFilter as string[]).includes(goal.status))
        .map((goal: Goal) => ({
          id: goal.id,
          title: goal.name,
          summary: goal.summary,
          status: goal.status,
          dueDate: goal.dueDate ?? null,
          progress: goal.progress,
        })),
    );
  }

  /**
   * 获取目标的关键结果列表（用于任务绑定）
   * @param goalId 目标 UUID
   */
  async getKeyResultsForTaskBinding(
    goalId: string,
    identityId: string,
  ): Promise<Result<KeyResultBindingOption[]>> {
    const goal = await this.goalRepository.findByIdForIdentity(identityId, goalId);
    if (!goal) {
      return error('NOT_FOUND', `Goal not found: ${goalId}`);
    }

    const keyResults = goal.keyResults;

    return ok(
      keyResults.map((kr) => ({
        id: kr.id,
        title: kr.title,
        description: kr.description,
        goalId: goal.id,
        progress: {
          current: kr.progress.currentValue,
          target: kr.progress.targetValue,
          percentage: calculateKeyResultProgress(kr.progress).percentage,
        },
        weight: kr.weight,
      })),
    );
  }

  /**
   * 验证目标和关键结果的绑定是否有效
   * @param goalId 目标 UUID
   * @param keyResultId 关键结果 UUID
   */
  async validateGoalBinding(
    goalId: string,
    keyResultId: string,
    identityId: string,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const goal = await this.goalRepository.findByIdForIdentity(identityId, goalId);
      if (!goal) {
        return { valid: false, error: `Goal not found: ${goalId}` };
      }

      const keyResult = goal.keyResults.find((kr) => kr.id === keyResultId);
      if (!keyResult) {
        return { valid: false, error: `KeyResult not found in goal: ${keyResultId}` };
      }

      return { valid: true };
    } catch (error) {
      logger.error('Goal binding validation failed', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
