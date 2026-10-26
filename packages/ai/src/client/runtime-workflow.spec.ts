import { describe, expect, it, vi } from 'vitest';
import { AIChannels, AIStreamChannels } from '@memoflow/contracts/electron';
import { EventEmitter } from 'node:events';
import type { ElectronBridge } from '@memoflow/ipc-client';
import { ok } from '@memoflow/transport-contracts/result';
import type { IResultHttpClient } from '@memoflow/http-client';
import { WorkflowRuntimeHttpClient, WorkflowRuntimeIpcClient } from './runtime-workflow';

function httpStub(overrides: Partial<IResultHttpClient> = {}): IResultHttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    stream: vi.fn(),
    ...overrides,
  };
}

const run = {
  runId: 'workflow-1',
  kind: 'goal.create' as const,
  conversationId: 'conversation-1',
  status: 'suspended' as const,
  suspension: {
    type: 'clarification_required' as const,
    questions: ['What is the target date?'],
  },
  createdAt: 1,
  updatedAt: 2,
};

const startRequest = {
  kind: 'goal.create' as const,
  conversationId: 'conversation-1',
  input: { idea: 'Run a 5K' },
};

const resumeRequest = {
  runId: 'workflow-1',
  command: { type: 'answer' as const, answers: ['In 8 weeks'] },
};

