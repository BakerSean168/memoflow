/** @vitest-environment happy-dom */
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { useDurableConversationAttention } from './useDurableConversationAttention';
import type { AssistantAttentionView } from '@memoflow/ai-contracts';
import type { ConversationSummary } from './types';
import type { WorkflowRuntimeClient, WorkspaceEventStreamOptions } from '@memoflow/ai/client';

const row = (
  id: string,
  state: AssistantAttentionView['state'],
  revision = 2,
  runtimeKind: AssistantAttentionView['runtimeKind'] = 'builtin',
): AssistantAttentionView => ({
  conversationId: id,
  runtimeKind,
  state,
  revision,
  seenRevision: 0,
  runId: `run-${id}-${revision}`,
  updatedAt: Date.now(),
});
const conv = (id: string, kind: 'builtin' | 'local_agent' = 'builtin') =>
  ({ id, name: id, runtimeKind: kind }) as ConversationSummary;

function fixture(
  list: (ids: string[], kind?: string) => Promise<AssistantAttentionView[]>,
  workspaceRuntime?: WorkflowRuntimeClient,
) {
  const conversations = ref<ConversationSummary[]>([conv('first'), conv('native', 'local_agent')]);
  const activeConversationId = ref('first');
  const loading = ref(false);
  const local = ref({});
  let visible = true;
  const runtime = {
    listAttention: vi.fn(list),
    acknowledgeAttention: vi.fn(async () => true),
  };
  let state!: ReturnType<typeof useDurableConversationAttention>;
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useDurableConversationAttention({
          runtime: runtime as never,
          workspaceRuntime,
          conversations,
          activeConversationId,
          loading,
          local,
          isVisible: () => visible,
        });
        return () => h('div');
      },
    }),
  );
  return {
    runtime,
    state,
    wrapper,
    conversations,
    activeConversationId,
    loading,
    local,
    setVisible(value: boolean) {
      visible = value;
    },
  };
}

