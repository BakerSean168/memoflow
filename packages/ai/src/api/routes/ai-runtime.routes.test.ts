import { EventEmitter } from 'node:events';
import { Router, type Request, type Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AssistantRuntimeEvent } from '@memoflow/ai-contracts';
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
  const startDetached = vi.fn(async () => ({
    ...workflowRun,
    status: 'running' as const,
    suspension: undefined,
  }));
  const resume = vi.fn(async () => workflowRun);
  const resumeDetached = vi.fn(async () => ({
    ...workflowRun,
    status: 'running' as const,
    suspension: undefined,
  }));
  const get = vi.fn(async () => workflowRun);
  const list = vi.fn(async () => [workflowRun]);
  const cancel = vi.fn(async () => workflowRun);
  return {
    start,
    startDetached,
    resume,
    resumeDetached,
    get,
    list,
    cancel,
    runtime: {
      start,
      startDetached,
      resume,
      resumeDetached,
      get,
      list,
      cancel,
    } satisfies AIWorkflowRuntimePort,
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
  it('requires authentication and a real durable source before opening Workspace SSE', async () => {
    const stub = runtimeStub();
    const workflow = workflowRuntimeStub();
    const router = registerAIRuntimeRoutes(stub.runtime, { auth }, workflow.runtime);
    const handler = getRouteHandler(router, 'get', '/workspace/sse');
    const unauthenticated = response();
    await handler(
      request({}, '') as unknown as Request,
      unauthenticated.res as unknown as Response,
    );
    expect(unauthenticated.res.statusCode).toBe(401);
    const unavailable = response();
    await handler(
      Object.assign(request({}), { header: () => undefined, query: {} }) as unknown as Request,
      unavailable.res as unknown as Response,
    );
    expect(unavailable.res.statusCode).toBe(503);
    expect(unavailable.res.flushHeaders).not.toHaveBeenCalled();
  });
  it.each([
    [
      '/assistant/sse',
      { type: 'message', conversationId: 'local-1', content: 'Hello', surface: 'desktop' },
    ],
    ['/assistant/history', { conversationId: 'local-1' }],
    ['/assistant/delete', { conversationId: 'local-1' }],
    ['/assistant/cancel', { type: 'cancel_run', runId: 'local-run' }],
  ])('rejects Desktop local runtime references over HTTP at %s', async (path, body) => {
    const runtime = runtimeStub();
    const router = registerAIRuntimeRoutes(runtime.runtime, { auth: vi.fn() });
    const { res } = response();
    await getRouteHandler(
      router,
      'post',
      String(path),
    )(
      request({ ...body, runtimeKind: 'local_agent' }) as unknown as Request,
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
    expect(runtime.dispatchMessage).not.toHaveBeenCalled();
    expect(runtime.listMessages).not.toHaveBeenCalled();
    expect(runtime.deleteConversation).not.toHaveBeenCalled();
    expect(runtime.cancelRun).not.toHaveBeenCalled();
  });
  it('awaits native ask_user answers before returning the authenticated HTTP acknowledgement', async () => {
    const stub = runtimeStub();
    const answerToolSuspension = vi.fn(async () => true);
    const runtime = Object.assign(stub.runtime, { answerToolSuspension });
    const router = registerAIRuntimeRoutes(runtime, { auth });
    const { res } = response();
    const command = {
      type: 'tool_answer',
      action: 'answer',
      conversationId: 'conversation-1',
      runId: 'run-1',
      toolCallId: 'tool-1',
      answer: 'A',
    };

    await getRouteHandler(
      router,
      'post',
      '/assistant/answer',
    )(request(command) as never, res as never);

    expect(answerToolSuspension).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ identityId: 'identity-1' }),
        command,
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        data: { accepted: true },
      }),
    );
  });

  it('redacts native ask_user resume failures over HTTP instead of leaking provider diagnostics', async () => {
    const stub = runtimeStub();
    const runtime = Object.assign(stub.runtime, {
      answerToolSuspension: vi.fn(async () => {
        throw new AIExecutionError('provider_unavailable', 'vault=private-model-key');
      }),
    });
    const router = registerAIRuntimeRoutes(runtime, { auth });
    const { res } = response();

    await getRouteHandler(
      router,
      'post',
      '/assistant/answer',
    )(
      request({
        type: 'tool_answer',
        action: 'answer',
        conversationId: 'conversation-1',
        runId: 'run-1',
        toolCallId: 'tool-1',
        answer: 'A',
      }) as never,
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('private-model-key');
  });

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

  it('forwards the selected Agent instance and exact model but never renderer identity', async () => {
    const stub = runtimeStub();
    const router = registerAIRuntimeRoutes(stub.runtime, { auth });
    const handler = getRouteHandler(router, 'post', '/assistant/sse');
    const { res } = response();
    await handler(
      request({
        ...messageCommand,
        agentInstanceId: 'mastra-anyrouter',
        providerId: 'connection-1',
        modelId: 'model-1',
      }) as never,
      res as never,
    );
    expect(stub.dispatchMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-1',
        agentInstanceId: 'mastra-anyrouter',
        providerId: 'connection-1',
        modelId: 'model-1',
      }),
    );
    expect(stub.dispatchMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'fake-identity',
      }),
    );
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
    expect(writes[0]).toContain('The selected AI model does not support the required capability');
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
        spy: workflow.startDetached,
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
        spy: workflow.resumeDetached,
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
    expect(workflow.startDetached).not.toHaveBeenCalled();

    const unavailableRouter = registerAIRuntimeRoutes(assistant.runtime, { auth }, null);
    const unavailableStart = getRouteHandler(unavailableRouter, 'post', '/workflow/start');
    const { res: unavailableRes } = response();
    await unavailableStart(
      request({ kind: 'goal.create', conversationId: 'c1', input: {} }) as never,
      unavailableRes as never,
    );
    expect(unavailableRes.status).toHaveBeenCalledWith(503);
  });

  it('preserves unsupported workflow state codes while redacting diagnostics', async () => {
    const assistant = runtimeStub();
    const workflow = workflowRuntimeStub();
    workflow.startDetached.mockRejectedValueOnce({
      code: 'AI_WORKFLOW_STATUS_UNSUPPORTED',
      message: 'secret native status details',
    });
    const router = registerAIRuntimeRoutes(assistant.runtime, { auth }, workflow.runtime);
    const { res } = response();
    await getRouteHandler(
      router,
      'post',
      '/workflow/start',
    )(
      request({ kind: 'goal.create', conversationId: 'c', input: { idea: 'Plan' } }) as never,
      res as never,
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          code: 'AI_WORKFLOW_STATUS_UNSUPPORTED',
          message: 'AI workflow state is unsupported',
        },
      }),
    );
  });

  it('maps provider runtime failures to the same stable public code as Desktop IPC', async () => {
    const assistant = runtimeStub();
    const workflow = workflowRuntimeStub();
    workflow.startDetached.mockRejectedValueOnce(
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

describe('authenticated Assistant attention routes', () => {
  function portStub() {
    const list = vi.fn(async () => [
      {
        conversationId: 'conversation-1',
        runtimeKind: 'builtin' as const,
        state: 'done' as const,
        revision: 4,
        seenRevision: 0,
        runId: 'run-4',
        updatedAt: Date.now(),
      },
    ]);
    const acknowledge = vi.fn(async () => true);
    const transition = vi.fn(async () => {});
    const heartbeat = vi.fn(async () => {});
    const forget = vi.fn(async () => {});
    return { list, acknowledge, transition, heartbeat, forget };
  }

  it('requires authenticated identity, rejects Desktop kind and forwards bounded owner-scoped list', async () => {
    const port = portStub();
    const router = registerAIRuntimeRoutes(runtimeStub().runtime, { auth }, null, port);
    const handler = getRouteHandler(router, 'post', '/assistant/attention/list');
    const { res } = response();
    await handler(
      request({ conversationIds: ['conversation-1'], runtimeKind: 'builtin' }) as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect(port.list).toHaveBeenCalledWith({
      identityId: 'identity-1',
      runtimeKind: 'builtin',
      conversationIds: ['conversation-1'],
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { items: [expect.objectContaining({ state: 'done', revision: 4 })] },
      }),
    );
    for (const bad of [
      { conversationIds: ['conversation-1'], runtimeKind: 'local_agent' },
      { conversationIds: Array.from({ length: 101 }, (_, i) => 'item-' + i) },
      { conversationIds: ['conversation-1'], identityId: 'someone-else' },
    ]) {
      const x = response().res;
      await handler(request(bad) as never, x as never);
      expect(x.statusCode).toBe(400);
    }
    const none = response().res;
    await handler(request({ conversationIds: ['conversation-1'] }, '') as never, none as never);
    expect(none.statusCode).toBe(401);
    expect(port.list).toHaveBeenCalledTimes(1);
  });

  it('never accepts client-provided identity or future revision and binds ack to current owner', async () => {
    const port = portStub();
    const router = registerAIRuntimeRoutes(runtimeStub().runtime, { auth }, null, port);
    const handler = getRouteHandler(router, 'post', '/assistant/attention/ack');
    const payload = { conversationId: 'conversation-1', revision: 4, runtimeKind: 'builtin' };
    const okResponse = response().res;
    await handler(request(payload) as never, okResponse as never);
    expect(port.acknowledge).toHaveBeenCalledWith({ identityId: 'identity-1', ...payload });
    expect(okResponse.statusCode).toBe(200);
    for (const bad of [
      { ...payload, identityId: 'forged' },
      { ...payload, revision: 0 },
      { ...payload, runtimeKind: 'local_agent' },
    ]) {
      const x = response().res;
      await handler(request(bad) as never, x as never);
      expect(x.statusCode).toBe(400);
    }
    expect(port.acknowledge).toHaveBeenCalledTimes(1);
  });

  it('projects an actual SSE lifecycle without storing model output', async () => {
    const port = portStub();
    const started: AssistantRuntimeEvent = {
      eventId: 'r:1',
      runId: 'r',
      conversationId: 'conversation-1',
      sequence: 1,
      createdAt: 1000,
      type: 'assistant.run.started',
      data: {},
    };
    const completed: AssistantRuntimeEvent = {
      eventId: 'r:2',
      runId: 'r',
      conversationId: 'conversation-1',
      sequence: 2,
      createdAt: 2000,
      type: 'assistant.run.completed',
      data: { content: 'top secret output' },
    };
    const router = registerAIRuntimeRoutes(
      runtimeStub([started, completed]).runtime,
      { auth },
      null,
      port,
    );
    const { res } = response();
    await getRouteHandler(
      router,
      'post',
      '/assistant/sse',
    )(request(messageCommand) as never, res as never);
    expect(port.transition.mock.calls.map(([payload]) => payload.state)).toEqual([
      'working',
      'done',
    ]);
    expect(port.transition.mock.calls.map(([payload]) => payload.identityId)).toEqual([
      'identity-1',
      'identity-1',
    ]);
    for (const [payload] of port.transition.mock.calls)
      expect(JSON.stringify(payload)).not.toContain('top secret output');
  });
});

describe('authenticated Assistant approval route', () => {
  it('binds the strict command to server ExecutionContext and fails closed without identity', async () => {
    const stub = runtimeStub();
    const decideToolApproval = vi.fn(async () => false);
    Object.assign(stub.runtime, { decideToolApproval });
    const router = registerAIRuntimeRoutes(stub.runtime, { auth: (_req, _res, next) => next() });
    const handler = getRouteHandler(router, 'post', '/assistant/approval');
    const command = {
      type: 'tool_approval',
      conversationId: 'c',
      runId: 'r',
      toolCallId: 't',
      decision: 'approve',
    };
    const { res } = response();
    await handler(request(command) as Request, res as unknown as Response);
    expect(decideToolApproval).toHaveBeenCalledWith({
      command,
      context: expect.objectContaining({
        identityId: 'identity-1',
        requestId: 'request-runtime-1',
      }),
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { accepted: false } }));
    for (const body of [
      { ...command, identityId: 'attacker' },
      { ...command, decision: 'always_allow_category' },
    ]) {
      const invalid = response().res;
      await handler(request(body) as Request, invalid as unknown as Response);
      expect(invalid.statusCode).toBe(400);
    }
    const unauth = response().res;
    await handler(request(command, '') as Request, unauth as unknown as Response);
    expect(unauth.statusCode).toBe(401);
    expect(decideToolApproval).toHaveBeenCalledTimes(1);
  });
});