describe('WorkflowRuntimeHttpClient', () => {
  it('reads authenticated Workspace events with a recovery cursor and validates every frame', async () => {
    const event = {
      type: 'workflow.updated',
      eventId: 'workflow-1:1',
      cursor: 'next',
      resourceVersion: 1,
      data: { ...run, resourceVersion: 1 },
      actions: [],
      baseActionSequence: 0,
      lastActionSequence: 0,
    };
    const stream = vi.fn(
      async () => new Response(`event: workspace\ndata: ${JSON.stringify(event)}\n\n`),
    );
    const received = vi.fn();
    const client = new WorkflowRuntimeHttpClient(httpStub({ stream }));
    await client.streamWorkspaceEvents!({
      cursor: 'previous',
      onEvent: received,
      signal: new AbortController().signal,
    });
    expect(received).toHaveBeenCalledWith(event);
    expect(stream).toHaveBeenCalledWith(
      '/ai/runtime/workspace/sse',
      expect.objectContaining({ method: 'GET', headers: { 'Last-Event-ID': 'previous' } }),
    );
    stream.mockResolvedValueOnce(
      new Response('event: workspace\ndata: {"type":"workflow.updated","secret":"private"}\n\n'),
    );
    await expect(
      client.streamWorkspaceEvents!({ onEvent: received, signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'AI_RUNTIME_PROTOCOL_ERROR' });
    expect(received).toHaveBeenCalledTimes(1);
  });
  it('uses the canonical workflow request paths and validates returned run views', async () => {
    const post = vi.fn(async (url: string) => {
      if (url.endsWith('/list')) return ok([run]);
      if (url.endsWith('/get') || url.endsWith('/cancel')) return ok(run);
      return ok(run);
    });
    const client = new WorkflowRuntimeHttpClient(httpStub({ post }));

    await expect(client.start(startRequest)).resolves.toEqual(run);
    await expect(client.resume(resumeRequest)).resolves.toEqual(run);
    await expect(client.get({ runId: 'workflow-1' })).resolves.toEqual(run);
    await expect(client.list({ conversationId: 'conversation-1' })).resolves.toEqual([run]);
    await expect(client.cancel({ runId: 'workflow-1' })).resolves.toEqual(run);

    expect(post.mock.calls.map(([url]) => url)).toEqual([
      '/ai/runtime/workflow/start',
      '/ai/runtime/workflow/resume',
      '/ai/runtime/workflow/get',
      '/ai/runtime/workflow/list',
      '/ai/runtime/workflow/cancel',
    ]);
    expect(JSON.stringify(post.mock.calls)).not.toContain('identityId');
  });

  it('returns a detached HTTP start pointer immediately without hidden polling', async () => {
    const running = { ...run, status: 'running' as const, suspension: undefined };
    const post = vi.fn().mockResolvedValue(ok(running));
    const client = new WorkflowRuntimeHttpClient(httpStub({ post }), {
      intervalMs: 0,
      timeoutMs: 1_000,
    });

    await expect(client.start(startRequest)).resolves.toEqual(running);
    expect(post.mock.calls.map(([url]) => url)).toEqual(['/ai/runtime/workflow/start']);
  });

  it('returns a detached Goal resume without polling for progress', async () => {
    const running = {
      ...run,
      status: 'running' as const,
      suspension: undefined,
      awaitAfterVersion: 2,
    };
    const post = vi.fn().mockResolvedValue(ok(running));
    const client = new WorkflowRuntimeHttpClient(httpStub({ post }));
    await expect(client.resume(resumeRequest)).resolves.toEqual(running);
    expect(post.mock.calls.map(([url]) => url)).toEqual(['/ai/runtime/workflow/resume']);
  });

  it('keeps the existing Task resume wait until Task subscriptions are implemented', async () => {
    const stable = { ...run, kind: 'task.create' as const };
    const running = { ...stable, status: 'running' as const, suspension: undefined };
    const post = vi.fn().mockResolvedValueOnce(ok(running)).mockResolvedValueOnce(ok(stable));
    const client = new WorkflowRuntimeHttpClient(httpStub({ post }), {
      intervalMs: 0,
      timeoutMs: 1000,
    });
    await expect(client.resume(resumeRequest)).resolves.toEqual(stable);
    expect(post.mock.calls.map(([url]) => url)).toEqual([
      '/ai/runtime/workflow/resume',
      '/ai/runtime/workflow/get',
    ]);
  });

  it('rejects identity injection and malformed runtime projections', async () => {
    const client = new WorkflowRuntimeHttpClient(httpStub());
    await expect(
      client.start({ ...startRequest, identityId: 'attacker-controlled' } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const malformed = new WorkflowRuntimeHttpClient(
      httpStub({ post: vi.fn().mockResolvedValue(ok({ runId: 'private-mastra-run' })) }),
    );
    await expect(malformed.start(startRequest)).rejects.toMatchObject({
      code: 'AI_RUNTIME_PROTOCOL_ERROR',
    });
  });
});

describe('WorkflowRuntimeIpcClient', () => {
  it('acknowledges a Workspace event only after projection and removes bridge listeners on abort', async () => {
    const events = new EventEmitter();
    const invoke = vi.fn(async (_channel: string, _request?: unknown) => ok({ accepted: true }));
    const bridge: ElectronBridge = {
      invoke,
      on: (channel, callback) => {
        events.on(channel, callback);
      },
      off: (channel, callback) => {
        events.off(channel, callback);
      },
    };
    const client = new WorkflowRuntimeIpcClient({ invoke, getBridge: () => bridge } as never);
    const controller = new AbortController();
    let project!: () => void;
    const projected = new Promise<void>((resolve) => {
      project = resolve;
    });
    const onEvent = vi.fn(() => projected);
    const stream = client.streamWorkspaceEvents({ signal: controller.signal, onEvent });
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(AIChannels.RUNTIME_WORKSPACE_START, expect.anything()),
    );
    const command = invoke.mock.calls[0]![1] as { streamId: string };
    events.emit(AIStreamChannels.RUNTIME_WORKSPACE_EVENT, {
      streamId: command.streamId,
      event: { type: 'stream.ready', cursor: 'ready' },
    });
    expect(onEvent).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalledWith(AIChannels.RUNTIME_WORKSPACE_ACK, expect.anything());
    project();
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(AIChannels.RUNTIME_WORKSPACE_ACK, {
        streamId: command.streamId,
        cursor: 'ready',
      }),
    );
    controller.abort();
    await stream;
    expect(events.listenerCount(AIStreamChannels.RUNTIME_WORKSPACE_EVENT)).toBe(0);
    expect(invoke).toHaveBeenCalledWith(AIChannels.RUNTIME_WORKSPACE_STOP, {
      streamId: command.streamId,
    });
  });
  it('mirrors HTTP semantics over the canonical workflow IPC channels', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === AIChannels.RUNTIME_WORKFLOW_LIST) return ok([run]);
      return ok(run);
    });
    const client = new WorkflowRuntimeIpcClient({ invoke } as never);

    await expect(client.start(startRequest)).resolves.toEqual(run);
    await expect(client.resume(resumeRequest)).resolves.toEqual(run);
    await expect(client.get({ runId: 'workflow-1' })).resolves.toEqual(run);
    await expect(client.list()).resolves.toEqual([run]);
    await expect(client.cancel({ runId: 'workflow-1' })).resolves.toEqual(run);

    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      AIChannels.RUNTIME_WORKFLOW_START,
      AIChannels.RUNTIME_WORKFLOW_RESUME,
      AIChannels.RUNTIME_WORKFLOW_GET,
      AIChannels.RUNTIME_WORKFLOW_LIST,
      AIChannels.RUNTIME_WORKFLOW_CANCEL,
    ]);
    expect(JSON.stringify(invoke.mock.calls)).not.toContain('identityId');
  });

  it('returns detached Goal IPC start and resume without polling', async () => {
    const running = { ...run, status: 'running' as const, suspension: undefined };
    const invoke = vi.fn(async (channel: string) => {
      if (channel === AIChannels.RUNTIME_WORKFLOW_START) return ok(running);
      if (channel === AIChannels.RUNTIME_WORKFLOW_RESUME) return ok(running);
      if (channel === AIChannels.RUNTIME_WORKFLOW_GET) return ok(run);
      return ok(run);
    });
    const client = new WorkflowRuntimeIpcClient({ invoke } as never, {
      intervalMs: 0,
      timeoutMs: 1_000,
    });

    await expect(client.start(startRequest)).resolves.toEqual(running);
    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      AIChannels.RUNTIME_WORKFLOW_START,
    ]);
    await expect(client.resume(resumeRequest)).resolves.toEqual(running);
    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      AIChannels.RUNTIME_WORKFLOW_START,
      AIChannels.RUNTIME_WORKFLOW_RESUME,
    ]);
  });
});

