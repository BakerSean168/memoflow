import { describe, expect, it, vi } from 'vitest';
import { GOAL_CREATE_LIFECYCLE_STEP_ID } from '../workflows';
import { MastraDurableWorkflowRuntime } from './mastra-durable-workflow.runtime';

function goalRow(status = 'running', identityId = 'owner') {
  return {
    runId: 'run-1',
    resourceId: identityId,
    createdAt: new Date(1),
    updatedAt: new Date(2),
    snapshot: {
      status,
      context: {
        input: { identityId, conversationId: 'conversation-1', idea: 'Plan a goal' },
        ...(status === 'suspended'
          ? {
              [GOAL_CREATE_LIFECYCLE_STEP_ID]: {
                suspendPayload: { type: 'clarification_required', questions: ['Which date?'] },
              },
            }
          : {}),
      },
    },
  };
}

function harness() {
  const lease = {
    claim: vi.fn(async ({ token, expiresAt }: { token: string; expiresAt: number }) => ({
      token,
      fence: 7,
      expiresAt,
    })),
    renew: vi.fn(async () => true),
    release: vi.fn(async () => true),
  };
  const getWorkflowRunById = vi.fn(async () => goalRow());
  const runtime = new MastraDurableWorkflowRuntime({
    storage: {
      getStore: vi.fn(async () => ({ getWorkflowRunById })),
    },
    goalSurfaceLeaseRepository: lease,
  } as never);
  return { lease, runtime, getWorkflowRunById };
}

describe('Goal native surface lease runtime boundary', () => {
  it('mints an opaque token server side and binds all operations to authenticated identity', async () => {
    const { lease, runtime } = harness();
    const claim = await runtime.goalSurfaceLease({
      identityId: 'owner',
      request: { action: 'claim', runId: 'run-1' },
    });
    expect(claim).toMatchObject({ status: 'claimed', fence: 7 });
    if (claim.status !== 'claimed') throw new Error('Expected successful claim');
    expect(claim.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(lease.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'owner',
        runId: 'run-1',
        token: claim.token,
      }),
    );
    expect(
      await runtime.goalSurfaceLease({
        identityId: 'owner',
        request: { action: 'renew', runId: 'run-1', token: claim.token, fence: claim.fence },
      }),
    ).toMatchObject({ status: 'renewed' });
    expect(lease.renew).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'owner', fence: 7 }),
    );
    expect(
      await runtime.goalSurfaceLease({
        identityId: 'owner',
        request: { action: 'release', runId: 'run-1', token: claim.token, fence: claim.fence },
      }),
    ).toEqual({ status: 'released' });
  });

  it('rejects foreign identity and non-Goal or terminal workflow without calling lease adapter', async () => {
    const { lease, runtime, getWorkflowRunById } = harness();
    getWorkflowRunById.mockResolvedValueOnce(null as never);
    expect(
      await runtime.goalSurfaceLease({
        identityId: 'other',
        request: { action: 'claim', runId: 'run-1' },
      }),
    ).toEqual({ status: 'lost' });
    getWorkflowRunById.mockResolvedValueOnce(goalRow('running', 'other') as never);
    expect(
      await runtime.goalSurfaceLease({
        identityId: 'owner',
        request: { action: 'claim', runId: 'run-1' },
      }),
    ).toEqual({ status: 'lost' });
    getWorkflowRunById.mockResolvedValueOnce(goalRow('canceled') as never);
    expect(
      await runtime.goalSurfaceLease({
        identityId: 'owner',
        request: { action: 'claim', runId: 'run-1' },
      }),
    ).toEqual({ status: 'lost' });
    expect(lease.claim).not.toHaveBeenCalled();
  });

  it('fails closed on occupied or stale generations and honors authenticated release after terminal', async () => {
    const { lease, runtime, getWorkflowRunById } = harness();
    lease.claim.mockResolvedValueOnce(null as never);
    expect(
      await runtime.goalSurfaceLease({
        identityId: 'owner',
        request: { action: 'claim', runId: 'run-1' },
      }),
    ).toEqual({ status: 'busy' });
    lease.renew.mockResolvedValueOnce(false);
    const token = '11111111-1111-4111-8111-111111111111';
    expect(
      await runtime.goalSurfaceLease({
        identityId: 'owner',
        request: { action: 'renew', runId: 'run-1', token, fence: 2 },
      }),
    ).toEqual({ status: 'lost' });
    getWorkflowRunById.mockResolvedValueOnce(goalRow('canceled') as never);
    expect(
      await runtime.goalSurfaceLease({
        identityId: 'owner',
        request: { action: 'release', runId: 'run-1', token, fence: 2 },
      }),
    ).toEqual({ status: 'released' });
    expect(lease.release).toHaveBeenCalledTimes(1);
  });
});
