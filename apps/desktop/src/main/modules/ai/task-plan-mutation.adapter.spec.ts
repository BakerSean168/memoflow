import { describe, expect, it, vi } from 'vitest';
import { error, ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { DesktopTaskPlanMutationAdapter } from './task-plan-mutation.adapter';
const context = { identityId: 'identity-1' } as ExecutionContext;
function setup() {
  const task = { getTaskPlan: vi.fn() };
  const adapter = new DesktopTaskPlanMutationAdapter(task as never, {} as never);
  return { task, adapter };
}
describe('DesktopTaskPlanMutationAdapter canonical Task probe', () => {
  it('reads exact Task identity through owner identity scope', async () => {
    const { task, adapter } = setup();
    task.getTaskPlan.mockResolvedValue(ok({ id: 'task-1' }));
    expect(await adapter.readTaskPlan('task-1', context)).toEqual(ok({ taskId: 'task-1' }));
    expect(task.getTaskPlan).toHaveBeenCalledExactlyOnceWith('task-1', context.identityId);
  });
  it('normalizes canonical null to NOT_FOUND', async () => {
    const { task, adapter } = setup();
    task.getTaskPlan.mockResolvedValue(ok(null));
    expect(await adapter.readTaskPlan('task-1', context)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });
  it.each(['NOT_FOUND', 'NETWORK_ERROR'])('preserves owner %s', async (code) => {
    const { task, adapter } = setup();
    const result = error(code, 'failed');
    task.getTaskPlan.mockResolvedValue(result);
    expect(await adapter.readTaskPlan('task-1', context)).toBe(result);
  });
  it('preserves thrown read failures for workflow boundary', async () => {
    const { task, adapter } = setup();
    task.getTaskPlan.mockRejectedValue(new Error('offline'));
    await expect(adapter.readTaskPlan('task-1', context)).rejects.toThrow('offline');
  });
});
