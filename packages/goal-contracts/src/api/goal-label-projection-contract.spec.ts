import { describe, expect, it } from 'vitest';
import { GoalLabelProjectionSchema } from './response-schemas';

const base = {
  id: 'label-1',
  identityId: 'identity-1',
  name: 'Work',
  normalizedName: 'work',
  color: '#3B82F6',
  createdAt: 1,
  updatedAt: 2,
};

describe('Goal label projection contract', () => {
  it('reuses the Shared Label color invariant and canonicalizes uppercase RGB', () => {
    expect(GoalLabelProjectionSchema.parse(base)).toEqual({
      ...base,
      color: '#3b82f6',
    });
  });

  it.each(['#fff', 'red', 'var(--label)', 'rgb(1,2,3)'])(
    'rejects invalid Shared Label color %s',
    (color) => {
      expect(GoalLabelProjectionSchema.safeParse({ ...base, color }).success).toBe(false);
    },
  );

  it('rejects non-finite Label timestamps', () => {
    expect(GoalLabelProjectionSchema.safeParse({ ...base, createdAt: Number.NaN }).success).toBe(
      false,
    );
  });
});
