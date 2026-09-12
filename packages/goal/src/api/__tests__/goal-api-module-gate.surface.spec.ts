import { createGoalApiModule } from '../module';
import { createGoalPrismaModule } from '../../server/infrastructure/prisma';
import { describe, expect, it } from 'vitest';

describe('GoalApiModule composition fail-closed gate (W4 P2-1)', () => {
  it('createGoalApiModule is instance-bound: requires options.instance (type-level + runtime)', async () => {
    expect(() =>
      (createGoalApiModule as unknown as (o?: unknown) => unknown)(),
    ).toThrow();
    expect(() =>
      (createGoalApiModule as unknown as (o?: unknown) => unknown)({ instance: null }),
    ).toThrow(/options\.instance/);
  });

  it('createGoalPrismaModule fails closed without taskBindingReadPort', () => {
    const db = {};
    expect(() => createGoalPrismaModule(db as never)).toThrow(/taskBindingReadPort/);
  });
});
