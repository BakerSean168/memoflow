import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { RequestContext } from '@mastra/core/request-context';
import { createMemoFlowProductTools } from './product-tools';

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

describe('MemoFlow AI product tools (AI-6102/6103)', () => {
  it('requires approval for persistent Routine configuration/session creation commands', () => {
    const tools = createMemoFlowProductTools({});
    for (const name of [
      'routine_create',
      'routine_set_profile_active',
      'routine_set_temporary_override',
      'routine_clear_temporary_override',
      'routine_start_protocol',
    ] as const) {
      expect(tools[name].requireApproval).toBe(true);
    }
    expect(tools.routine_pause_protocol.requireApproval).not.toBe(true);
    expect(tools.routine_resume_protocol.requireApproval).not.toBe(true);
    expect(tools.routine_end_protocol.requireApproval).not.toBe(true);
  });

  it('delegates Routine commands with the canonical host ExecutionContext', async () => {
    const createRoutine = vi.fn(async () => ({ kind: 'routine', id: 'r-1', status: 'created' } as const));
    const tools = createMemoFlowProductTools({
      routineCommandPort: { createRoutine } as never,
    });
    await tools.routine_create.execute?.(
      { title: 'Move', trigger: { type: 'Interval', intervalMinutes: 50 } },
      { requestContext: context(), observe: {} as never },
    );
    expect(createRoutine).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Move',
      context: expect.objectContaining({ identityId: 'identity-1', requestId: 'request-1' }),
    }));
  });

  it('keeps Planner and Notification tools read-only and identity scoped', async () => {
    const getWindowSummary = vi.fn(async (input) => ({ ...input, calendar: [], tasks: [] }));
    const getUnreadSummary = vi.fn(async () => ({ unreadCount: 0, items: [] }));
    const tools = createMemoFlowProductTools({
      plannerReadPort: { getWindowSummary } as never,
      notificationReadPort: { getUnreadSummary } as never,
    });
    await tools.planner_today_summary.execute?.(
      { startTime: 1_000, endTime: 2_000 },
      { requestContext: context(), observe: {} as never },
    );
    await tools.notification_unread_summary.execute?.(
      { limit: 5 },
      { requestContext: context(), observe: {} as never },
    );
    expect(getWindowSummary).toHaveBeenCalledWith({ identityId: 'identity-1', startTime: 1_000, endTime: 2_000 });
    expect(getUnreadSummary).toHaveBeenCalledWith({ identityId: 'identity-1', limit: 5 });
    expect(Object.keys(tools).some((key) => /schedule.*(pause|resume|complete|cancel|delete)/i.test(key))).toBe(false);
  });
});
