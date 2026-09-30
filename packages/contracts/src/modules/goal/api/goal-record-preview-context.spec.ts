import { describe, expect, it } from 'vitest';
import { GoalRecordListResSchema, KeyResultClientDTOSchema } from './response-schemas';
import { createMockKeyResult } from '../../../mocks';

const kr = createMockKeyResult();
const context = {
  ...kr.progress,
  keyResultId: kr.id,
  trackingBaseValue: 40,
  aggregationSnapshot: { count: 0, sum: 0, max: null, min: null, last: null },
};

describe('Goal record preview public extension', () => {
  it('accepts legacy lists and nullable or populated dedicated contexts', () => {
    for (const extension of [{}, { previewContext: null }, { previewContext: context }]) {
      const payload = { data: [], total: 0, ...extension };
      expect(GoalRecordListResSchema.parse(payload)).toEqual(payload);
    }
  });

  it('preserves the normal KR contract without aggregation state', () => {
    const dto = KeyResultClientDTOSchema.parse(kr);
    expect(dto).not.toHaveProperty('trackingBaseValue');
    expect(dto.progress).not.toHaveProperty('trackingBaseValue');
    expect(
      KeyResultClientDTOSchema.safeParse({
        ...kr,
        progress: { ...kr.progress, trackingBaseValue: 40 },
      }).success,
    ).toBe(false);
  });
});
