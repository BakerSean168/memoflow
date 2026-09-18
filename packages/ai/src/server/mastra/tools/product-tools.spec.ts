import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { RequestContext } from '@mastra/core/request-context';
import { createMemoFlowProductTools, RoutineTriggerSchema } from './product-tools';

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

  it('publishes structured schemas for canonical Planner and Notification tools', () => {
    const tools = createMemoFlowProductTools({});
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

  it('keeps Planner reads projection-only and Notification actions owner-routed', async () => {
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
      plannerReadPort: { getWindowSummary } as never,
      notificationReadPort: { getUnreadSummary, executeAction } as never,
    });
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
