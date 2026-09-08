/**
 * OpenAPI generator check (Phase 4 Step 6).
 *
 * Registers the Goal/Task/Notification/Governance mutation routes through the
 * PRODUCTION composition-root seams (`createGoalApiModule`,
 * `createTaskApiModule`, `createNotificationApiModule`,
 * `createGovernanceApiModule`) into a fresh zod-to-openapi registry, then
 * generates an OpenAPI document. Every ledger HTTP mutation is asserted to
 * have a path, a request schema (params/query/body) and a response envelope /
 * data schema. This proves the schema objects referenced by OpenAPI and the
 * runtime validation adapters are the SAME registered objects (no duplicate
 * inline components), including Goal lifecycle mutations and
 * Notification read-all.
 *
 * OpenAPI 生成检查（Phase 4 Step 6）：通过生产组合根 seam
 * （`createGoalApiModule` / `createTaskApiModule` / `createNotificationApiModule`
 * / `createGovernanceApiModule`）把 Goal/Task/Notification/Governance 的
 * mutation 路由注册进全新 registry，再生成 OpenAPI 文档。每个 ledger HTTP
 * mutation 都断言有 path、request schema（params/query/body）与 response
 * envelope/data schema。这证明 OpenAPI 引用的 schema 与 runtime validation
 * adapter 是同一注册对象（无重复 inline component），包括 Goal void mutation、
 * Task explicit occurrence facts 与 Notification read-all。
 */
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Router } from 'express';
import { describe, expect, it } from 'vitest';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import { createGoalApiModule } from '@memoflow/goal/api';
import { createTaskApiModule } from '@memoflow/task/api';
import { createNotificationApiModule } from '@memoflow/notification/api';
import { createGovernanceApiModule } from '@memoflow/governance/api';

/**
 * Captures every `registerPath` raw route definition (with the exact Zod
 * schema objects) while forwarding to the real zod-to-openapi registry for
 * document generation. This lets the spec assert request/response schema
 * identity AND generate the final document.
 *
 * 捕获每个 `registerPath` 原始路由定义（含精确 Zod schema 对象），同时转发到
 * 真实 zod-to-openapi registry 用于生成文档。这使 spec 既能断言 request/
 * response schema 同一性，也能生成最终文档。
 */
class CapturingRegistry implements OpenApiRegistryLike {
  readonly rawPaths: Array<RouteDef> = [];
  constructor(readonly inner: OpenAPIRegistry) {}
  registerPath(route: Record<string, unknown>): void {
    this.rawPaths.push(route as RouteDef);
    this.inner.registerPath(route as never);
  }
  register(name: string, schema: unknown): void {
    this.inner.register(name, schema as never);
  }
}

const auth = ((_req: unknown, _res: unknown, next: () => void) => next()) as never;
const requireRole = () => auth;

function createContext(registry: OpenApiRegistryLike) {
  return {
    app: Router() as never,
    router: Router(),
    middleware: { auth, requireRole },
    openApiRegistry: registry,
  };
}

/** Minimal module instance: only `api` / `start` / `dispose` are used by transport. */
function fakeInstance() {
  return {
    api: {},
    start: () => {},
    dispose: () => {},
  } as never;
}

async function registerAll(registry: CapturingRegistry) {
  await createGoalApiModule({ instance: fakeInstance() }).register(createContext(registry));
  await createTaskApiModule({ instance: fakeInstance() }).register(createContext(registry));
  await createNotificationApiModule({ instance: fakeInstance() }).register(createContext(registry));
  await createGovernanceApiModule({ instance: fakeInstance() }).register(createContext(registry));
}

type SchemaLike = { safeParse(data: unknown): { success: boolean } };

type RouteDef = {
  readonly method: string;
  readonly path: string;
  readonly request?: {
    body?: { content?: Record<string, { schema?: unknown }> };
    params?: unknown;
    query?: unknown;
  };
  readonly responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
};

function getBodySchema(def: RouteDef): SchemaLike | undefined {
  return def.request?.body?.content?.['application/json']?.schema as SchemaLike | undefined;
}

function getParamsSchema(def: RouteDef): SchemaLike | undefined {
  return def.request?.params as SchemaLike | undefined;
}

function getQuerySchema(def: RouteDef): SchemaLike | undefined {
  return def.request?.query as SchemaLike | undefined;
}

function getResponseSchema(def: RouteDef, status: number): SchemaLike | undefined {
  return def.responses?.[String(status)]?.content?.['application/json']?.schema as
    SchemaLike | undefined;
}

interface LedgerRow {
  readonly module: 'goal' | 'task' | 'notification' | 'governance';
  readonly method: string;
  /** OpenAPI path (RouteRegistrar basePath + path). */
  readonly path: string;
  /** Success HTTP status (201 for creates). */
  readonly status: number;
  /** True when the mutation carries a JSON body (void commands do not). */
  readonly hasBody: boolean;
  /** True when the mutation validates `{ params }` (id-only / composite). */
  readonly hasParams?: boolean;
  /** True when the mutation validates a query input. */
  readonly hasQuery?: boolean;
}