describe('unsupported workflow snapshot transport parity', () => {
  it.each(['goal.create', 'task.create', 'knowledge.capture'] as const)(
    'preserves failed %s snapshots over HTTP and IPC without polling',
    async (kind) => {
      const failed = {
        runId: 'r',
        conversationId: 'c',
        kind,
        status: 'failed',
        createdAt: 1,
        updatedAt: 2,
        failure: {
          code: 'AI_WORKFLOW_STATUS_UNSUPPORTED',
          message: 'AI workflow state is unsupported',
        },
      };
      const post = vi.fn().mockResolvedValue(ok(failed));
      const invoke = vi.fn().mockResolvedValue(ok(failed));
      const http = new WorkflowRuntimeHttpClient(httpStub({ post }));
      const ipc = new WorkflowRuntimeIpcClient({ invoke } as never);
      for (const client of [http, ipc]) {
        await expect(client.get({ runId: 'r' })).resolves.toEqual(failed);
        await expect(client.resume({ runId: 'r', command: { type: 'retry' } })).resolves.toEqual(
          failed,
        );
      }
      expect(post).toHaveBeenCalledTimes(2);
      expect(invoke).toHaveBeenCalledTimes(2);
    },
  );
});

describe('Goal native surface lease contract over HTTP/IPC', () => {
  const claimed = {
    status: 'claimed' as const,
    token: '11111111-1111-4111-8111-111111111111',
    fence: 3,
    expiresAt: 30_000,
  };

  it('binds claim, renewal and release to the same validated transport contract', async () => {
    const post = vi.fn().mockResolvedValue(ok(claimed));
    const invoke = vi.fn().mockResolvedValue(ok(claimed));
    for (const client of [
      new WorkflowRuntimeHttpClient(httpStub({ post })),
      new WorkflowRuntimeIpcClient({ invoke } as never),
    ]) {
      await expect(
        client.goalSurfaceLease({ action: 'claim', runId: 'goal-run-1' }),
      ).resolves.toEqual(claimed);
      await expect(
        client.goalSurfaceLease({
          action: 'renew',
          runId: 'goal-run-1',
          token: claimed.token,
          fence: claimed.fence,
        }),
      ).resolves.toEqual(claimed);
      await expect(
        client.goalSurfaceLease({
          action: 'release',
          runId: 'goal-run-1',
          token: claimed.token,
          fence: claimed.fence,
        }),
      ).resolves.toEqual(claimed);
    }
    expect(post).toHaveBeenCalledWith(
      '/ai/runtime/workflow/goal-surface-lease',
      expect.any(Object),
    );
    expect(invoke).toHaveBeenCalledWith(
      AIChannels.RUNTIME_WORKFLOW_GOAL_SURFACE_LEASE,
      expect.any(Object),
    );
    expect(JSON.stringify([...post.mock.calls, ...invoke.mock.calls])).not.toContain('identityId');
  });

  it('rejects client-supplied owner identity and missing token/fence before any request', async () => {
    const post = vi.fn();
    const invoke = vi.fn();
    for (const client of [
      new WorkflowRuntimeHttpClient(httpStub({ post })),
      new WorkflowRuntimeIpcClient({ invoke } as never),
    ]) {
      await expect(
        client.goalSurfaceLease({
          action: 'claim',
          runId: 'goal-run-1',
          identityId: 'foreign',
        } as never),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(
        client.goalSurfaceLease({
          action: 'renew',
          runId: 'goal-run-1',
          token: claimed.token,
        } as never),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(post).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects malformed provider responses instead of silently granting control', async () => {
    const post = vi.fn().mockResolvedValue(ok({ status: 'claimed', fence: 4 }));
    const client = new WorkflowRuntimeHttpClient(httpStub({ post }));
    await expect(
      client.goalSurfaceLease({ action: 'claim', runId: 'goal-run-1' }),
    ).rejects.toThrow();
  });
});
