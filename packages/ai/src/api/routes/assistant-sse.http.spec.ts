import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AssistantRuntimeEvent } from '@memoflow/contracts/ai';
import { registerAIRuntimeRoutes } from './ai-runtime.routes';

// Transport contract only: runtime/model/persistence semantics stay with their
// existing runtime and PostgreSQL suites; no synthetic runtime is product code.
const command = {
  type: 'message',
  surface: 'web',
  conversationId: 'thread',
  content: 'Hello',
  agentInstanceId: 'mastra',
  modelId: 'model-alpha',
};
const auth: RequestHandler = (req, res, next) => {
  const identityId = req.header('authorization')?.replace('Bearer ', '');
  if (identityId !== 'owner') {
    res.sendStatus(401);
    return;
  }
  Object.assign(req, { user: { identityId } });
  next();
};
function fixture(dispatch: Parameters<typeof registerAIRuntimeRoutes>[0]) {
  return express()
    .use(express.json())
    .use('/ai/runtime', registerAIRuntimeRoutes(dispatch, { auth }));
}
function runtime(
  dispatchMessage: NonNullable<Parameters<typeof registerAIRuntimeRoutes>[0]>['dispatchMessage'],
) {
  const unavailable = async (): Promise<never> => {
    throw new Error('unused in HTTP contract');
  };
  return {
    dispatchMessage,
    decideToolApproval: unavailable,
    answerToolSuspension: unavailable,
    listAskUserSuspensions: unavailable,
    cancelRun: () => false,
    listMessages: unavailable,
    deleteConversation: unavailable,
    summarizeUsage: unavailable,
  } as NonNullable<Parameters<typeof registerAIRuntimeRoutes>[0]>;
}

describe('Assistant SSE HTTP acceptance boundary', () => {
  it('rejects unauthenticated, malformed, forged-owner and Desktop-only commands before dispatch', async () => {
    const dispatch = vi.fn(async function* () {});
    const app = fixture(runtime(dispatch));
    expect((await request(app).post('/ai/runtime/assistant/sse').send(command)).status).toBe(401);
    for (const patch of [
      { content: undefined },
      { identityId: 'foreign' },
      { runtimeKind: 'local_agent' },
    ]) {
      expect(
        (
          await request(app)
            .post('/ai/runtime/assistant/sse')
            .set('authorization', 'Bearer owner')
            .send({ ...command, ...patch })
        ).status,
      ).toBe(400);
    }
    expect(dispatch).not.toHaveBeenCalled();
    expect(
      (
        await request(fixture(null))
          .post('/ai/runtime/assistant/sse')
          .set('authorization', 'Bearer owner')
          .send(command)
      ).status,
    ).toBe(503);
  });

  it('streams validated frames in order with the authenticated owner and exact selected agent/model', async () => {
    const dispatch = vi.fn(async function* (input) {
      const base = {
        eventId: 'event-1',
        runId: 'run-1',
        conversationId: input.conversationId,
        sequence: 1,
        createdAt: 1,
      };
      yield {
        ...base,
        type: 'assistant.run.started',
        data: { modelId: input.modelId },
      } satisfies AssistantRuntimeEvent;
      yield {
        ...base,
        eventId: 'event-2',
        sequence: 2,
        type: 'assistant.message.delta',
        data: { content: 'Hello from model' },
      } satisfies AssistantRuntimeEvent;
    });
    const result = await request(fixture(runtime(dispatch)))
      .post('/ai/runtime/assistant/sse')
      .set('authorization', 'Bearer owner')
      .send(command);
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain('text/event-stream');
    expect(result.headers['cache-control']).toContain('no-cache');
    expect(result.text.indexOf('assistant.run.started')).toBeLessThan(
      result.text.indexOf('assistant.message.delta'),
    );
    expect(result.text).toContain('Hello from model');
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'owner',
        conversationId: 'thread',
        agentInstanceId: 'mastra',
        modelId: 'model-alpha',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('sanitizes runtime failures and rejects malformed runtime events without leaking private details', async () => {
    for (const dispatch of [
      async function* () {
        throw new Error('provider-key-PRIVATE /internal/owner.db');
      },
      async function* () {
        yield {
          type: 'assistant.message.delta',
          data: { secret: 'PRIVATE' },
        } as unknown as AssistantRuntimeEvent;
      },
    ]) {
      const result = await request(fixture(runtime(dispatch)))
        .post('/ai/runtime/assistant/sse')
        .set('authorization', 'Bearer owner')
        .send(command);
      expect(result.status).toBe(200);
      expect(result.text).toContain('event: error');
      expect(result.text).toContain('AI_RUNTIME_TRANSPORT_ERROR');
      expect(result.text).not.toContain('PRIVATE');
      expect(result.text).not.toContain('/internal/owner.db');
    }
  });
});