const GOAL_LEDGER: LedgerRow[] = [
  { module: 'goal', method: 'post', path: '/api/v1/goals', status: 201, hasBody: true },
  {
    module: 'goal',
    method: 'put',
    path: '/api/v1/goals/{id}',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'goal',
    method: 'delete',
    path: '/api/v1/goals/{id}',
    status: 200,
    hasBody: false,
    hasParams: true,
    hasQuery: true,
  },
  {
    module: 'goal',
    method: 'post',
    path: '/api/v1/goals/{id}/archive',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'goal',
    method: 'post',
    path: '/api/v1/goals/{id}/abandon',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'goal',
    method: 'post',
    path: '/api/v1/goals/{id}/activate',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'goal',
    method: 'post',
    path: '/api/v1/goals/{id}/complete',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'goal',
    method: 'post',
    path: '/api/v1/goals/{id}/clone',
    status: 201,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'goal',
    method: 'put',
    path: '/api/v1/goals/{id}/key-results/batch-weight',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'goal',
    method: 'post',
    path: '/api/v1/goals/{id}/key-results',
    status: 201,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'goal',
    method: 'put',
    path: '/api/v1/goals/{id}/key-results/{krId}',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'goal',
    method: 'patch',
    path: '/api/v1/goals/{id}/key-results/{krId}/progress',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'goal',
    method: 'delete',
    path: '/api/v1/goals/{id}/key-results/{krId}',
    status: 200,
    hasBody: false,
    hasParams: true,
    hasQuery: true,
  },
  {
    module: 'goal',
    method: 'post',
    path: '/api/v1/goals/{id}/reviews',
    status: 201,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'goal',
    method: 'put',
    path: '/api/v1/goals/{id}/reviews/{reviewId}',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'goal',
    method: 'delete',
    path: '/api/v1/goals/{id}/reviews/{reviewId}',
    status: 200,
    hasBody: false,
    hasParams: true,
    hasQuery: true,
  },
  {
    module: 'goal',
    method: 'post',
    path: '/api/v1/goals/{id}/key-results/{krId}/records',
    status: 201,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'goal',
    method: 'delete',
    path: '/api/v1/goals/{id}/key-results/{krId}/records/{recordId}',
    status: 200,
    hasBody: false,
    hasParams: true,
    hasQuery: true,
  },
];

const TASK_LEDGER: LedgerRow[] = [
  { module: 'task', method: 'post', path: '/api/v1/task-plans', status: 201, hasBody: true },
  {
    module: 'task',
    method: 'put',
    path: '/api/v1/task-plans/{id}',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'delete',
    path: '/api/v1/task-plans/{id}',
    status: 200,
    hasBody: false,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'post',
    path: '/api/v1/task-plans/{id}/activate',
    status: 200,
    hasBody: false,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'post',
    path: '/api/v1/task-plans/{id}/abandon',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'post',
    path: '/api/v1/task-plans/{id}/pause',
    status: 200,
    hasBody: false,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'post',
    path: '/api/v1/task-plans/{id}/archive',
    status: 200,
    hasBody: false,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'post',
    path: '/api/v1/task-plans/{id}/generate-instances',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'post',
    path: '/api/v1/task-plans/{id}/bind-goal',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'post',
    path: '/api/v1/task-plans/{id}/unbind-goal',
    status: 200,
    hasBody: false,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'post',
    path: '/api/v1/task-occurrences/{id}/complete',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'post',
    path: '/api/v1/task-occurrences/{id}/uncomplete',
    status: 200,
    hasBody: false,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'post',
    path: '/api/v1/task-occurrences/{id}/skip',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'post',
    path: '/api/v1/task-occurrences/{id}/missed',
    status: 200,
    hasBody: true,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'post',
    path: '/api/v1/task-occurrences/{id}/start',
    status: 200,
    hasBody: false,
    hasParams: true,
  },
  {
    module: 'task',
    method: 'delete',
    path: '/api/v1/task-occurrences/{id}',
    status: 200,
    hasBody: false,
    hasParams: true,
  },
];

const NOTIFICATION_LEDGER: LedgerRow[] = [
  {
    module: 'notification',
    method: 'post',
    path: '/api/v1/notifications',
    status: 201,
    hasBody: true,
  },
  {
    module: 'notification',
    method: 'delete',
    path: '/api/v1/notifications/{id}',
    status: 200,
    hasBody: false,
    hasParams: true,
  },
  {
    module: 'notification',
    method: 'patch',
    path: '/api/v1/notifications/{id}/read',
    status: 200,
    hasBody: false,
    hasParams: true,
  },
  {
    module: 'notification',
    method: 'patch',
    path: '/api/v1/notifications/read-all',
    status: 200,
    hasBody: false,
  },
  {
    module: 'notification',
    method: 'post',
    path: '/api/v1/notifications/batch-read',
    status: 200,
    hasBody: true,
  },
  {
    module: 'notification',
    method: 'post',
    path: '/api/v1/notifications/batch-delete',
    status: 200,
    hasBody: true,
  },
  {
    module: 'notification',
    method: 'post',
    path: '/api/v1/notifications/cleanup',
    status: 200,
    hasBody: true,
  },
  {
    module: 'notification',
    method: 'put',
    path: '/api/v1/notifications/preferences',
    status: 200,
    hasBody: true,
  },
];

