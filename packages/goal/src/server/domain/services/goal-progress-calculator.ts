/**
 * Goal Progress Calculator - 领域服务
 *
 * 【DDD 领域服务职责】
 * 1. 准备数据：从 Repository 查询历史记录
 * 2. 调用值对象的纯计算方法
 * 3. 协调聚合根更新
 *
 * 【核心原则 - 方案一】
 * - Service 负责准备数据（查库、获取历史记录）
 * - Value Object（KeyResultProgress）负责纯计算（无 I/O）
 * - Aggregate（Goal/KeyResult）负责状态管理
 *
 * 【为什么这样设计？】
 * 1. 值对象必须是纯内存操作，无副作用，无外部依赖
 * 2. 业务正确性第一：能完美处理删除/修改历史记录
 * 3. 数据规模可控：一个 KR 通常只有几十到几百条记录
 *
 * 【工作流程】
 * 1. 用户添加/修改/删除进度记录
 * 2. 本服务从 Repository 查询该 KR 的所有历史记录
 * 3. 提取 values 数组，传给 KeyResultProgress.recalculateFromHistory()
 * 4. 值对象返回新的进度实例
 * 5. 更新 KeyResult 并保存 Goal 聚合根
 */

import type { Goal } from '../aggregates/goal';
import type {
  IGoalRecordRepository,
  GoalRecordQueryOptions,
} from '../repositories/i-goal-record-repository';
import { KeyResultProgress } from '../value-objects/key-result-progress';
import type {
  ProgressCalculationResultDTO,
  GoalProgressCalculationResultDTO,
  ProgressPreviewDTO,
} from '@memoflow/goal-contracts';
import type { KeyResultId } from '@memoflow/contracts/primitives';

/**
 * GoalProgressCalculator 领域服务
 *
 * 【使用方式】
 * 1. 在 Application Service 中注入本服务
 * 2. 当用户添加/修改/删除 GoalRecord 时调用
 * 3. 服务会自动重新计算相关 KR 的进度
 */
export class GoalProgressCalculator {
  constructor(private readonly goalRecordRepository: IGoalRecordRepository) {}

  // ================== 核心方法 ==================

  /**
   * 重新计算单个 KeyResult 的进度
   *
   * 【工作流程】
   * 1. 从 Repository 查询该 KR 的所有历史记录
   * 2. 提取 values 数组
   * 3. 调用 KeyResultProgress.recalculateFromHistory() 纯计算
   * 4. 更新 Goal 聚合根中的 KeyResult
   *
   * @param goal Goal 聚合根（由 ApplicationService 查询后传入）
   * @param keyResultId 要重新计算的 KeyResult ID
   * @param options 查询选项（可选）
   * @returns 计算结果 DTO
   *
   * @example
   * ```typescript
   * // 在 ApplicationService 中使用
   * const goal = await this.goalRepository.findByIdForIdentity(identityId, goalId);
   * const result = await this.progressCalculator.recalculateKeyResultProgress(goal, keyResultId);
   * if (result.changed) {
   *   await this.goalRepository.save(goal);
   * }
   * ```
   */
  public async recalculateKeyResultProgress(
    goal: Goal,
    keyResultId: KeyResultId,
    options?: GoalRecordQueryOptions,
  ): Promise<ProgressCalculationResultDTO> {
    // 1. 获取 KeyResult
    const keyResult = goal.getKeyResult(keyResultId);
    if (!keyResult) {
      throw new Error(`KeyResult ${keyResultId} not found in Goal ${goal.id}`);
    }

    // 2. 查询历史记录（Service 负责 I/O）- 返回实体列表
    const records = await this.goalRecordRepository.findByKeyResultId(
      String(goal.identityId),
      keyResultId,
      { orderBy: 'asc', ...options },
    );

    // 3. 提取 values 数组（从实体获取）
    const values = records.map((r) => r.value);

    // 4. 获取当前进度信息
    const currentProgress = KeyResultProgress.fromDTO(keyResult.progress);
    const oldValue = currentProgress.currentValue;
    const oldPercentage = currentProgress.getProgressPercentage();

    // 5. 调用值对象的纯计算方法
    const newProgress = currentProgress.recalculateFromHistory(values);
    const newValue = newProgress.currentValue;
    const newPercentage = newProgress.getProgressPercentage();

    // 6. 如果值发生变化，更新聚合根
    const changed = oldValue !== newValue;
    if (changed) {
      goal.updateKeyResultProgress(keyResultId, newValue);
    }

    return {
      keyResultId,
      oldValue,
      newValue,
      changed,
      oldPercentage,
      newPercentage,
    };
  }

