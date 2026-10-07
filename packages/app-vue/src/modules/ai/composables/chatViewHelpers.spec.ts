import { createPinia, setActivePinia } from 'pinia';
import { useAppShellStore } from '../../../layouts/shell/useAppShellStore';
import { canLeaveBusinessSurface } from '../../../layouts/shell/surface-leave-protocol';
import { describe, expect, it, vi } from 'vitest';
import type { AIWorkflowRunView } from '@memoflow/contracts/ai';
import type { IWorkflowRuntimeService } from '../../../di/types';
import { AIWorkflowRestoreError, loadAuthoritativeWorkflowRun } from './chatViewHelpers';
import { canLeaveAIWorkflowReview } from './chatViewHelpers';

describe('workflow conversation departure', () => {
  it.each([
    { mode: 'goal-create', module: 'goal', route: '/goals?dialog=goal' },
    { mode: 'task-create', module: 'task', route: '/tasks?dialog=task' },
    {
      mode: 'knowledge-capture',
      module: 'repository',
      route: '/repository?dialog=knowledge-capture',
    },
  ] as const)(
    'integrates $mode with the real shell dirty/busy protocol',
    ({ mode, module, route }) => {
      setActivePinia(createPinia());
      const shell = useAppShellStore();
      shell.openTab({ module, route, title: 'Review', intent: 'deeplink' });
      const tabId = shell.activeTabId;
      const originalConfirm = window.confirm;
      const confirm = vi.fn(() => false);
      window.confirm = confirm;
      const activity = { goal: false, task: false, knowledge: false };
      const leave = () =>
        canLeaveAIWorkflowReview(
          mode,
          activity,
          () => canLeaveBusinessSurface((key) => key),
          vi.fn(),
        );
      shell.setSurfaceStatus('dirty');
      expect(leave()).toBe(false);
      expect(confirm).toHaveBeenCalledOnce();
      expect(shell.activeTabId).toBe(tabId);
      expect(shell.surfaceStatus).toBe('dirty');
      confirm.mockReturnValue(true);
      expect(leave()).toBe(true);
      // Approval permits only this departure; the owner's draft remains dirty.
      expect(shell.surfaceStatus).toBe('dirty');
      shell.setSurfaceStatus('busy');
      expect(leave()).toBe(false);
      expect(shell.activeTabId).toBe(tabId);
      window.confirm = originalConfirm;
    },
  );

  it.each(['goal-create', 'task-create', 'knowledge-capture'] as const)(
    'protects %s busy and dirty native review',
    (mode) => {
      const leaveSurface = vi.fn().mockReturnValue(false);
      const notifyBusy = vi.fn();
      const activity = { goal: false, task: false, knowledge: false };
      expect(canLeaveAIWorkflowReview(mode, activity, leaveSurface, notifyBusy)).toBe(false);
      expect(leaveSurface).toHaveBeenCalledOnce();
      leaveSurface.mockClear();
      activity[mode === 'goal-create' ? 'goal' : mode === 'task-create' ? 'task' : 'knowledge'] =
        true;
      expect(canLeaveAIWorkflowReview(mode, activity, leaveSurface, notifyBusy)).toBe(false);
      expect(notifyBusy).toHaveBeenCalledOnce();
      expect(leaveSurface).not.toHaveBeenCalled();
      activity.goal = activity.task = activity.knowledge = false;
      leaveSurface.mockReturnValue(true);
      expect(canLeaveAIWorkflowReview(mode, activity, leaveSurface, notifyBusy)).toBe(true);
    },
  );
});

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
