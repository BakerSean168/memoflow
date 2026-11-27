import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  computeRunElapsedMs,
  deriveChatTimelineRows,
  formatDuration,
  formatWorkingTimer,
  projectAgentActivity,
  reduceRunTimingOnEvent,
  secondTick,
  subscribeVisibleSecondTick,
  type ChatRunTiming,
} from './agentActivity';
import type { AssistantRuntimeEvent } from '@memoflow/ai-contracts';
import type { ChatItem } from './types';

const item: ChatItem = {
  id: 'a',
  role: 'assistant',
  content: '',
  status: 'generating',
  nativeActivities: [
    { toolCallId: '1', label: 'commandExecution', state: 'running' },
    {
      toolCallId: '2',
      label: 'execute --token PRIVATE_ARGUMENT',
      state: 'failed',
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
});

describe('Agent activity projection', () => {
  it('projects concurrent native tools and real failure without arguments or inferred reasoning', () => {
    const view = projectAgentActivity(item);
    expect(view.phase).toBe('processing');
    expect(view.active).toBe(true);
    expect(view.running.map((call) => call.name)).toEqual(['commandExecution']);
    expect(view.records[1]).toMatchObject({ name: '', state: 'failed' });
    expect(JSON.stringify(view)).not.toContain('PRIVATE_ARGUMENT');
    expect(projectAgentActivity({ ...item, nativeActivities: [] }).phase).toBe('preparing');
    expect(
      projectAgentActivity({
        ...item,
        nativeActivities: [],
        activityUpdatedAt: 1,
      }).phase,
    ).toBe('processing');
  });

  it.each(['success', 'aborted', 'error', 'interrupted'] as const)(
    'never replays a running snapshot as live after %s',
    (status) => {
      const view = projectAgentActivity({ ...item, status });
      expect(view.active).toBe(false);
      expect(view.running).toEqual([]);
      expect(view.records[0].state).toBe('interrupted');
      expect(view.records[1].state).toBe('failed');
    },
  );

  it('pauses for pending or sending input including restored suspended runs', () => {
    for (const status of ['pending', 'sending'] as const) {
      const view = projectAgentActivity({
        ...item,
        status: 'success',
        askUserRequests: [
          {
            toolCallId: 'ask',
            runId: 'r',
            conversationId: 'c',
            question: 'Choose',
            status,
          },
        ],
      });
      expect(view.phase).toBe('waiting');
      expect(view.active).toBe(false);
    }
  });

  it('bounds the history and keeps stable tool identifiers', () => {
    const view = projectAgentActivity({
      ...item,
      nativeActivities: Array.from({ length: 300 }, (_, i) => ({
        toolCallId: `${i}`,
        label: 'search',
        state: 'completed',
      })),
    });
    expect(view.records).toHaveLength(256);
    expect(view.records.at(-1)?.id).toBe('native:299');
  });
});

describe('Run timing reducer and duration formatting', () => {
  function runtimeEvent(
    type: AssistantRuntimeEvent['type'],
    createdAt: number,
    sequence = 1,
    runId = 'run-1',
    data: Record<string, unknown> = {},
  ): AssistantRuntimeEvent {
    return {
      eventId: `${runId}:${sequence}`,
      runId,
      conversationId: 'conv-1',
      sequence,
      createdAt,
      type,
      data,
    } as AssistantRuntimeEvent;
  }

  it('computes elapsed time from runtime started to terminal events excluding approval pauses', () => {
    let timing = reduceRunTimingOnEvent(
      undefined,
      runtimeEvent('assistant.run.started', 1_000, 1),
      false,
      1_000,
    );
    // Duplicate started event must not reset startedAt.
    timing = reduceRunTimingOnEvent(
      timing,
      runtimeEvent('assistant.run.started', 2_500, 2),
      false,
      2_500,
    );
    expect(timing.startedAt).toBe(1_000);

    // Waiting for approval pauses generation clock at 3_000ms.
    timing = reduceRunTimingOnEvent(
      timing,
      runtimeEvent('assistant.approval.required', 3_000, 3),
      true,
      3_000,
    );
    expect(computeRunElapsedMs(timing, 8_000)).toBe(2_000);

    // Approval resolved at 7_000ms -> 4_000ms excluded.
    timing = reduceRunTimingOnEvent(
      timing,
      runtimeEvent('assistant.approval.resolved', 7_000, 4),
      false,
      7_000,
    );
    // Run completes at 10_500ms -> active elapsed = 10_500 - 1_000 - 4_000 = 5_500ms.
    timing = reduceRunTimingOnEvent(
      timing,
      runtimeEvent('assistant.run.completed', 10_500, 5, 'run-1', { content: 'ok' }),
      false,
      10_500,
    );
    expect(computeRunElapsedMs(timing)).toBe(5_500);

    // Late non-terminal events after terminal cannot reopen or mutate timing.
    const afterLate = reduceRunTimingOnEvent(
      timing,
      runtimeEvent('assistant.run.started', 99_000, 6),
      false,
      99_000,
    );
    expect(computeRunElapsedMs(afterLate)).toBe(5_500);
  });

  it('never fabricates elapsed time when started or terminal events are missing', () => {
    const startedOnly = reduceRunTimingOnEvent(
      undefined,
      runtimeEvent('assistant.run.started', 1_000, 1),
      false,
      1_000,
    );
    expect(computeRunElapsedMs(startedOnly)).toBeNull();

    const terminalWithoutStarted = reduceRunTimingOnEvent(
      undefined,
      runtimeEvent('assistant.run.completed', 5_000, 2, 'run-2', { content: 'ok' }),
      false,
      5_000,
    );
    expect(computeRunElapsedMs(terminalWithoutStarted)).toBeNull();
    expect(computeRunElapsedMs(null)).toBeNull();
  });

  it('handles out-of-order started arriving after pause/terminal events', () => {
    let timing = reduceRunTimingOnEvent(
      undefined,
      runtimeEvent('assistant.approval.required', 4_000, 2),
      true,
      4_000,
    );
    timing = reduceRunTimingOnEvent(
      timing,
      runtimeEvent('assistant.run.started', 1_500, 1),
      true,
      1_500,
    );
    timing = reduceRunTimingOnEvent(
      timing,
      runtimeEvent('assistant.run.cancelled', 6_500, 3),
      false,
      6_500,
    );
    expect(computeRunElapsedMs(timing)).toBe(2_500);
  });

  it('formats durations across ms, seconds, minutes, and hours in en-US and zh-CN', () => {
    expect(formatDuration(450, 'en-US')).toBe('450ms');
    expect(formatDuration(4_240, 'en-US')).toBe('4.2s');
    expect(formatDuration(65_000, 'en-US')).toBe('1m 5s');
    expect(formatDuration(3_661_000, 'en-US')).toBe('1h 1m 1s');
    expect(formatWorkingTimer(9_900, 'en-US')).toBe('9s');

    expect(formatDuration(4_240, 'zh-CN')).toBe('4.2 秒');
    expect(formatDuration(65_000, 'zh-CN')).toBe('1 分 5 秒');
    expect(formatWorkingTimer(9_900, 'zh-CN')).toBe('9 秒');
  });

  it('shares a single secondTick timer across subscribers and clears when all unsubscribe', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeVisibleSecondTick(a);
    const unsubB = secondTick.subscribe(b);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    unsubA();
    expect(vi.getTimerCount()).toBe(1);
    unsubB();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Pure timeline / turn projection (T3 alignment)', () => {
  it.each([false, true])(
    'preserves chronological order and latest activity in long active tool groups, expanded=%s',
    (expanded) => {
      const assistant: ChatItem = {
        id: 'assistant-long',
        role: 'assistant',
        content: '',
        status: 'generating',
        localAgentSource: { connectionId: 'conn-1', modelId: 'gpt-5', runId: 'long-active-run' },
        nativeActivities: Array.from({ length: 300 }, (_, index) => ({
          toolCallId: `tool-${index}`,
          label: `tool_${index}`,
          state: index === 299 ? 'running' : 'completed',
        })),
      };
      const groupId = 'work-group:run:long-active-run';
      const rows = deriveChatTimelineRows({
        timeline: [assistant],
        expandedWorkGroupIds: new Set(expanded ? [groupId] : []),
      });
      expect(rows).toHaveLength(1);
      const turn = rows[0]!;
      expect(turn.kind).toBe('assistant-turn');
      if (turn.kind !== 'assistant-turn') return;

      const live = turn.workRows.find((row) => row.kind === 'work-live');
      expect(live).toMatchObject({
        kind: 'work-live',
        active: true,
        groupId,
        entry: { id: 'native:tool-299', name: 'tool_299', state: 'running' },
      });
      expect(turn.records).toHaveLength(256);
      expect(turn.records[0]?.id).toBe('native:tool-44');
      expect(turn.records.at(-1)?.id).toBe('native:tool-299');

      const details = turn.workRows.filter((row) => row.kind === 'work');
      expect(details).toHaveLength(expanded ? 1 : 0);
      if (expanded && live?.kind === 'work-live') {
        expect(details[0]).toMatchObject({
          isExpandedToolGroup: true,
          groupedEntries: live.groupedEntries,
        });
      }
    },
  );

  it('aggregates receipt and reply items of the same run without swallowing approvals or requests', () => {
    const approvalReceiptItem: ChatItem = {
      id: 'receipt-1',
      role: 'assistant',
      content: '',
      status: 'success',
      approvals: [
        {
          runId: 'run-42',
          conversationId: 'conv-1',
          toolCallId: 'call-write',
          toolName: 'routine_create',
          category: 'edit',
          risk: 'high',
          status: 'approved',
        },
      ],
      toolActivities: [
        { toolCallId: 'call-read', toolName: 'knowledge_search', state: 'completed' },
      ],
    };
    const replyItem: ChatItem = {
      id: 'reply-1',
      role: 'assistant',
      content: 'Routine created.',
      status: 'success',
      toolActivities: [
        { toolCallId: 'call-write', toolName: 'routine_create', state: 'completed' },
      ],
    };
    const timingByItem = new Map<ChatItem, ChatRunTiming>([
      [
        replyItem,
        {
          runId: 'run-42',
          startedAt: 1_000,
          completedAt: 5_200,
          pausedDurationMs: 0,
          terminalObserved: true,
        },
      ],
    ]);

    const rows = deriveChatTimelineRows({
      timeline: [
        { id: 'u1', role: 'user', content: 'Create it', status: 'success' },
        approvalReceiptItem,
        replyItem,
      ],
      getRunTiming: (entry) => timingByItem.get(entry) ?? null,
    });

    expect(rows).toHaveLength(2);
    const turn = rows[1]!;
    expect(turn.kind).toBe('assistant-turn');
    if (turn.kind !== 'assistant-turn') return;
    expect(turn.approvals).toHaveLength(1);
    expect(turn.records.map((r) => r.id)).toEqual(['tool:call-read', 'tool:call-write']);
    // A clean completion keeps no working row and no "Worked for" fold; the reply's
    // own timestamp is the only remaining time signal.
    expect(turn.foldRow).toBeNull();
    expect(turn.workRows).toEqual([]);
    expect(turn.elapsedMs).toBe(4_200);
    expect(turn.messages.map((m) => m.item.content)).toEqual(['Routine created.']);

    const expandedRows = deriveChatTimelineRows({
      timeline: [
        { id: 'u1', role: 'user', content: 'Create it', status: 'success' },
        approvalReceiptItem,
        replyItem,
      ],
      expandedTurnKeys: new Set([turn.turnKey]),
      getRunTiming: (entry) => timingByItem.get(entry) ?? null,
    });
    const expandedTurn = expandedRows[1]!;
    if (expandedTurn.kind !== 'assistant-turn') return;
    expect(expandedTurn.foldRow).toBeNull();
    expect(expandedTurn.workRows).toEqual([]);
  });

  it('keeps failed turns and failed tool groups unfolded by default and allows collapsing them', () => {
    const failedItem: ChatItem = {
      id: 'failed-1',
      role: 'assistant',
      content: '',
      status: 'error',
      toolActivities: [
        { toolCallId: 'c1', toolName: 'knowledge_search', state: 'completed' },
        { toolCallId: 'c2', toolName: 'routine_create', state: 'failed' },
      ],
    };
    const rows = deriveChatTimelineRows({ timeline: [failedItem] });
    const turn = rows[0]!;
    expect(turn.kind).toBe('assistant-turn');
    if (turn.kind !== 'assistant-turn') return;
    expect(turn.foldRow?.expanded).toBe(true);
    expect(turn.workRows.map((r) => r.kind)).toEqual(['work-toggle', 'work']);

    const collapsed = deriveChatTimelineRows({
      timeline: [failedItem],
      collapsedTurnKeys: new Set([turn.turnKey]),
    });
    const collapsedTurn = collapsed[0]!;
    if (collapsedTurn.kind !== 'assistant-turn') return;
    expect(collapsedTurn.foldRow?.expanded).toBe(false);
    expect(collapsedTurn.workRows).toEqual([]);
  });

  it('groups consecutive user messages and omits empty internal assistant bubbles', () => {
    const rows = deriveChatTimelineRows({
      timeline: [
        { id: 'u1', role: 'user', content: 'First', status: 'success' },
        { id: 'u2', role: 'user', content: 'Second', status: 'success' },
        { id: 'empty', role: 'assistant', content: '', status: 'success' },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: 'user-message',
      groupedWithPrevious: false,
      groupedWithNext: true,
    });
    expect(rows[1]).toMatchObject({
      kind: 'user-message',
      groupedWithPrevious: true,
      groupedWithNext: false,
    });
  });
});
