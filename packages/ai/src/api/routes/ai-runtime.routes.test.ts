import { EventEmitter } from 'node:events';
import { Router, type Request, type Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AssistantRuntimeEvent } from '@memoflow/contracts/ai';
import type { AIWorkflowRuntimePort, MastraAIRuntime } from '../../server/mastra/runtime';
import { AIExecutionError } from '../../shared/ai-execution-error';
import { registerAIRuntimeRoutes } from './ai-runtime.routes';

type LayerWithRoute = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response) => unknown }>;
  };
};

function getRouteHandler(router: Router, method: string, path: string) {
  const layer = (router as unknown as { stack: LayerWithRoute[] }).stack.find(
    (candidate) =>
      candidate.route?.path === path && candidate.route.methods[method.toLowerCase()] === true,
  );
  expect(layer?.route).toBeDefined();
  return layer!.route!.stack.at(-1)!.handle;
}

function request(body: unknown, identityId = 'identity-1') {
  return Object.assign(new EventEmitter(), {
    body,
    user: identityId ? { identityId } : undefined,
    requestContext: {
      requestId: 'request-runtime-1',
      traceId: 'trace-runtime-1',
      startedAt: 1_700_000_000_000,
      source: 'http',
    },
  });
}

function response() {
  const writes: string[] = [];
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    writableEnded: false,
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn((chunk: string) => {
      writes.push(chunk);
      return true;
    }),
    end: vi.fn(function (this: { writableEnded: boolean }) {
      this.writableEnded = true;
    }),
    status: vi.fn(function (this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(),
  });
  return { res, writes };
}

function runtimeStub(events: AssistantRuntimeEvent[] = []) {
  const dispatchMessage = vi.fn(async function* () {
    for (const event of events) yield event;
  });
  const cancelRun = vi.fn(() => true);
  const deleteConversation = vi.fn(async () => true);
  const summarizeUsage = vi.fn(async () => ({
    executionCount: 2,
    promptTokens: 120,
    completionTokens: 30,
    totalTokens: 150,
    estimatedCost: 0.000045,
  }));
  const listMessages = vi.fn(async () => ({
    conversationId: 'conversation-1',
    messages: [
      {
        id: 'mastra-message-1',
        conversationId: 'conversation-1',
        role: 'assistant' as const,
        content: 'persisted reply',
        createdAt: 10,
      },
    ],
  }));
  return {
    dispatchMessage,
    cancelRun,
    deleteConversation,
    listMessages,
    summarizeUsage,
    runtime: {
      dispatchMessage,
      cancelRun,
      deleteConversation,
      listMessages,
      summarizeUsage,
    } as unknown as MastraAIRuntime,
  };
}