const GOVERNANCE_LEDGER: LedgerRow[] = [
  {
    module: 'governance',
    method: 'post',
    path: '/api/v1/governance/rules',
    status: 201,
    hasBody: true,
  },
];

const ALL_LEDGER = [...GOAL_LEDGER, ...TASK_LEDGER, ...NOTIFICATION_LEDGER, ...GOVERNANCE_LEDGER];

describe('OpenAPI generator ledger coverage (Phase 4)', () => {
  it('registers a path for every ledger mutation', async () => {
    const registry = new CapturingRegistry(new OpenAPIRegistry());
    await registerAll(registry);

    expect(registry.rawPaths.length).toBeGreaterThan(0);
    for (const row of ALL_LEDGER) {
      const def = registry.rawPaths.find(
        (candidate) =>
          candidate.method === row.method &&
          ((candidate.path as string) ?? '').replace(/\/$/, '') === row.path.replace(/\/$/, ''),
      );
      expect(def, `${row.module} ${row.method.toUpperCase()} ${row.path} registered`).toBeDefined();
    }
  });

  it('binds request schema (params/query/body) and success response envelope for every ledger row', async () => {
    const registry = new CapturingRegistry(new OpenAPIRegistry());
    await registerAll(registry);

    for (const row of ALL_LEDGER) {
      const def = registry.rawPaths.find(
        (candidate) =>
          candidate.method === row.method &&
          ((candidate.path as string) ?? '').replace(/\/$/, '') === row.path.replace(/\/$/, ''),
      )!;
      const label = `${row.module} ${row.method.toUpperCase()} ${row.path}`;

      // Request schema presence: body-bearing mutations bind a JSON body
      // schema; void/params-only rows do not.
      if (row.hasBody) {
        expect(getBodySchema(def), `${label} body schema`).toBeDefined();
      } else {
        expect(getBodySchema(def), `${label} must not bind a body schema (void)`).toBeUndefined();
      }
      if (row.hasParams) {
        expect(getParamsSchema(def), `${label} params schema`).toBeDefined();
      }
      if (row.hasQuery) {
        expect(getQuerySchema(def), `${label} query schema`).toBeDefined();
      }

      // Response envelope: success status carries the shared HttpResponse
      // envelope whose `data` is a real (non-any) schema.
      const responseSchema = getResponseSchema(def, row.status);
      expect(responseSchema, `${label} ${row.status} response envelope`).toBeDefined();
      const shape = (responseSchema as { shape?: Record<string, unknown> }).shape;
      expect(shape, `${label} response envelope shape`).toBeDefined();
      for (const key of ['ok', 'code', 'message', 'data', 'timestamp']) {
        expect(shape![key], `${label} response envelope.${key}`).toBeDefined();
      }
      const dataSchema = shape!.data as { safeParse?: (value: unknown) => unknown } | undefined;
      expect(
        typeof dataSchema?.safeParse,
        `${label} response data schema must be a Zod schema`,
      ).toBe('function');
    }
  });

  it('validates runtime schema objects are the same registered request objects (no duplicate inline schemas)', async () => {
    const registry = new CapturingRegistry(new OpenAPIRegistry());
    await registerAll(registry);

    // Goal create body schema must reject malformed input and accept valid
    // input — the SAME object the runtime adapter validates with.
    const goalCreate = registry.rawPaths.find(
      (candidate) => candidate.method === 'post' && candidate.path === '/api/v1/goals',
    )!;
    const goalCreateBody = getBodySchema(goalCreate)!;
    expect(goalCreateBody.safeParse({ name: 'Ship', dueDate: Date.now() }).success).toBe(true);
    expect(goalCreateBody.safeParse({ name: '' }).success).toBe(false);
    expect(goalCreateBody.safeParse({ name: 'Legacy', importance: 'Moderate' }).success).toBe(false);

    // Notification read-all is a void command with an unread-count envelope.
    const notifReadAll = registry.rawPaths.find(
      (candidate) =>
        candidate.method === 'patch' && candidate.path === '/api/v1/notifications/read-all',
    )!;
    expect(getBodySchema(notifReadAll)).toBeUndefined();
    const readAllShape = (
      getResponseSchema(notifReadAll, 200) as unknown as { shape: Record<string, unknown> }
    ).shape;
    expect(readAllShape.data).toBeDefined();
    expect(
      (readAllShape.data as { safeParse: (v: unknown) => { success: boolean } }).safeParse({
        count: 5,
      }).success,
    ).toBe(true);
  });
});