describe('durable conversation attention projection', () => {
  it('rejects failed stream calibration and restores the same listener on the next ready', async () => {
    let receive!: WorkspaceEventStreamOptions['onEvent'];
    const workspaceRuntime: WorkflowRuntimeClient = {
      streamWorkspaceEvents: vi.fn((options) => {
        receive = options.onEvent;
        return new Promise<void>((resolve) =>
          options.signal.addEventListener('abort', () => resolve(), { once: true }),
        );
      }),
      start: vi.fn(),
      resume: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      cancel: vi.fn(),
      goalSurfaceLease: vi.fn(),
    };
    let offline = false;
    const f = fixture(async (_ids, kind) => {
      if (offline) throw new Error('snapshot unavailable');
      return kind === 'builtin' ? [row('first', 'failed')] : [];
    }, workspaceRuntime);
    try {
      await receive({ type: 'stream.ready', cursor: 'before' });
      offline = true;
      await expect(
        receive({ type: 'stream.reset_required', cursor: 'reset', reason: 'expired' }),
      ).rejects.toThrow('Attention snapshot unavailable');
      offline = false;
      await receive({ type: 'stream.ready', cursor: 'recovered' });
      expect(f.state.statuses.value.first).toBe('failed');
    } finally {
      f.wrapper.unmount();
    }
  });

  it('projects events and tombstones without polling or allowing stale snapshots to resurrect them', async () => {
    vi.useFakeTimers();
    let receive!: WorkspaceEventStreamOptions['onEvent'];
    const workspaceRuntime: WorkflowRuntimeClient = {
      streamWorkspaceEvents: vi.fn((options) => {
        receive = options.onEvent;
        return new Promise<void>((resolve) =>
          options.signal.addEventListener('abort', () => resolve(), { once: true }),
        );
      }),
      start: vi.fn(),
      resume: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      cancel: vi.fn(),
      goalSurfaceLease: vi.fn(),
    };
    const f = fixture(
      async (_ids, kind) =>
        kind === 'builtin' ? [{ ...row('first', 'working'), resourceVersion: 1 }] : [],
      workspaceRuntime,
    );
    try {
      f.activeConversationId.value = 'native';
      await receive({ type: 'stream.ready', cursor: 'ready' });
      expect(f.state.statuses.value.first).toBe('working');
      await receive({
        type: 'attention.changed',
        cursor: 'done',
        eventId: 'done',
        resourceVersion: 2,
        data: {
          conversationId: 'first',
          runtimeKind: 'builtin',
          attention: { ...row('first', 'done', 3), resourceVersion: 2 },
        },
      });
      expect(f.state.statuses.value.first).toBe('done');
      await f.state.refresh();
      expect(f.state.statuses.value.first).toBe('done');
      await receive({
        type: 'attention.changed',
        cursor: 'deleted',
        eventId: 'deleted',
        resourceVersion: 3,
        data: { conversationId: 'first', runtimeKind: 'builtin', attention: null },
      });
      await f.state.refresh();
      expect(f.state.statuses.value.first).toBeUndefined();
      const reads = f.runtime.listAttention.mock.calls.length;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(f.runtime.listAttention).toHaveBeenCalledTimes(reads);
      expect(workspaceRuntime.streamWorkspaceEvents).toHaveBeenCalledOnce();
    } finally {
      f.wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it('separates Web/Mastra and native Desktop identities and combines current live priority', async () => {
    const f = fixture(async (ids, kind) =>
      kind === 'builtin' ? [row('first', 'failed')] : [row('native', 'input', 4, 'local_agent')],
    );
    await f.state.refresh();
    expect(f.runtime.listAttention).toHaveBeenCalledWith(['first'], 'builtin');
    expect(f.runtime.listAttention).toHaveBeenCalledWith(['native'], 'local_agent');
    expect(f.state.statuses.value).toMatchObject({ first: 'failed', native: 'input' });
    f.loading.value = true;
    f.local.value = { first: 'approval' };
    await nextTick();
    expect(f.state.statuses.value.first).toBe('approval');
    f.wrapper.unmount();
  });

  it('renders unseen Done in another conversation and acknowledges on selection', async () => {
    const f = fixture(async (ids, kind) =>
      kind === 'builtin' ? [row('first', 'normal'), row('unseen', 'done', 6)] : [],
    );
    f.conversations.value.push(conv('unseen'));
    await f.state.refresh();
    expect(f.state.statuses.value.unseen).toBe('done');
    f.activeConversationId.value = 'unseen';
    await vi.waitFor(() =>
      expect(f.runtime.acknowledgeAttention).toHaveBeenCalledWith('unseen', 6, 'builtin'),
    );
    expect(f.state.statuses.value.unseen).toBeUndefined();
    f.wrapper.unmount();
  });

  it('never hides a newer result after acknowledging an older revision', async () => {
    let revision = 3;
    const f = fixture(async () => [row('first', 'done', revision)]);
    f.activeConversationId.value = 'native';
    await f.state.refresh();
    expect(f.state.statuses.value.first).toBe('done');
    await f.state.acknowledge('first');
    revision = 4;
    await f.state.refresh();
    expect(f.state.statuses.value.first).toBe('done');
    expect(f.runtime.acknowledgeAttention).toHaveBeenCalledWith('first', 3, 'builtin');
    f.wrapper.unmount();
  });

  it('coalesces concurrent calibrations and fails closed on a read outage', async () => {
    let resolve!: (rows: AssistantAttentionView[]) => void;
    let calls = 0;
    const f = fixture(async (_ids, kind) => {
      if (kind === 'local_agent') return [];
      calls++;
      if (calls === 1)
        return new Promise((done) => {
          resolve = done;
        });
      if (calls === 2) return [row('first', 'working')];
      throw new Error('network offline');
    });
    // The mounted composable starts the first (delayed) poll automatically.
    await vi.waitFor(() => expect(resolve).toBeDefined());
    const concurrent = f.state.refresh();
    expect(calls).toBe(1);
    resolve([row('first', 'failed')]);
    await concurrent;
    expect(f.state.statuses.value.first).toBe('failed');
    await f.state.refresh();
    expect(f.state.statuses.value.first).toBe('working');
    await f.state.refresh();
    expect(f.state.statuses.value.first).toBeUndefined();
    f.wrapper.unmount();
  });
});
