import { describe, expect, it, vi } from 'vitest';
import { error, ok } from '@memoflow/contracts/result';
import { createMockTaskPlan } from '@memoflow/contracts/mocks';
import { TaskClientService } from './task-client-service';
import { TaskPlanHttpAdapter } from '../infrastructure-client/adapters/http/task-plan-http.adapter';
import { TaskPlanIpcAdapter } from '../infrastructure-client/adapters/ipc/task-plan-ipc.adapter';

describe('Task canonical read absence and transport parity', () => {
  it.each(['http', 'ipc'])('normalizes owner null through %s to NOT_FOUND', async (lane) => {
    const call = vi.fn(async () => ok(null));
    const port =
      lane === 'http'
        ? new TaskPlanHttpAdapter({ get: call } as never)
        : new TaskPlanIpcAdapter({ invoke: call } as never);
    const service = new TaskClientService(port, {} as never);
    expect(await service.getPlan('task-1')).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(call).toHaveBeenCalledOnce();
  });
  it('preserves unknown failure instead of treating it as absence', async () => {
    const result = error('NETWORK_ERROR', 'unknown');
    const service = new TaskClientService(
      { getTaskPlanById: vi.fn(async () => result) } as never,
      {} as never,
    );
    expect(await service.getPlan('task-1')).toBe(result);
  });
  it('maps a successful owner read with the exact canonical identity', async () => {
    const dto = createMockTaskPlan();
    const service = new TaskClientService(
      { getTaskPlanById: vi.fn(async () => ok(dto)) } as never,
      {} as never,
    );
    const result = await service.getPlan(String(dto.id));
    expect(result.ok && result.data.id).toBe(dto.id);
  });
});
