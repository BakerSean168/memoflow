import { describe, expect, it, vi } from 'vitest';
import { createMockGoalRecord } from '@memoflow/contracts/mocks';
import { GoalRecordClientDTOSchema } from '@memoflow/contracts/goal';
import { ok } from '@memoflow/contracts/result';
import { GoalHttpAdapter } from './http/goal-http.adapter';
import { GoalIpcAdapter } from './ipc/goal-ipc.adapter';
import { createGoalClientService } from '../../application-client';

describe('Goal client record provenance', () => {
  it.each(['HTTP', 'IPC'])('%s preserves authorship, source and recordedAt in entity and DTO', async (transport) => {
    for (const authorship of ['Manual', 'TaskAutomatic', 'TaskUserMeasurement'] as const) {
      const dto = createMockGoalRecord({ authorship, recordedAt: 1000, createdAt: 2000,
        source: authorship === 'Manual' ? null : { type: 'TASK_INSTANCE', id: 'occurrence' } });
      const response = ok({ data: [dto], total: 1 });
      const adapter = transport === 'HTTP'
        ? new GoalHttpAdapter({ get: vi.fn().mockResolvedValue(response) } as never)
        : new GoalIpcAdapter({ invoke: vi.fn().mockResolvedValue(response) } as never);
      const service = createGoalClientService(adapter);
      for (const result of [await service.getGoalRecordsByKeyResult(dto.goalId, dto.keyResultId),
        await service.getGoalRecordsByGoal(dto.goalId)]) {
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        const record = result.data.records[0]!;
        expect(record.authorship).toBe(authorship);
        expect(record.source).toEqual(dto.source);
        expect(record.recordedAt).toBe(1000);
        expect(GoalRecordClientDTOSchema.parse(record.toDTO())).toEqual(dto);
      }
    }
  });
});
