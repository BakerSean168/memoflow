import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { RequestContext } from '@mastra/core/request-context';
import { createMemoFlowProductTools, RoutineTriggerSchema } from './product-tools';
import {
  MEMOFLOW_PRODUCT_TOOL_POLICY,
  assertMemoFlowToolClassification,
  applyMemoFlowSessionToolPolicy,
} from './product-tool-policy';

function context() {
  const requestContext = new RequestContext();
  const executionContext: ExecutionContext = {
    identityId: 'identity-1',
    requestId: 'request-1',
    traceId: 'request-1',
    startedAt: 1,
    source: 'http',
  };
  requestContext.setRaw('identityId', executionContext.identityId);
  requestContext.setRaw('executionContext', executionContext);
  return requestContext;
}

const elapsedTrigger = {
  type: 'Elapsed' as const,
  timingOwner: 'local-runtime' as const,
  durationMs: 50 * 60_000,
  anchor: 'routine-activation' as const,
};

describe('MemoFlow AI owner tools (AI-9609)', () => {
  it('requires approval for high-impact Routine and Notification mutations', () => {
    const tools = createMemoFlowProductTools({});
    for (const name of [
      'routine_create',
      'routine_set_profile_active',
      'routine_set_temporary_override',
      'routine_clear_temporary_override',
      'routine_start_protocol',
      'notification_execute_action',
    ] as const) {
      expect(tools[name].requireApproval).toBe(true);
    }
    expect(tools.routine_pause_protocol.requireApproval).not.toBe(true);
    expect(tools.routine_resume_protocol.requireApproval).not.toBe(true);
    expect(tools.routine_end_protocol.requireApproval).not.toBe(true);
  });

  it('classifies every registered tool and derives its explicit approval setting', () => {
    const tools = createMemoFlowProductTools({});
    expect(Object.keys(tools).sort()).toEqual(Object.keys(MEMOFLOW_PRODUCT_TOOL_POLICY).sort());
    for (const [name, rule] of Object.entries(MEMOFLOW_PRODUCT_TOOL_POLICY)) {
      expect(tools[name as keyof typeof tools].requireApproval).toBe(rule.requireApproval);
    }
    expect(() => assertMemoFlowToolClassification({ unknown: { id: 'unknown' } })).toThrow(
      'Unclassified',
    );
    expect(() => assertMemoFlowToolClassification({ constructor: { id: 'constructor' } })).toThrow(
      'Unclassified',
    );
  });

  it('fails closed for unknown and prototype names independent of native policy', async () => {
    const session = {
      state: { set: vi.fn(async () => {}) },
      resolveToolApproval: (_name: string): 'allow' | 'ask' | 'deny' => 'allow',
    };
    await applyMemoFlowSessionToolPolicy(session);
    for (const name of ['unknown', '__proto__', 'constructor', 'toString']) {
      expect(session.resolveToolApproval(name)).toBe('deny');
    }
  });

  it('enforces read-only permission in both approval policy and the actual write entrypoint', async () => {
    const session = {
      state: { set: vi.fn(async () => {}) },
      resolveToolApproval: (_name: string): 'allow' | 'ask' | 'deny' => 'allow',
    };
    await applyMemoFlowSessionToolPolicy(session, 'read-only');
    for (const [name, policy] of Object.entries(MEMOFLOW_PRODUCT_TOOL_POLICY))
      expect(session.resolveToolApproval(name)).toBe(policy.category === 'read' ? 'allow' : 'deny');
    expect(session.resolveToolApproval('unclassified')).toBe('deny');
    const executeAction = vi.fn();
    const tools = createMemoFlowProductTools({ notificationReadPort: { executeAction } as never });
    const requestContext = context();
    requestContext.setRaw('permissionMode', 'read-only');
    await expect(
      tools.notification_execute_action.execute?.(
        { notificationId: 'n', actionKey: 'archive' },
        { requestContext, observe: {} as never },
      ),
    ).rejects.toThrow('Read-only');
    expect(executeAction).not.toHaveBeenCalled();
    await applyMemoFlowSessionToolPolicy(session, 'supervised');
    expect(session.resolveToolApproval('notification_execute_action')).toBe('ask');
    await expect(applyMemoFlowSessionToolPolicy(session, 'auto-approve' as never)).rejects.toThrow(
      'Unsupported',
    );
  });

  it('exposes a strict canonical Routine trigger union', () => {
    expect(
      RoutineTriggerSchema.safeParse({
        type: 'WallClock',
        timingOwner: 'scheduler',
        localTime: '09:30',
        timeZone: 'UTC',
        recurrence: { startDate: '2026-09-18', frequency: 'daily' },
      }).success,
    ).toBe(true);
    expect(RoutineTriggerSchema.safeParse(elapsedTrigger).success).toBe(true);
    expect(
      RoutineTriggerSchema.safeParse({
        type: 'ActiveUsage',
        timingOwner: 'local-runtime',
        requiredActiveMs: 45 * 60_000,
        anchor: 'last-satisfied',
        naturalBreakCredit: null,
        protocolBreakCredit: null,
      }).success,
    ).toBe(true);
    expect(
      RoutineTriggerSchema.safeParse({
        type: 'Elapsed',
        timingOwner: 'local-runtime',
        durationMs: 1,
        legacyField: true,
      }).success,
    ).toBe(false);
    expect(RoutineTriggerSchema.safeParse({ type: 'Interval', intervalMinutes: 50 }).success).toBe(
      false,
    );
  });

  it('publishes structured schemas for knowledge, workspace, Planner and Notification tools', () => {
    const tools = createMemoFlowProductTools({});
    expect(tools.knowledge_search.inputSchema.safeParse({ query: 'release notes' }).success).toBe(
      true,
    );
    expect(tools.knowledge_search.inputSchema.safeParse({ query: '', limit: 9 }).success).toBe(
      false,
    );
    expect(
      tools.workspace_overview.inputSchema.safeParse({ question: 'What should I focus on?' })
        .success,
    ).toBe(true);
    expect(tools.workspace_overview.inputSchema.safeParse({ question: '' }).success).toBe(false);
    expect(
      tools.planner_today_summary.inputSchema.safeParse({
        range: { start: 1_000, end: 2_000 },
      }).success,
    ).toBe(true);
    expect(
      tools.planner_today_summary.inputSchema.safeParse({
        startTime: 1_000,
        endTime: 2_000,
      }).success,
    ).toBe(false);
    expect(tools.notification_unread_summary.inputSchema.safeParse({ limit: 5 }).success).toBe(
      true,
    );
    expect(
      tools.notification_execute_action.inputSchema.safeParse({
        notificationId: 'notification-1',
        actionKey: 'archive',
      }).success,
    ).toBe(true);
  });

  it('searches owner knowledge with bounded excerpts instead of exposing unbounded note bodies', async () => {
    const listRelevantNotes = vi.fn(async () => [
      {
        identityId: 'identity-1',
        repositoryId: 'repo-1',
        knowledgeSpaceId: 'space-1',
        knowledgeDocumentId: 'kdoc-1',
        sourcePath: 'notes/release.md',
        sourceContentHash: 'hash-1',
        title: 'Release note',
        mimeType: 'text/markdown',
        content: 'x'.repeat(4_100),
      },
    ]);
    const tools = createMemoFlowProductTools({
      knowledgeSourcePort: { listRelevantNotes } as never,
    });

    const result = await tools.knowledge_search.execute?.(
      { query: 'release', limit: 3 },
      { requestContext: context(), observe: {} as never },
    );

    expect(listRelevantNotes).toHaveBeenCalledWith('identity-1', 'release', 3);
    expect(result).toMatchObject({
      query: 'release',
      notes: [
        {
          knowledgeDocumentId: 'kdoc-1',
          title: 'Release note',
          sourcePath: 'notes/release.md',
          contentHash: 'hash-1',
          truncated: true,
        },
      ],
    });
    expect(result?.notes[0]?.excerpt).toHaveLength(4_000);
  });

  it('delegates Routine commands with canonical owner input and ExecutionContext', async () => {
    const createRoutine = vi.fn(
      async () => ({ kind: 'routine', id: 'r-1', status: 'created' }) as const,
    );
    const tools = createMemoFlowProductTools({
      routineCommandPort: { createRoutine } as never,
    });
    await tools.routine_create.execute?.(
      { name: 'Move', trigger: elapsedTrigger },
      { requestContext: context(), observe: {} as never },
    );
    expect(createRoutine).toHaveBeenCalledWith({
      name: 'Move',
      trigger: elapsedTrigger,
      context: expect.objectContaining({ identityId: 'identity-1', requestId: 'request-1' }),
    });
  });

  it('keeps workspace and Planner reads projection-only and Notification actions owner-routed', async () => {
    const buildContext = vi.fn(async (_identityId: string, question: string) => ({
      timeContext: {} as never,
      goals: [],
      goalSearchResults: [],
      ownerReads: {
        goal: { progress: { activeCount: 0, goals: [] } },
        task: { board: { todo: 0, inProgress: 0, done: 0, overdue: 0 } },
        schedule: { upcoming: [], conflictCount: 0 },
        notification: { unreadCount: 0 },
        activity: { recent: [] },
      },
      extra: { question },
    }));
    const getWindowSummary = vi.fn(async (input) => ({
      range: input.range,
      projections: [],
      conflicts: [],
    }));
    const getUnreadSummary = vi.fn(async () => ({ unreadCount: 0, items: [] }));
    const executeAction = vi.fn(async (input) => ({
      id: 'interaction-1',
      notificationId: input.notificationId,
      actionKey: input.actionKey,
      actionKind: 'archive' as const,
      outcome: 'accepted' as const,
      commandReceiptId: null,
    }));
    const tools = createMemoFlowProductTools({
      analyticsReadPort: { buildContext } as never,
      plannerReadPort: { getWindowSummary } as never,
      notificationReadPort: { getUnreadSummary, executeAction } as never,
    });
    await tools.workspace_overview.execute?.(
      { question: 'What should I focus on?' },
      { requestContext: context(), observe: {} as never },
    );
    await tools.planner_today_summary.execute?.(
      { range: { start: 1_000, end: 2_000 } },
      { requestContext: context(), observe: {} as never },
    );
    await tools.notification_unread_summary.execute?.(
      { limit: 5 },
      { requestContext: context(), observe: {} as never },
    );
    await tools.notification_execute_action.execute?.(
      { notificationId: 'notification-1', actionKey: 'archive' },
      { requestContext: context(), observe: {} as never },
    );
    expect(buildContext).toHaveBeenCalledWith('identity-1', 'What should I focus on?');
    expect(getWindowSummary).toHaveBeenCalledWith({
      identityId: 'identity-1',
      range: { start: 1_000, end: 2_000 },
    });
    expect(getUnreadSummary).toHaveBeenCalledWith({ identityId: 'identity-1', limit: 5 });
    expect(executeAction).toHaveBeenCalledWith({
      notificationId: 'notification-1',
      actionKey: 'archive',
      context: expect.objectContaining({ identityId: 'identity-1' }),
    });
    expect(
      Object.keys(tools).some((key) =>
        /schedule.*(pause|resume|complete|cancel|delete)/i.test(key),
      ),
    ).toBe(false);
  });
});
