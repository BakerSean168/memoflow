import { describe, expect, it, vi } from 'vitest';
import type { AIWorkflowRunView } from '@memoflow/contracts/ai';
import type { IWorkflowRuntimeService } from '../../../di/types';
import { AIWorkflowRestoreError, loadAuthoritativeWorkflowRun } from './chatViewHelpers';

function makeRun(conversationId = 'conversation-1'): AIWorkflowRunView {
  return {
    runId: 'run-1',
    conversationId,
    kind: 'goal.create',
    status: 'suspended',
    suspension: { type: 'clarification_required', questions: ['What matters?'], round: 1 },
    createdAt: 1,
    updatedAt: 2,
  };
}

function runtime(get: ReturnType<typeof vi.fn>): IWorkflowRuntimeService {
  return { get, start: vi.fn(), resume: vi.fn(), list: vi.fn(), cancel: vi.fn() };
}

describe('loadAuthoritativeWorkflowRun', () => {
  it('hydrates through get and rejects an unknown pointer without list fallback', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const service = runtime(get);

    await expect(
      loadAuthoritativeWorkflowRun(service, 'conversation-1', 'run-1'),
    ).rejects.toMatchObject({
      code: 'AI_WORKFLOW_RUN_NOT_FOUND',
    });
    expect(get).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(service.list).not.toHaveBeenCalled();
  });

  it('reports runtime unavailability instead of exposing a stale local projection', async () => {
    const get = vi.fn().mockRejectedValue(new Error('runtime offline'));

    await expect(
      loadAuthoritativeWorkflowRun(runtime(get), 'conversation-1', 'run-1'),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'AIWorkflowRestoreError',
        code: 'AI_WORKFLOW_RUNTIME_UNAVAILABLE',
      } satisfies Partial<AIWorkflowRestoreError>),
    );
  });

  it('rejects a run returned for another conversation', async () => {
    const get = vi.fn().mockResolvedValue(makeRun('other-conversation'));

    await expect(
      loadAuthoritativeWorkflowRun(runtime(get), 'conversation-1', 'run-1'),
    ).rejects.toMatchObject({
      code: 'AI_WORKFLOW_CONVERSATION_MISMATCH',
    });
  });

  it('returns the authoritative suspended HITL run unchanged', async () => {
    const authoritative = makeRun();
    const get = vi.fn().mockResolvedValue(authoritative);

    await expect(
      loadAuthoritativeWorkflowRun(runtime(get), 'conversation-1', 'run-1'),
    ).resolves.toBe(authoritative);
  });
});
