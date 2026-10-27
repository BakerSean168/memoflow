/**
 * Request Context API Smoke Test (RefArch Phase 2 / AI-VNEXT-07).
 *
 * Locks producer-owned request metadata across the real global middleware and
 * the current Mastra-native AI transport. The HTTP entry creates requestId,
 * traceId and authenticated identity exactly once; `/ai/runtime/assistant/sse`
 * must pass that canonical ExecutionContext into Mastra without rebuilding it.
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAIApiModule } from '@memoflow/ai/api';
import { createAIModuleForTests } from '@memoflow/ai/testing';
import type { AssistantRuntimeEvent } from '@memoflow/ai-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { ok } from '@memoflow/transport-contracts/result';
import { expressAdapter } from '@memoflow/utils/result';
import { applyGlobalMiddleware } from '../../../shared/infrastructure/middleware/global';
import { applyErrorHandlers } from '../../../shared/infrastructure/middleware/error';
import { createAuthMiddleware } from '../../../shared/infrastructure/http/middlewares/auth-middleware';
import { HttpRequestMetricsRecorder } from '../../../shared/infrastructure/observability/http-request-metrics';
import { createInfrastructureRouter } from '../../../shared/infrastructure/http/routes/infrastructure-routes';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AI_RUNTIME_PATH = '/api/v1/ai/runtime/assistant/sse';

interface RuntimeDispatchInput {
  identityId: string;
  context?: ExecutionContext;
  conversationId: string;
  content: string;
  signal?: AbortSignal;
}

interface CapturedDispatch {
  input?: RuntimeDispatchInput;
}

function runtimeStub(captured: CapturedDispatch, options: { fail?: boolean } = {}) {
  const dispatchMessage = vi.fn(async function* (input: RuntimeDispatchInput) {
    captured.input = input;
    if (options.fail) throw new Error('provider secret must never cross transport');
    const started: AssistantRuntimeEvent = {
      eventId: 'run-1:1',
      runId: 'run-1',
      conversationId: input.conversationId,
      sequence: 1,
      createdAt: 1,
      type: 'assistant.run.started',
      data: { providerId: 'provider-1', modelId: 'gpt-4o-mini' },
    };
    const completed: AssistantRuntimeEvent = {
      eventId: 'run-1:2',
      runId: 'run-1',
      conversationId: input.conversationId,
      sequence: 2,
      createdAt: 2,
      type: 'assistant.run.completed',
      data: { content: 'hello from mastra' },
    };
    yield started;
    yield completed;
  });
  return {
    init: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
    dispatchMessage,
    cancelRun: vi.fn(() => true),
    listMessages: vi.fn(async () => ({ conversationId: 'conv-1', messages: [] })),
    deleteConversation: vi.fn(async () => true),
  };
}

async function createApp(options: { failRuntime?: boolean } = {}): Promise<{
  app: Express;
  captured: CapturedDispatch;
}> {
  const app = express();
  const recorder = new HttpRequestMetricsRecorder();
  applyGlobalMiddleware(app, recorder);

  const auth = createAuthMiddleware({
    resolveNodePrincipal: async (headers: Record<string, unknown>) => {
      if (headers.authorization === 'Bearer valid-token') {
        return {
          identityId: 'identity-smoke-1',
          sessionId: 'session-smoke-1',
          email: 'smoke@example.com',
          emailVerified: true,
        };
      }
      return null;
    },
  } as never);

  app.get(
    '/api/echo',
    auth,
    expressAdapter(() => Promise.resolve(ok({ message: 'echo' }))),
  );
  app.get('/api/goals/:id', auth, (req, res) => {
    res.json({ id: (req.params as { id: string }).id });
  });
  app.use('/', createInfrastructureRouter(recorder));

  const captured: CapturedDispatch = {};
  const mastraRuntime = runtimeStub(captured, { fail: options.failRuntime }) as never;
  const instance = createAIModuleForTests({ mastraRuntime });
  const aiModule = createAIApiModule({ instance });
  const router = express.Router();
  await aiModule.register({
    app,
    router,
    middleware: {
      auth,
      requireRole: () => auth,
    },
    openApiRegistry: undefined,
  });
  app.use('/api/v1', router);

  applyErrorHandlers(app);
  return { app, captured };
}

const ASSISTANT_BODY = {
  type: 'message',
  conversationId: 'conv-1',
  content: 'hi',
  surface: 'web',
};

describe('Request Context smoke (Mastra-native)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('echoes a client-supplied X-Request-Id on a JSON route and in the envelope traceId', async () => {
    const { app } = await createApp();
    const res = await request(app)
      .get('/api/echo')
      .set('Authorization', 'Bearer valid-token')
      .set('X-Request-Id', 'client-abc-123');

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe('client-abc-123');
    expect(res.body.ok).toBe(true);
    expect(res.body.traceId).toBe('client-abc-123');
  });

  it('generates a UUID when no X-Request-Id is sent and uses it everywhere', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/echo').set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(res.body.traceId).toBe(res.headers['x-request-id']);
  });

  it('falls back to a UUID for an invalid X-Request-Id', async () => {
    const { app } = await createApp();
    const res = await request(app)
      .get('/api/echo')
      .set('Authorization', 'Bearer valid-token')
      .set('X-Request-Id', 'bad header value with spaces');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(res.body.traceId).toBe(res.headers['x-request-id']);
  });

  it('auth failure and 404 preserve the entry request correlation envelope', async () => {
    const { app } = await createApp();
    const authFailure = await request(app).get('/api/echo').set('X-Request-Id', 'auth-fail-1');
    expect(authFailure.status).toBe(401);
    expect(authFailure.headers['x-request-id']).toBe('auth-fail-1');
    expect(authFailure.body.traceId).toBe('auth-fail-1');

    const notFound = await request(app).get('/api/not-a-route');
    expect(notFound.status).toBe(404);
    expect(notFound.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(notFound.body.traceId).toBe(notFound.headers['x-request-id']);
  });

  it('Mastra SSE route receives the exact entry ExecutionContext and streams only canonical runtime events', async () => {
    const { app, captured } = await createApp();
    const res = await request(app)
      .post(AI_RUNTIME_PATH)
      .set('Authorization', 'Bearer valid-token')
      .set('X-Request-Id', 'client-mastra-1')
      .set('Content-Type', 'application/json')
      .send(ASSISTANT_BODY);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe('client-mastra-1');
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.text).toContain('event: runtime');
    expect(res.text).toContain('"type":"assistant.run.started"');
    expect(res.text).toContain('"type":"assistant.run.completed"');
    expect(res.text).not.toContain('apiKey');
    expect(captured.input).toEqual(
      expect.objectContaining({
        identityId: 'identity-smoke-1',
        conversationId: 'conv-1',
        content: 'hi',
        context: expect.objectContaining({
          requestId: 'client-mastra-1',
          traceId: 'client-mastra-1',
          source: 'http',
          identityId: 'identity-smoke-1',
          startedAt: expect.any(Number),
        }),
      }),
    );
  });

  it('Mastra transport failures emit a public error without leaking provider details', async () => {
    const { app } = await createApp({ failRuntime: true });
    const res = await request(app)
      .post(AI_RUNTIME_PATH)
      .set('Authorization', 'Bearer valid-token')
      .set('X-Request-Id', 'client-mastra-error')
      .set('Content-Type', 'application/json')
      .send(ASSISTANT_BODY);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe('client-mastra-error');
    expect(res.text).toContain('event: error');
    expect(res.text).toContain('AI_RUNTIME_TRANSPORT_ERROR');
    expect(res.text).not.toContain('provider secret');
  });
});
