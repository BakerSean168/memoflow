import { describe, expect, it, vi } from 'vitest';
import {
  GoalRecordListResSchema,
  KeyResultClientDTOSchema,
  KeyResultProgressDTOSchema,
} from '@memoflow/contracts/goal';
import { createMockKeyResult } from '@memoflow/contracts/mocks';
import { ok } from '@memoflow/contracts/result';
import { GoalHttpAdapter } from './http/goal-http.adapter';
import { GoalIpcAdapter } from './ipc/goal-ipc.adapter';
import { createGoalClientService } from '../../application-client';

const kr = createMockKeyResult();
const context = {
  ...kr.progress,
  keyResultId: kr.id,
  trackingBaseValue: 40,
  aggregationSnapshot: { count: 3, sum: 8, max: 10, min: -2, last: 0 },
};

describe('Goal record preview context HTTP/IPC/client contract', () => {
  it.each(['HTTP', 'IPC'])(
    '%s preserves optional, nullable and populated context through the client',
    async (transport) => {
      for (const extension of [{}, { previewContext: null }, { previewContext: context }]) {
        const payload = { data: [], total: 3, ...extension };
        const response = ok(JSON.parse(JSON.stringify(payload)));
        const adapter =
          transport === 'HTTP'
            ? new GoalHttpAdapter({ get: vi.fn().mockResolvedValue(response) } as never)
            : new GoalIpcAdapter({ invoke: vi.fn().mockResolvedValue(response) } as never);
        const result = await adapter.getGoalRecordsByKeyResult('goal-1', String(kr.id), {
          limit: 1,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        expect(GoalRecordListResSchema.parse(result.data)).toEqual(payload);
        const clientResult = await createGoalClientService(adapter).getGoalRecordsByKeyResult(
          'goal-1',
          String(kr.id),
        );
        expect(clientResult.ok).toBe(true);
        if (clientResult.ok)
          expect(clientResult.data.previewContext).toEqual(
            'previewContext' in extension ? extension.previewContext : undefined,
          );
      }
    },
  );

  it('keeps trackingBaseValue out of normal KR DTOs and rejects non-finite preview seed', () => {
    expect(KeyResultClientDTOSchema.parse(kr).progress).not.toHaveProperty('trackingBaseValue');
    expect(
      KeyResultProgressDTOSchema.safeParse({ ...kr.progress, trackingBaseValue: 40 }).success,
    ).toBe(false);
    expect(
      KeyResultClientDTOSchema.safeParse({
        ...kr,
        progress: { ...kr.progress, trackingBaseValue: 40 },
      }).success,
    ).toBe(false);
    expect(
      GoalRecordListResSchema.safeParse({
        data: [],
        total: 0,
        previewContext: { ...context, trackingBaseValue: Infinity },
      }).success,
    ).toBe(false);
  });
});