  /**
   * 重新计算 Goal 下所有 KeyResult 的进度
   *
   * 【使用场景】
   * - 批量导入历史数据后
   * - 数据修复/迁移后
   * - 定时任务校验进度一致性
   *
   * @param goal Goal 聚合根
   * @param options 查询选项
   * @returns 目标进度计算结果 DTO
   */
  public async recalculateGoalProgress(
    goal: Goal,
    options?: GoalRecordQueryOptions,
  ): Promise<GoalProgressCalculationResultDTO> {
    const keyResults = goal.getAllKeyResults();
    const oldProgress = goal.calculateProgress();

    // 批量查询所有 KR 的记录（减少数据库查询）- 返回实体 Map
    const keyResultIds = keyResults.map((kr) => kr.id);
    const recordsMap = await this.goalRecordRepository.findByKeyResultIds(
      String(goal.identityId),
      keyResultIds,
      { orderBy: 'asc', ...options },
    );

    // 逐个计算 KR 进度
    const keyResultResults: ProgressCalculationResultDTO[] = [];
    for (const keyResult of keyResults) {
      const records = recordsMap.get(keyResult.id) || [];
      const values = records.map((r) => r.value);

      const currentProgress = KeyResultProgress.fromDTO(keyResult.progress);
      const oldValue = currentProgress.currentValue;
      const oldPercentage = currentProgress.getProgressPercentage();

      const newProgress = currentProgress.recalculateFromHistory(values);
      const newValue = newProgress.currentValue;
      const newPercentage = newProgress.getProgressPercentage();

      const changed = oldValue !== newValue;
      if (changed) {
        goal.updateKeyResultProgress(keyResult.id, newValue);
      }

      keyResultResults.push({
        keyResultId: keyResult.id,
        oldValue,
        newValue,
        changed,
        oldPercentage,
        newPercentage,
      });
    }

    const newProgress = goal.calculateProgress();

    return {
      goalId: goal.id,
      oldProgress,
      newProgress,
      changed: oldProgress !== newProgress,
      keyResultResults,
    };
  }

  // ================== 辅助方法 ==================

  /**
   * 获取 KeyResult 的历史记录值数组
   *
   * 【使用场景】
   * 需要在外部进行自定义计算时
   *
   * @param keyResultId KeyResult ID
   * @param options 查询选项
   * @returns 值数组
   */
  public async getKeyResultHistoryValues(
    identityId: string,
    keyResultId: KeyResultId,
    options?: GoalRecordQueryOptions,
  ): Promise<number[]> {
    const records = await this.goalRecordRepository.findByKeyResultId(identityId, keyResultId, {
      orderBy: 'asc',
      ...options,
    });
    return records.map((r) => r.value);
  }

  /**
   * 预览计算结果（不实际更新聚合根）
   *
   * 【使用场景】
   * - 用户添加记录前预览最终进度
   * - 批量操作前预览影响
   *
   * @param goal Goal 聚合根
   * @param keyResultId KeyResult ID
   * @param additionalValue 额外添加的值（模拟新增记录）
   * @returns 预览结果 DTO
   */
  public async previewProgress(
    goal: Goal,
    keyResultId: KeyResultId,
    additionalValue?: number,
  ): Promise<ProgressPreviewDTO> {
    const keyResult = goal.getKeyResult(keyResultId);
    if (!keyResult) {
      throw new Error(`KeyResult ${keyResultId} not found`);
    }

    const records = await this.goalRecordRepository.findByKeyResultId(
      String(goal.identityId),
      keyResultId,
      { orderBy: 'asc' },
    );
    const values = records.map((r) => r.value);

    // 如果有额外值，添加到数组末尾
    if (additionalValue !== undefined) {
      values.push(additionalValue);
    }

    const currentProgress = KeyResultProgress.fromDTO(keyResult.progress);
    const previewProgress = currentProgress.recalculateFromHistory(values);

    return {
      currentValue: currentProgress.currentValue,
      previewValue: previewProgress.currentValue,
      currentPercentage: currentProgress.getProgressPercentage(),
      previewPercentage: previewProgress.getProgressPercentage(),
    };
  }

  /**
   * 检查进度是否需要重新计算
   *
   * 【使用场景】
   * 定时任务检测数据一致性
   *
   * @param goal Goal 聚合根
   * @param keyResultId KeyResult ID
   * @returns 是否需要重新计算
   */
  public async needsRecalculation(goal: Goal, keyResultId: KeyResultId): Promise<boolean> {
    const keyResult = goal.getKeyResult(keyResultId);
    if (!keyResult) {
      return false;
    }

    const records = await this.goalRecordRepository.findByKeyResultId(
      String(goal.identityId),
      keyResultId,
      { orderBy: 'asc' },
    );
    const values = records.map((r) => r.value);

    const currentProgress = KeyResultProgress.fromDTO(keyResult.progress);
    const expectedProgress = currentProgress.recalculateFromHistory(values);

    return currentProgress.currentValue !== expectedProgress.currentValue;
  }
}
