import { describe, expect, it, vi } from 'vitest';
import type { AgentControllerEvent } from '@mastra/core/agent-controller';
import { MastraAIRuntime } from './mastra-ai.runtime';
import { AssistantHistoryService } from './assistant-history.service';
import type { MastraDBMessage } from '@mastra/core/agent';

function harness() {
  const messages = new Map<string, MastraDBMessage>();
  const memory = {
    getThreadById: async () => ({ id: 'c', resourceId: 'u' }),
    createThread: vi.fn(),
    deleteThread: vi.fn(),
    settled: vi.fn(async () => {}),
    recall: async () => ({ messages: [...messages.values()] }),
    saveMessages: async (input: { messages: MastraDBMessage[] }) => {
      for (const message of input.messages) messages.set(message.id, message);
    },
  };
  const history = new AssistantHistoryService(memory, { loadShell: async () => ({ title: 'c' }) });
  const listeners = new Set<(event: AgentControllerEvent) => void>();
  const session = {
    run: { bindingGeneration: () => 1 },
    thread: { getId: () => 'c' },
    identity: { getResourceId: () => 'u', getOwnerId: () => 'u' },
    getCurrentRunId: () => 'r',
    abortRun: vi.fn(),
    subscribe: (fn: (event: AgentControllerEvent) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const assistant = {
    listSuspendedRuns: vi.fn(async () => ({
      runs: [
        {
          runId: 'r',
          threadId: 'c',
          resourceId: 'u',
          toolCalls: [{ toolCallId: 'call', toolName: 'routine_create' }],
        },
      ],
    })),
  };
  const runtime: MastraAIRuntime = Object.assign(Object.create(MastraAIRuntime.prototype), {
    history,
    assistant,
    activeRuns: new Map(),
    approvalContinuations: new Map(),
    init: async () => {},
  });
  return {
    runtime,
    assistant,
    history,
    session,
    emit: (event: AgentControllerEvent) => {
      for (const fn of [...listeners]) fn(event);
    },
  };
}

describe('#569 recovered approval boundary', () => {
  it('keeps the successor gate independently recoverable after the first ACK', async () => {
    const { runtime, history, session, emit } = harness();
    const response = runtime['driveApprovalResume'](
      session as never,
      {
        identityId: 'u',
        conversationId: 'c',
        runId: 'r',
        toolCallId: 'call',
        toolName: 'routine_create',
        decision: 'approve',
      },
      () => true,
    );
    emit({
      type: 'tool_end',
      threadId: 'c',
      toolCallId: 'call',
      toolName: 'routine_create',
      result: {},
      isError: false,
    });
    await expect(response).resolves.toBe(true);
    expect(runtime['approvalContinuations'].size).toBe(1);
    vi.mocked(runtime.assistant.listSuspendedRuns).mockResolvedValue({
      runs: [
        {
          runId: 'r',
          threadId: 'c',
          resourceId: 'u',
          status: 'suspended',
          suspendedAt: new Date(),
          toolCalls: [{ toolCallId: 'next', toolName: 'routine_create' }],
        },
      ],
    });
    emit({
      type: 'tool_approval_required',
      threadId: 'c',
      toolCallId: 'next',
      toolName: 'routine_create',
      args: {},
    });
    await vi.waitFor(() => expect(runtime['approvalContinuations'].size).toBe(0));
    expect(await runtime.listAskUserSuspensions({ identityId: 'u', conversationId: 'c' })).toEqual([
      expect.objectContaining({ toolCallId: 'next' }),
    ]);
    expect(
      (await history.listMessages({ identityId: 'u', conversationId: 'c' })).messages.some(
        (item) => item.runOutcome,
      ),
    ).toBe(false);
  });

  it.each(['error', 'aborted'] as const)(
    'records %s before a tool consumed the decision',
    async (reason) => {
      const { runtime, history, session, emit } = harness();
      const response = runtime['driveApprovalResume'](
        session as never,
        {
          identityId: 'u',
          conversationId: 'c',
          runId: 'r',
          toolCallId: 'call',
          toolName: 'routine_create',
          decision: 'approve',
        },
        () => true,
      );
      emit({ type: 'agent_end', threadId: 'c', reason });
      await expect(response).resolves.toBe(false);
      const stored = await history.listMessages({ identityId: 'u', conversationId: 'c' });
      expect(stored.messages[0].runOutcome).toEqual({
        runId: 'r',
        status: reason === 'aborted' ? 'cancelled' : 'failed',
      });
      expect(stored.messages.some((item) => item.approvalReceipt)).toBe(false);
      expect(
        await runtime.listAskUserSuspensions({ identityId: 'u', conversationId: 'c' }),
      ).toEqual([]);
    },
  );

  it('keeps a resumed run cancellable only by its owner and records cancellation', async () => {
    const { runtime, history, session, emit } = harness();
    const response = runtime['driveApprovalResume'](
      session as never,
      {
        identityId: 'u',
        conversationId: 'c',
        runId: 'r',
        toolCallId: 'call',
        toolName: 'routine_create',
        decision: 'approve',
      },
      () => true,
    );
    emit({
      type: 'tool_end',
      threadId: 'c',
      toolCallId: 'call',
      toolName: 'routine_create',
      result: {},
      isError: true,
    });
    await expect(response).resolves.toBe(true);
    expect(runtime.cancelRun({ identityId: 'foreign', runId: 'r' })).toBe(false);
    session.abortRun.mockImplementation(() =>
      emit({ type: 'agent_end', threadId: 'c', reason: 'aborted' }),
    );
    expect(runtime.cancelRun({ identityId: 'u', runId: 'r' })).toBe(true);
    await vi.waitFor(() => expect(runtime['approvalContinuations'].size).toBe(0));
    const stored = await history.listMessages({ identityId: 'u', conversationId: 'c' });
    expect(stored.messages.some((item) => item.runOutcome?.status === 'cancelled')).toBe(true);
    expect(stored.messages.some((item) => item.toolActivities?.[0]?.state === 'failed')).toBe(true);
  });

  it.each(['approve', 'decline'] as const)(
    'returns %s after durable tool receipt without waiting for continuation',
    async (decision) => {
      const { runtime, history, session, emit } = harness();
      let returned = false;
      const response = runtime['driveApprovalResume'](
        session as never,
        {
          identityId: 'u',
          conversationId: 'c',
          runId: 'r',
          toolCallId: 'call',
          toolName: 'routine_create',
          decision,
        },
        () => true,
      ).then((value) => {
        returned = true;
        return value;
      });
      emit({
        type: 'tool_end',
        threadId: 'c',
        toolCallId: 'call',
        toolName: 'routine_create',
        result: {},
        isError: false,
      });
      await vi.waitFor(() => expect(returned).toBe(true));
      await expect(response).resolves.toBe(true);
      // A stale native snapshot must not re-enable the already consumed approval.
      expect(
        await runtime.listAskUserSuspensions({ identityId: 'u', conversationId: 'c' }),
      ).toEqual([]);
      const stored = await history.listMessages({ identityId: 'u', conversationId: 'c' });
      expect(stored.messages[0].approvalReceipt).toMatchObject({ decision, toolCallId: 'call' });
      emit({ type: 'agent_end', threadId: 'c', reason: 'error' });
      await vi.waitFor(() => expect(runtime['approvalContinuations'].size).toBe(0));
      expect(
        (await history.listMessages({ identityId: 'u', conversationId: 'c' })).messages.some(
          (item) => item.runOutcome?.status === 'failed',
        ),
      ).toBe(true);
    },
  );
});
