import { effectScope, ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AIWorkflowRunView, WorkspaceEvent } from '@memoflow/ai-contracts';
import type { WorkspaceEventStreamOptions, WorkflowRuntimeClient } from '@memoflow/ai/client';
import { useGoalWorkflowEvents } from './useGoalWorkflowEvents';

type GoalRun = Extract<AIWorkflowRunView, { kind: 'goal.create' }>;
const run = (version?: number): GoalRun => ({
  runId: 'run',
  conversationId: 'conversation',
  kind: 'goal.create',
  status: 'running',
  createdAt: 1,
  updatedAt: 1,
  ...(version ? { resourceVersion: version } : {}),
});
const action = {
  sequence: 1,
  command: { actionId: 'name', revision: 1, operation: 'goal.setName' as const, value: 'Draft' },
};
const event = (version: number): WorkspaceEvent => ({
  type: 'workflow.updated',
  eventId: `run:${version}`,
  cursor: `cursor-${version}`,
  resourceVersion: version,
  data: run(version),
  actions: [action],
  baseActionSequence: 0,
  lastActionSequence: 1,
});

function harness(initial = run()) {
  const current = ref<GoalRun | null>(initial);
  const streams: WorkspaceEventStreamOptions[] = [];
  const ends: Array<() => void> = [];
  const runtime: WorkflowRuntimeClient = {
    start: vi.fn(),
    resume: vi.fn(),
    list: vi.fn(),
    cancel: vi.fn(),
    goalSurfaceLease: vi.fn(),
    get: vi.fn(async () => run(1)),
    streamWorkspaceEvents: vi.fn((input) => {
      streams.push(input);
      return new Promise<void>((resolve) => {
        ends.push(resolve);
        input.signal.addEventListener('abort', () => resolve(), { once: true });
      });
    }),
  };
  const project = vi.fn(async (value: GoalRun | null) => {
    current.value = value;
  });
  const scope = effectScope();
  scope.run(() => useGoalWorkflowEvents({ current: () => current.value, runtime, project }));
  return { current, streams, ends, runtime, project, scope };
}

afterEach(() => vi.useRealTimers());

describe('Goal event subscription', () => {
  it('applies deltas once without per-field reads or periodic reads', async () => {
    vi.useFakeTimers();
    const h = harness();
    try {
      await h.streams[0]!.onEvent({ type: 'stream.ready', cursor: 'initial' });
      await h.streams[0]!.onEvent(event(2));
      await h.streams[0]!.onEvent(event(2));
      expect(h.current.value?.liveActions).toEqual([action]);
      expect(h.project).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(h.runtime.get).toHaveBeenCalledOnce();
      expect(h.runtime.streamWorkspaceEvents).toHaveBeenCalledOnce();
    } finally {
      h.scope.stop();
    }
  });

  it('calibrates a version gap once from the committed snapshot', async () => {
    const h = harness();
    try {
      await h.streams[0]!.onEvent({ type: 'stream.ready', cursor: 'initial' });
      vi.mocked(h.runtime.get).mockResolvedValueOnce({ ...run(4), liveActions: [action] });
      await h.streams[0]!.onEvent(event(4));
      expect(h.current.value).toMatchObject({ resourceVersion: 4, liveActions: [action] });
      expect(h.runtime.get).toHaveBeenCalledTimes(2);
      expect(h.project).toHaveBeenCalledTimes(2);
    } finally {
      h.scope.stop();
    }
  });

  it('reconnects with the last processed cursor and reads once to calibrate', async () => {
    vi.useFakeTimers();
    const h = harness();
    try {
      await h.streams[0]!.onEvent({ type: 'stream.ready', cursor: 'initial' });
      await h.streams[0]!.onEvent(event(2));
      h.ends[0]!();
      await flushPromises();
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.streams[1]?.cursor).toBe('cursor-2');
      vi.mocked(h.runtime.get).mockResolvedValueOnce({ ...run(2), liveActions: [action] });
      await h.streams[1]!.onEvent({ type: 'stream.ready', cursor: 'cursor-2' });
      expect(h.runtime.get).toHaveBeenCalledTimes(2);
    } finally {
      h.scope.stop();
    }
  });

  it('does not regress a detached resume to its old suspended version', async () => {
    const h = harness({ ...run(), awaitAfterVersion: 2 });
    try {
      vi.mocked(h.runtime.get).mockResolvedValueOnce({
        ...run(2),
        status: 'suspended',
        suspension: { type: 'clarification_required', questions: ['When?'] },
      });
      await h.streams[0]!.onEvent({ type: 'stream.ready', cursor: 'before-resume' });
      expect(h.current.value?.status).toBe('running');
      expect(h.project).not.toHaveBeenCalled();
      await h.streams[0]!.onEvent(event(3));
      expect(h.current.value).toMatchObject({
        status: 'running',
        resourceVersion: 3,
        liveActions: [action],
      });
    } finally {
      h.scope.stop();
    }
  });

  it('drops a late snapshot and cancels reconnects after the owner scope changes', async () => {
    vi.useFakeTimers();
    const h = harness();
    try {
      let complete!: (value: GoalRun) => void;
      vi.mocked(h.runtime.get).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
      const read = h.streams[0]!.onEvent({ type: 'stream.ready', cursor: 'initial' });
      await Promise.resolve();
      expect(complete).toBeDefined();
      h.current.value = null;
      complete(run(2));
      await read;
      expect(h.project).not.toHaveBeenCalled();
      expect(h.streams[0]?.signal.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(h.runtime.streamWorkspaceEvents).toHaveBeenCalledOnce();
    } finally {
      h.scope.stop();
    }
  });
});
