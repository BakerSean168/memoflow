import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import type { AIChatController } from '../../server/transport/ai-chat.controller';
import { registerAIChatRoutes } from './ai-chat.routes';

type RegisteredRoute = {
  method: string;
  path: string;
  request?: Record<string, unknown>;
  responses?: Record<string, unknown>;
};

class TestOpenApiRegistry implements OpenApiRegistryLike {
  readonly paths: RegisteredRoute[] = [];

  registerPath(route: Record<string, unknown>): void {
    this.paths.push(route as RegisteredRoute);
  }

  register(): void {}
}

const authMiddleware = ((_, __, next) => next()) as RequestHandler;

function createAIChatControllerStub(): AIChatController {
  return {
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    getConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    sendMessage: vi.fn(),
    streamMessage: vi.fn(),
    parseSendMessage: vi.fn(),
    listMessages: vi.fn(),
  } as unknown as AIChatController;
}

function getRegisteredRoute(
  registry: TestOpenApiRegistry,
  method: string,
  path: string,
): RegisteredRoute {
  const route = registry.paths.find(
    (candidate) => candidate.method === method && candidate.path === path,
  );

  expect(route).toBeDefined();
  return route!;
}

function getResponseSchema(
  route: RegisteredRoute,
  status: number,
): {
  safeParse: (value: unknown) => { success: boolean };
  _def?: { typeName?: string };
} {
  const responses = route.responses as
    | Record<string, { content?: Record<string, unknown> }>
    | undefined;
  const response = responses?.[String(status)];
  const schema = (response?.content as Record<string, unknown> | undefined)?.[
    'application/json'
  ] as
    | {
        schema?: {
          safeParse: (value: unknown) => { success: boolean };
          _def?: { typeName?: string };
        };
      }
    | undefined;
  return (
    schema?.schema ??
    (response as unknown as { safeParse: (value: unknown) => { success: boolean } })
  );
}

function getParamsSchema(route: RegisteredRoute): {
  safeParse: (value: unknown) => { success: boolean };
} {
  return route.request?.params as {
    safeParse: (value: unknown) => { success: boolean };
  };
}

function getJsonBodySchema(route: RegisteredRoute): {
  safeParse: (value: unknown) => { success: boolean };
} {
  return (
    (
      (route.request?.body as Record<string, unknown> | undefined)?.content as
        | Record<string, unknown>
        | undefined
    )?.['application/json'] as Record<string, unknown> | undefined
  )?.schema as {
    safeParse: (value: unknown) => { success: boolean };
  };
}

function collectAllSchemas(
  obj: unknown,
): Array<{ safeParse: (value: unknown) => { success: boolean }; _def?: { typeName?: string } }> {
  const schemas: Array<{
    safeParse: (value: unknown) => { success: boolean };
    _def?: { typeName?: string };
  }> = [];
  if (!obj || typeof obj !== 'object') return schemas;

  const record = obj as Record<string, unknown>;
  if (typeof record.safeParse === 'function') {
    schemas.push(
      record as {
        safeParse: (value: unknown) => { success: boolean };
        _def?: { typeName?: string };
      },
    );
  }

  for (const value of Object.values(record)) {
    schemas.push(...collectAllSchemas(value));
  }

  return schemas;
}

// basePath is '/api/v1/ai/chat', and :param becomes {param} in OpenAPI paths
const BASE = '/api/v1/ai/chat';

describe('ai chat route contracts', () => {
  it('no z.any() in any response schema', () => {
    const registry = new TestOpenApiRegistry();

    registerAIChatRoutes(
      createAIChatControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    for (const route of registry.paths) {
      // Skip the SSE route which is not registered in OpenAPI
      if (route.method === 'post' && route.path === '/messages/sse') continue;

      const responses = route.responses as
        | Record<string, { content?: Record<string, unknown> }>
        | undefined;
      if (!responses) continue;

      for (const [status, response] of Object.entries(responses)) {
        const allSchemas = collectAllSchemas(response);
        for (const schema of allSchemas) {
          const def = schema._def;
          if (def?.typeName === 'ZodAny') {
            const routeInfo = `${route.method.toUpperCase()} ${route.path}`;
            expect.fail(`Found z.any() in response schema for ${routeInfo} (status ${status})`);
          }
        }
      }
    }
  });

  it('conversation list uses ConversationListResSchema from contracts', () => {
    const registry = new TestOpenApiRegistry();

    registerAIChatRoutes(
      createAIChatControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const listRoute = getRegisteredRoute(registry, 'get', `${BASE}/conversations`);
    const responseSchema = getResponseSchema(listRoute, 200);

    // Response is wrapped in success envelope with data as ConversationListRes
    expect(responseSchema).toBeDefined();
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: { data: [], total: 0, page: 1, pageSize: 20 },
        timestamp: Date.now(),
      }).success,
    ).toBe(true);
    // Should reject if data is a bare array
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: [],
        timestamp: Date.now(),
      }).success,
    ).toBe(false);
  });

  it('route params use branded IDs (not bare strings)', () => {
    const registry = new TestOpenApiRegistry();

    registerAIChatRoutes(
      createAIChatControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const getRoute = getRegisteredRoute(registry, 'get', `${BASE}/conversations/{id}`);
    const paramsSchema = getParamsSchema(getRoute);

    // brandedId rejects bare strings
    expect(paramsSchema.safeParse({ id: 'not-a-branded-id' }).success).toBe(false);
  });

  it('create conversation body schema accepts valid data', () => {
    const registry = new TestOpenApiRegistry();

    registerAIChatRoutes(
      createAIChatControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const createSchema = getJsonBodySchema(
      getRegisteredRoute(registry, 'post', `${BASE}/conversations`),
    );

    // ConversationNameSchema requires name (non-empty string)
    expect(createSchema.safeParse({ name: 'My chat' }).success).toBe(true);
    expect(createSchema.safeParse({}).success).toBe(false);
    expect(createSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('delete conversation response uses z.null() (no ActionSuccess dual-track)', () => {
    const registry = new TestOpenApiRegistry();

    registerAIChatRoutes(
      createAIChatControllerStub(),
      { auth: authMiddleware, requireRole: vi.fn(() => authMiddleware) },
      registry,
    );

    const deleteRoute = getRegisteredRoute(registry, 'delete', `${BASE}/conversations/{id}`);
    const responseSchema = getResponseSchema(deleteRoute, 200);

    expect(responseSchema).toBeDefined();
    expect(responseSchema._def?.typeName).not.toBe('ZodAny');
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: null,
        timestamp: Date.now(),
      }).success,
    ).toBe(true);
    expect(
      responseSchema.safeParse({
        ok: true,
        code: 200,
        message: 'ok',
        data: { success: true },
        timestamp: Date.now(),
      }).success,
    ).toBe(false);
  });
});
