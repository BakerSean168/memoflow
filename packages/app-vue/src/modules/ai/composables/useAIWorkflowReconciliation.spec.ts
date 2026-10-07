import { effectScope, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIWorkflowRunView } from '@memoflow/contracts/ai';
import { useAIWorkflowReconciliation } from './useAIWorkflowReconciliation';

const running: AIWorkflowRunView = {
  runId: 'r',
  conversationId: 'c',
  kind: 'goal.create',
  status: 'running',
  createdAt: 1,
  updatedAt: 1,
};
afterEach(() => vi.useRealTimers());

describe('authoritative workflow reconciliation', () => {
  it('stops polling when an acknowledged run is missing', async () => {
    vi.useFakeTimers();
    const scope = effectScope();
    const get = vi.fn().mockResolvedValue(null);
    const stopped = vi.fn();
    scope.run(() =>
      useAIWorkflowReconciliation({ current: () => running, get, project: vi.fn(), stopped }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(get).toHaveBeenCalledTimes(1);
    expect(stopped).toHaveBeenCalledWith(running, 'missing');
    scope.stop();
  });

  it('rejects foreign identity even when the returned run is still running', async () => {
    vi.useFakeTimers();
    const scope = effectScope();
    const project = vi.fn();
    const stopped = vi.fn();
    scope.run(() =>
      useAIWorkflowReconciliation({
        current: () => running,
        get: vi.fn().mockResolvedValue({ ...running, conversationId: 'foreign' }),
        project,
        stopped,
      }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(project).not.toHaveBeenCalled();
    expect(stopped).toHaveBeenCalledWith(running, 'invalid');
    scope.stop();
  });

  it('retries transient errors but bounds persistent failures', async () => {
    vi.useFakeTimers();
    const scope = effectScope();
    const get = vi.fn().mockRejectedValue(new Error('offline'));
    const stopped = vi.fn();
    scope.run(() =>
      useAIWorkflowReconciliation({ current: () => running, get, project: vi.fn(), stopped }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(get).toHaveBeenCalledTimes(5);
    expect(stopped).toHaveBeenCalledWith(running, 'unavailable');
    scope.stop();
  });

  it('ignores an in-flight response after changing conversation', async () => {
    vi.useFakeTimers();
    const scope = effectScope();
    const current = ref<AIWorkflowRunView | null>(running);
    let resolve!: (run: AIWorkflowRunView) => void;
    const project = vi.fn();
    scope.run(() =>
      useAIWorkflowReconciliation({
        current: () => current.value,
        get: () =>
          new Promise((done) => {
            resolve = done;
          }),
        project,
        stopped: vi.fn(),
      }),
    );
    await vi.advanceTimersByTimeAsync(500);
    current.value = null;
    resolve({ ...running, status: 'completed' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(project).not.toHaveBeenCalled();
    scope.stop();
  });

  it('projects a stable state after a transient error and stops', async () => {
    vi.useFakeTimers();
    const scope = effectScope();
    const completed = { ...running, status: 'completed' };
    const get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(completed);
    const project = vi.fn();
    scope.run(() =>
      useAIWorkflowReconciliation({ current: () => running, get, project, stopped: vi.fn() }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(get).toHaveBeenCalledTimes(2);
    expect(project).toHaveBeenCalledExactlyOnceWith(completed);
    scope.stop();
  });
});