const workflowRun = {
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

function workflowRuntimeStub() {
  const start = vi.fn(async () => workflowRun);
  const resume = vi.fn(async () => workflowRun);
  const get = vi.fn(async () => workflowRun);
  const list = vi.fn(async () => [workflowRun]);
  const cancel = vi.fn(async () => workflowRun);
  return {
    start,
    resume,
    get,
    list,
    cancel,
    runtime: { start, resume, get, list, cancel } satisfies AIWorkflowRuntimePort,
  };
}

const auth = ((_: unknown, __: unknown, next: () => void) => next()) as never;

const messageCommand = {
  type: 'message' as const,
  conversationId: 'conversation-1',
  content: 'hello',
  surface: 'web' as const,
};

describe('registerAIRuntimeRoutes', () => {
  it('streams only canonical vNext events and injects authenticated identity into Mastra runtime', async () => {
    const started: AssistantRuntimeEvent = {
      eventId: 'run-1:1',
      runId: 'run-1',
      conversationId: 'conversation-1',
      sequence: 1,
      createdAt: 1,
      type: 'assistant.run.started',
      data: {},
    };
    const completed: AssistantRuntimeEvent = {
      eventId: 'run-1:2',
      runId: 'run-1',
      conversationId: 'conversation-1',
      sequence: 2,
      createdAt: 2,
      type: 'assistant.run.completed',
      data: { content: 'hello back' },
    };
    const stub = runtimeStub([started, completed]);
    const router = registerAIRuntimeRoutes(stub.runtime, { auth });
    const handler = getRouteHandler(router, 'post', '/assistant/sse');
    const req = request(messageCommand);
    const { res, writes } = response();

    await handler(req as never, res as never);

    expect(stub.dispatchMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-1',
        conversationId: 'conversation-1',
        content: 'hello',
      }),
    );
    expect(writes).toEqual([
      `event: runtime\ndata: ${JSON.stringify(started)}\n\n`,
      `event: runtime\ndata: ${JSON.stringify(completed)}\n\n`,
    ]);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it('preserves stable capability failure codes and redacts provider diagnostics in SSE', async () => {
    const dispatchMessage = vi.fn(async function* () {
      throw new AIExecutionError(
        'capability_unsupported',
        'provider=https://secret.example; apiKey=server-secret',
      );
    });
    const runtime = {
      dispatchMessage,
      cancelRun: vi.fn(() => false),
      listMessages: vi.fn(),
      deleteConversation: vi.fn(),
      summarizeUsage: vi.fn(),
    } as unknown as MastraAIRuntime;
    const router = registerAIRuntimeRoutes(runtime, { auth });
    const handler = getRouteHandler(router, 'post', '/assistant/sse');
    const { res, writes } = response();

    await handler(request(messageCommand) as never, res as never);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('AI_CAPABILITY_UNSUPPORTED');
    expect(writes[0]).toContain(
      'The selected AI model does not support the required capability',
    );
    expect(writes[0]).not.toContain('secret.example');
    expect(writes[0]).not.toContain('server-secret');
  });

  it('rejects client identity injection before runtime dispatch', async () => {
    const stub = runtimeStub();
    const router = registerAIRuntimeRoutes(stub.runtime, { auth });
    const handler = getRouteHandler(router, 'post', '/assistant/sse');
    const req = request({ ...messageCommand, identityId: 'attacker' });
    const { res } = response();

    await handler(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(stub.dispatchMessage).not.toHaveBeenCalled();
  });

  it('reads authoritative Mastra history through authenticated identity and rejects identity injection', async () => {
    const stub = runtimeStub();
    const router = registerAIRuntimeRoutes(stub.runtime, { auth });
    const handler = getRouteHandler(router, 'post', '/assistant/history');
    const { res } = response();

    await handler(request({ conversationId: 'conversation-1' }) as never, res as never);

    expect(stub.listMessages).toHaveBeenCalledWith({
      identityId: 'identity-1',
      conversationId: 'conversation-1',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ conversationId: 'conversation-1' }),
      }),
    );

    const { res: injectedRes } = response();
    await handler(
      request({ conversationId: 'conversation-1', identityId: 'attacker-controlled' }) as never,
      injectedRes as never,
    );
    expect(injectedRes.status).toHaveBeenCalledWith(400);
    expect(stub.listMessages).toHaveBeenCalledTimes(1);
  });

  it('deletes authoritative Mastra history through authenticated identity and rejects identity injection', async () => {
    const stub = runtimeStub();
    const router = registerAIRuntimeRoutes(stub.runtime, { auth });
    const handler = getRouteHandler(router, 'post', '/assistant/delete');
    const { res } = response();

    await handler(request({ conversationId: 'conversation-1' }) as never, res as never);

    expect(stub.deleteConversation).toHaveBeenCalledWith({
      identityId: 'identity-1',
      conversationId: 'conversation-1',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, data: { deleted: true } }),
    );

    const { res: injectedRes } = response();
    await handler(
      request({ conversationId: 'conversation-1', identityId: 'attacker-controlled' }) as never,
      injectedRes as never,
    );
    expect(injectedRes.status).toHaveBeenCalledWith(400);
    expect(stub.deleteConversation).toHaveBeenCalledTimes(1);
  });

  it('cancels by runId only through the authenticated identity', async () => {
    const stub = runtimeStub();
    const router = registerAIRuntimeRoutes(stub.runtime, { auth });
    const handler = getRouteHandler(router, 'post', '/assistant/cancel');
    const req = request({ type: 'cancel_run', runId: 'run-1' });
    const { res } = response();

    await handler(req as never, res as never);

    expect(stub.cancelRun).toHaveBeenCalledWith({ identityId: 'identity-1', runId: 'run-1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('fails closed when the host did not compose a Mastra runtime', async () => {
    const router = registerAIRuntimeRoutes(null, { auth });
    const handler = getRouteHandler(router, 'post', '/assistant/sse');
    const req = request(messageCommand);
    const { res } = response();

    await handler(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.setHeader).not.toHaveBeenCalledWith('Content-Type', 'text/event-stream');
  });

  it('queries durable usage with host-owned identity and rejects client identity injection', async () => {
    const stub = runtimeStub();
    const router = registerAIRuntimeRoutes(stub.runtime, { auth });
    const handler = getRouteHandler(router, 'post', '/usage');
    const { res } = response();

    await handler(request({ conversationId: 'conversation-1' }) as never, res as never);

    expect(stub.summarizeUsage).toHaveBeenCalledWith({
      identityId: 'identity-1',
      conversationId: 'conversation-1',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ executionCount: 2, totalTokens: 150 }),
      }),
    );

    const { res: runRes } = response();
    await handler(request({ runId: 'run-1' }) as never, runRes as never);
    expect(stub.summarizeUsage).toHaveBeenLastCalledWith({
      identityId: 'identity-1',
      runId: 'run-1',
    });

    const { res: injectedRes } = response();
    await handler(
      request({ conversationId: 'conversation-1', identityId: 'attacker-controlled' }) as never,
      injectedRes as never,
    );
    expect(injectedRes.status).toHaveBeenCalledWith(400);
    expect(stub.summarizeUsage).toHaveBeenCalledTimes(2);
  });

  it('exposes the canonical workflow start/resume/get/list/cancel surface with host-owned identity', async () => {
    const assistant = runtimeStub();
    const workflow = workflowRuntimeStub();
    const router = registerAIRuntimeRoutes(assistant.runtime, { auth }, workflow.runtime);

    const cases = [
      {
        path: '/workflow/start',
        body: {
          kind: 'goal.create',
          conversationId: 'conversation-1',
          input: { idea: 'Run a 5K' },
        },
        spy: workflow.start,
        expected: {
          context: {
            identityId: 'identity-1',
            requestId: 'request-runtime-1',
            traceId: 'trace-runtime-1',
            startedAt: 1_700_000_000_000,
            source: 'http',
            deviceId: 'unknown',
            device: {
              deviceName: null,
              os: null,
              browser: null,
              ipAddress: null,
              userAgent: null,
              deviceType: 'Browser',
              deviceFingerprint: undefined,
            },
          },
          request: {
            kind: 'goal.create',
            conversationId: 'conversation-1',
            input: { idea: 'Run a 5K' },
          },
        },
      },
      {
        path: '/workflow/resume',
        body: { runId: 'workflow-1', command: { type: 'approve' } },
        spy: workflow.resume,
        expected: {
          context: {
            identityId: 'identity-1',
            requestId: 'request-runtime-1',
            traceId: 'trace-runtime-1',
            startedAt: 1_700_000_000_000,
            source: 'http',
            deviceId: 'unknown',
            device: {
              deviceName: null,
              os: null,
              browser: null,
              ipAddress: null,
              userAgent: null,
              deviceType: 'Browser',
              deviceFingerprint: undefined,
            },
          },
          request: { runId: 'workflow-1', command: { type: 'approve' } },
        },
      },
      {
        path: '/workflow/get',
        body: { runId: 'workflow-1' },
        spy: workflow.get,
        expected: { identityId: 'identity-1', runId: 'workflow-1' },
      },
      {
        path: '/workflow/list',
        body: { conversationId: 'conversation-1' },
        spy: workflow.list,
        expected: { identityId: 'identity-1', conversationId: 'conversation-1' },
      },
      {
        path: '/workflow/cancel',
        body: { runId: 'workflow-1' },
        spy: workflow.cancel,
        expected: { identityId: 'identity-1', runId: 'workflow-1' },
      },
    ] as const;

    for (const item of cases) {
      const handler = getRouteHandler(router, 'post', item.path);
      const { res } = response();
      await handler(request(item.body) as never, res as never);
      expect(item.spy).toHaveBeenCalledWith(item.expected);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    }
  });

  it('rejects workflow identity injection and fails closed when no workflow runtime is composed', async () => {
    const assistant = runtimeStub();
    const workflow = workflowRuntimeStub();
    const router = registerAIRuntimeRoutes(assistant.runtime, { auth }, workflow.runtime);
    const start = getRouteHandler(router, 'post', '/workflow/start');
    const { res: injectedRes } = response();

    await start(
      request({
        kind: 'goal.create',
        conversationId: 'conversation-1',
        input: {},
        identityId: 'attacker-controlled',
      }) as never,
      injectedRes as never,
    );

    expect(injectedRes.status).toHaveBeenCalledWith(400);
    expect(workflow.start).not.toHaveBeenCalled();

    const unavailableRouter = registerAIRuntimeRoutes(assistant.runtime, { auth }, null);
    const unavailableStart = getRouteHandler(unavailableRouter, 'post', '/workflow/start');
    const { res: unavailableRes } = response();
    await unavailableStart(
      request({ kind: 'goal.create', conversationId: 'c1', input: {} }) as never,
      unavailableRes as never,
    );
    expect(unavailableRes.status).toHaveBeenCalledWith(503);
  });

  it('maps provider runtime failures to the same stable public code as Desktop IPC', async () => {
    const assistant = runtimeStub();
    const workflow = workflowRuntimeStub();
    workflow.start.mockRejectedValueOnce(
      new AIExecutionError('provider_unavailable', 'vault=server-secret'),
    );
    const router = registerAIRuntimeRoutes(assistant.runtime, { auth }, workflow.runtime);
    const handler = getRouteHandler(router, 'post', '/workflow/start');
    const { res } = response();

    await handler(
      request({
        kind: 'goal.create',
        conversationId: 'conversation-1',
        input: { idea: 'Run a 5K' },
      }) as never,
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'AI service is unavailable',
        },
      }),
    );
    expect(JSON.stringify(res.json.mock.calls[0]?.[0])).not.toContain('server-secret');
  });

  it('aborts the Mastra dispatch when the HTTP connection closes', async () => {
    let capturedSignal: AbortSignal | undefined;
    const dispatchMessage = vi.fn(async function* (input: { signal?: AbortSignal }) {
      capturedSignal = input.signal;
      await new Promise<void>((resolve) => {
        if (input.signal?.aborted) resolve();
        else input.signal?.addEventListener('abort', () => resolve(), { once: true });
      });
    });
    const runtime = {
      dispatchMessage,
      cancelRun: vi.fn(() => false),
      listMessages: vi.fn(),
      deleteConversation: vi.fn(),
    } as unknown as MastraAIRuntime;
    const router = registerAIRuntimeRoutes(runtime, { auth });
    const handler = getRouteHandler(router, 'post', '/assistant/sse');
    const req = request(messageCommand);
    const { res, writes } = response();

    const pending = handler(req as never, res as never);
    await vi.waitFor(() => expect(capturedSignal).toBeDefined());
    res.emit('close');
    await pending;

    expect(capturedSignal?.aborted).toBe(true);
    expect(writes).toEqual([]);
  });
});
