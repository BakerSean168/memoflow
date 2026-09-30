/**
 * List Goal Records Use Case (Query)
 *
 * 查询目标进度记录
 * - 按 goalId 查询
 * - 按 keyResultId 查询
 * - 必须 identity-scope：owned goal 读 + record.identityId 过滤
 */

import type { IGoalRecordRepository, IGoalRepository } from '../../../domain';
import type { Goal, GoalRecord } from '../../../domain';
import { KeyResultProgress } from '../../../domain';
import { createGoalRecordAggregationSnapshot } from '../../../../shared/key-result-progress-calculator';
import type { GetGoalRecordsRes } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';

export interface ListGoalRecordsParams {
  identityId: string;
  goalId?: string;
  keyResultId?: string;
  limit?: number;
  offset?: number;
}

export type ListGoalRecordsResult = GetGoalRecordsRes;

export class ListGoalRecordsUseCase {
  constructor(
    private readonly goalRecordRepository: IGoalRecordRepository,
    private readonly goalRepository: IGoalRepository,
  ) {}

  async execute(params: ListGoalRecordsParams): Promise<Result<ListGoalRecordsResult>> {
    const { identityId, goalId, keyResultId, limit = 20, offset = 0 } = params;

    if (!identityId?.trim()) {
      return error('UNAUTHORIZED', 'Identity ID is required');
    }

    const goal = goalId
      ? await this.goalRepository.findByIdForIdentity(identityId, goalId, {
          includeChildren: true,
        })
      : null;
    if (goalId) {
      if (!goal) {
        return error('NOT_FOUND', `Goal not found: ${goalId}`);
      }
    }

    const keyResult = goal?.keyResults.find((kr) => String(kr.id) === keyResultId);
    if (goalId && keyResultId && !keyResult) {
      return error('NOT_FOUND', `Key result not found: ${keyResultId}`);
    }

    let records: GoalRecord[];
    if (keyResultId) {
      records = await this.goalRecordRepository.findByKeyResultId(identityId, keyResultId, {
        orderBy: 'desc',
      });
    } else if (goalId) {
      records = await this.goalRecordRepository.findByGoalId(identityId, goalId, {
        orderBy: 'desc',
      });
    } else {
      records = [];
    }

    // Defense-in-depth: drop any records not owned by the current identity.
    records = records.filter(
      (record) =>
        String(record.identityId) === identityId &&
        (!keyResultId || String(record.keyResultId) === keyResultId),
    );

    // Apply offset manually (repository doesn't support offset)
    const sliced = records.slice(offset, offset + limit);

    const valueAfterByRecordId = this.buildValueAfterMap(goal, records);

    const previewContext = keyResult
      ? {
          initialValue: keyResult.progress.initialValue,
          currentValue: keyResult.progress.currentValue,
          targetValue: keyResult.progress.targetValue,
          aggregationMethod: keyResult.progress.aggregationMethod,
          unit: keyResult.progress.unit,
          keyResultId: keyResult.id,
          trackingBaseValue: keyResult.progress.trackingBaseValue,
          aggregationSnapshot: createGoalRecordAggregationSnapshot(
            [...records]
              .sort(
                (a, b) =>
                  Number(a.recordedAt) - Number(b.recordedAt) ||
                  String(a.id).localeCompare(String(b.id)),
              )
              .map((record) => record.value),
          ),
        }
      : null;

    return ok({
      ...(keyResultId && goalId ? { previewContext } : {}),
      data: sliced.map((r) =>
        r.toClientDTO(goalId ?? '', valueAfterByRecordId.get(String(r.id)) ?? r.value),
      ),
      total: records.length,
    });
  }

  private buildValueAfterMap(goal: Goal | null, records: GoalRecord[]): Map<string, number> {
    const result = new Map<string, number>();
    if (!goal || records.length === 0) return result;

    const keyResultById = new Map(goal.keyResults.map((kr) => [String(kr.id), kr]));
    const recordsByKeyResult = new Map<string, GoalRecord[]>();

    for (const record of records) {
      const key = String(record.keyResultId);
      const group = recordsByKeyResult.get(key) ?? [];
      group.push(record);
      recordsByKeyResult.set(key, group);
    }

    for (const [keyResultId, group] of recordsByKeyResult) {
      const keyResult = keyResultById.get(keyResultId);
      if (!keyResult) {
        group.forEach((record) => result.set(String(record.id), record.value));
        continue;
      }

      const progressTemplate = KeyResultProgress.fromDTO({
        ...keyResult.progress,
        currentValue: keyResult.progress.trackingBaseValue,
      });
      const history: number[] = [];
      const sorted = [...group].sort(
        (a, b) =>
          Number(a.recordedAt) - Number(b.recordedAt) || String(a.id).localeCompare(String(b.id)),
      );
      for (const record of sorted) {
        history.push(record.value);
        const calculated = progressTemplate.recalculateFromHistory(history).currentValue;
        result.set(String(record.id), calculated);
      }
    }

    return result;
  }
}
