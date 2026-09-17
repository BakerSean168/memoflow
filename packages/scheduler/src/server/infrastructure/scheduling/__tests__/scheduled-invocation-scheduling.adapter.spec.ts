import { describe, expect, it, vi } from 'vitest';
import { buildSchedulingKey, SchedulingReconcileError } from '../../../../scheduling';
import type { IScheduledInvocationRepository } from '../../../domain/repositories/i-scheduled-invocation-repository';
import { createScheduledInvocationSchedulingPort } from '../scheduled-invocation-scheduling.adapter';

describe('ScheduledInvocationSchedulingAdapter', () => {
  it('rejects duplicate desired scheduling keys before writing', async () => {
    const withTransaction = vi.fn();
    const repository = { withTransaction } as unknown as IScheduledInvocationRepository;
    const port = createScheduledInvocationSchedulingPort(repository, {
      now: () => 1_800_000_000_000,
      operationIdFactory: () => 'operation:duplicate-key',
    });
    const owner = { identityId: 'identity-1', type: 'task-plan', id: 'plan-1' };
    const schedulingKey = buildSchedulingKey(owner.type, owner.id, 'reminder:1');
    const desired = {
      schedulingKey,
      handlerKey: 'task.reminder.fire',
      runAt: 1_800_000_060_000,
      payloadVersion: 1,
      payload: { occurrenceId: 'occurrence-1' },
    };

    await expect(port.reconcile(owner, [desired, { ...desired }])).rejects.toMatchObject({
      name: SchedulingReconcileError.name,
      receipt: {
        status: 'failed',
        failure: { code: 'DUPLICATE_SCHEDULING_KEY', retryable: false },
      },
    });
    expect(withTransaction).not.toHaveBeenCalled();
  });
});
