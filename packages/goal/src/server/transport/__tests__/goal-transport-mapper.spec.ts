/**
 * Goal transport mapper surface
 * 目标传输层 Mapper 表面测试
 *
 * Proves each mapper preserves branded ids, nullable values, enums and response
 * schema parse. Mappers must be transport-shape projections only — they never
 * perform persistence, authorization or business decisions.
 *
 * 证明每个 mapper 保持 branded id、nullable 值、enum 与 response schema 可解析。
 * Mapper 只做传输形状投影——绝不执行持久化、授权或业务决策。
 */
import { describe, expect, it } from 'vitest';
import { toIdentityId, toKeyResultListResponse } from '../mappers';
import { KeyResultListResSchema } from '@memoflow/contracts/goal';
import type { GoalClientDTO } from '@memoflow/contracts/goal';

const GOAL_ID = 'IGoalId_550e8400-e29b-41d4-a716-446655440000';
const KR_ID = 'IKeyResultId_550e8400-e29b-41d4-a716-446655440001';

describe('goal transport mappers', () => {
  it('toIdentityId preserves the branded identity value', () => {
    const out = toIdentityId('identity-1');
    expect(out).toBe('identity-1');
  });

  it('toKeyResultListResponse projects key results and parses the response schema', () => {
    const goal = {
      id: GOAL_ID,
      keyResults: [
        {
          id: KR_ID,
          title: 'KR',
          description: null,
          progress: {
            aggregationMethod: 'Sum',
            initialValue: 0,
            targetValue: 10,
            currentValue: 5,
            unit: null,
          },
          target: null,
          progressPercentage: 50,
          isCompleted: false,
          weight: 3,
          order: 1,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      reviews: null,
    } as unknown as GoalClientDTO;

    const res = toKeyResultListResponse(goal);
    expect(res.data).toHaveLength(1);
    expect(res.total).toBe(1);
    expect(res.data[0].id).toBe(KR_ID);
    // The projection parses against the canonical response schema.
    expect(KeyResultListResSchema.safeParse(res).success).toBe(true);
  });

  it('toKeyResultListResponse handles a goal without key results', () => {
    const goal = { id: GOAL_ID, keyResults: null } as unknown as GoalClientDTO;
    const res = toKeyResultListResponse(goal);
    expect(res.data).toEqual([]);
    expect(res.total).toBe(0);
    expect(KeyResultListResSchema.safeParse(res).success).toBe(true);
  });
});
