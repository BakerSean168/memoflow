/**
 * Goal transport parity spec (Phase 4).
 *
 * Every Goal mutation ledger row is fed the SAME canonical fixture through the
 * PRODUCTION route registrations (registerGoalCrudRoutes /
 * registerKeyResultRoutes / registerReviewRoutes / registerRecordRoutes) and the PRODUCTION IPC
 * registrations (createGoalElectronModule). Both hosts consume the same
 * `GoalApplicationPort` stub, so parity is proven by construction: production
 * projectors + production controllers call the same port method with
 * equivalent input, and the HTTP/IPC envelopes carry the same response data
 * and error details. Malformed fixtures are rejected by the adapter before the
 * controller on both transports.
 *
 * HTTP-only operations (key-result progress) assert the IPC channel is NOT
 * registered (documented unsupported) instead of fabricating a host.
 *
 * 每个 Goal mutation ledger 行都用同一 canonical fixture 走生产 route 注册
 * （registerGoalCrudRoutes / registerKeyResultRoutes / registerReviewRoutes / registerRecordRoutes）与
 * 生产 IPC 注册（createGoalElectronModule）。两条宿主消费同一个
 * `GoalApplicationPort` stub，因此 parity 由构造保证：生产 projector + 生产
 * controller 以等价输入调用同一 port 方法，HTTP/IPC envelope 携带相同的响应
 * data 与 error details。malformed fixture 在两条 transport 上都由 adapter 在
 * controller 前拒绝。
 *
 * HTTP-only 操作（key-result progress）断言 IPC 通道未注册（文档化
 * unsupported），而不是伪造一个宿主。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { RequestHandler } from 'express';
import { GoalChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import type { ExecutionContext, RequestContext } from '@memoflow/contracts/shared';
import type { GoalApplicationPort } from '../../application';
import { createGoalTransportHandlers } from '..';
import { GoalController } from '../goal.controller';
import { registerGoalCrudRoutes } from '../../../api/routes/goal.routes';
import { registerKeyResultRoutes } from '../../../api/routes/key-result.routes';
import { registerReviewRoutes } from '../../../api/routes/review.routes';
import { registerRecordRoutes } from '../../../api/routes/goal-record.routes';
import { createGoalElectronModule } from '../../../electron';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const handle = vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    if (handlers.has(channel)) {
      throw new Error(`Attempted to register a second handler for '${channel}'`);
    }
    handlers.set(channel, handler);
  });
  const removeHandler = vi.fn((channel: string) => {
    handlers.delete(channel);
  });
  return { handlers, handle, removeHandler };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
    removeHandler: mocks.removeHandler,
  },
}));

const CARRIER: RequestContext = {
  requestId: 'req-goal-parity',
  traceId: 'req-goal-parity',
  startedAt: 1_700_000_000_000,
  source: 'ipc',
};

const fixtureContext: ExecutionContext = {
  ...CARRIER,
  identityId: 'identity-1',
  deviceId: 'desktop-app',
};

const GOAL_ID = 'IGoalId_550e8400-e29b-41d4-a716-446655440000';
const KR_ID = 'IKeyResultId_550e8400-e29b-41d4-a716-446655440001';
const REVIEW_ID = 'IGoalReviewId_550e8400-e29b-41d4-a716-446655440002';
const RECORD_ID = 'IGoalRecordId_550e8400-e29b-41d4-a716-446655440003';

function okReceipt() {
  return {
    goalId: GOAL_ID,
    goalVersion: 2,
    affectedEntityIds: { goalIds: [], keyResultIds: [], recordIds: [], reviewIds: [] },
    readModel: {},
  };
}

function createPortStub(): GoalApplicationPort {
  const fn = (value: unknown) => vi.fn(async () => ({ ok: true as const, data: value }));
  return {
    createGoal: fn(okReceipt()),
    updateGoal: fn(okReceipt()),
    deleteGoal: fn(okReceipt()),
    planGoal: fn(okReceipt()),
    archiveGoal: fn(okReceipt()),
    abandonGoal: fn(okReceipt()),
    activateGoal: fn(okReceipt()),
    completeGoal: fn(okReceipt()),
    cloneGoal: fn(okReceipt()),
    addKeyResult: fn(okReceipt()),
    updateKeyResult: fn(okReceipt()),
    updateKeyResultProgress: fn(okReceipt()),
    deleteKeyResult: fn(okReceipt()),
    batchUpdateKeyResultWeights: fn(okReceipt()),
    addReview: fn(okReceipt()),
    getReviewContext: fn({
      windowStartAt: 0,
      windowEndAt: 1,
      overallProgress: { startPercentage: 0, endPercentage: 0, deltaPercentage: 0 },
      keyResults: [],
      summary: { recordCount: 0, manualRecordCount: 0, taskContributionCount: 0 },
    }),
    updateReview: fn(okReceipt()),
    deleteReview: fn(okReceipt()),
    createRecord: fn(okReceipt()),
    updateRecord: fn(okReceipt()),
    deleteRecord: fn(okReceipt()),
    getGoal: vi.fn(),
    listGoals: vi.fn(),
    searchGoals: vi.fn(),
    getGoalAggregate: vi.fn(),
    permanentlyDeleteGoal: vi.fn(),
  } as unknown as GoalApplicationPort;
}

const authMiddleware = ((_req: unknown, _res: unknown, next: () => void) =>
  next()) as RequestHandler;
const middleware = { auth: authMiddleware, requireRole: () => authMiddleware };

function createRes() {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
    end() {
      return res;
    },
  };
  return res;
}

type HttpFixture = {
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
};

interface RowSpec {
  /** Production HTTP handler lookup key: `${method.toUpperCase()} ${path}`. */
  readonly httpKey: string;
  /** Production IPC channel name; null => HTTP-only (documented unsupported). */
  readonly ipcChannel: string | null;
  /** HTTP success status for the valid fixture (create/clone/folder-create are 201). */
  readonly successStatus?: number;
  /** Raw wire request fixture (body/params/query). */
  readonly httpReq: HttpFixture;
  /** Raw positional IPC args for the valid fixture. */
  readonly ipcArgs: unknown[];
  /** Asserts the port method was called TWICE (HTTP + IPC) with equivalent args. */
  readonly assertPort: (port: GoalApplicationPort, expected: unknown) => void;
  /** Raw wire request fixture that must fail schema validation on HTTP. */
  readonly malformedHttpReq: HttpFixture;
  /** Raw positional IPC args that must fail schema validation on IPC. */
  readonly malformedIpcArgs: unknown[];
  /** Canonical invocation both transports must produce (for assertion). */
  readonly validInvocation: unknown;
}

const validCreate = { name: 'Ship architecture fixes' };
const malformedCreate = { name: '' };

const validUpdateBody = { name: 'v2', expectedVersion: 1 };
const malformedUpdateBody = { name: 'v2', expectedVersion: 0 };

const validVersionCommand = { expectedVersion: 1 };
const malformedVersionCommand = { expectedVersion: 0 };

const validClone = { name: 'copy' };
const malformedClone = { title: 'legacy' };

const validAddKr = {
  goalId: GOAL_ID,
  title: 'KR',
  calculationMethod: 'Sum',
  initialValue: 0,
  currentValue: 0,
  targetValue: 10,
  weight: 3,
  expectedVersion: 1,
};
const malformedAddKr = {
  goalId: GOAL_ID,
  title: '',
  calculationMethod: 'Sum',
  targetValue: 10,
  weight: 3,
  expectedVersion: 1,
};

const validUpdateKr = { title: 'KR2', expectedVersion: 1 };
const malformedUpdateKr = { title: 'KR2', expectedVersion: 0 };

const validProgress = { keyResultId: KR_ID, expectedVersion: 1, newValue: 5 };
const malformedProgress = { keyResultId: KR_ID, expectedVersion: 0, newValue: 5 };

const validDeleteKr = { expectedVersion: 1 };
const malformedDeleteKr = { expectedVersion: 0 };

const validBatchWeights = {
  expectedVersion: 1,
  updates: [{ keyResultId: KR_ID, weight: 4 }],
};
const malformedBatchWeights = { expectedVersion: 0, updates: [] };

const validCreateReview = {
  expectedVersion: 1,
  reflection: 'Content',
  challenges: 'Challenge',
  adjustments: 'Next',
};
const malformedCreateReview = { expectedVersion: 1, reflection: '' };

const validUpdateReview = { reflection: 'R2', expectedVersion: 1 };
const malformedUpdateReview = { reflection: 'R2', expectedVersion: 0 };

const validCreateRecord = { keyResultId: KR_ID, expectedVersion: 1, value: 5 };
const malformedCreateRecord = { keyResultId: KR_ID, expectedVersion: 0, value: 5 };
const validUpdateRecord = { expectedVersion: 1, value: -2, note: 'corrected' };
const malformedUpdateRecord = { expectedVersion: 0, value: 2 };

describe('goal transport parity (Phase 4) — production registrations', () => {
  let instance: {
    api: GoalApplicationPort;
    start: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mocks.handlers.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
  });

  function buildHttp(port: GoalApplicationPort) {
    const controller = new GoalController(createGoalTransportHandlers(port));
    const routers = [
      ['goal', registerGoalCrudRoutes(controller, middleware, null)],
      ['key-result', registerKeyResultRoutes(controller, middleware, null)],
      ['review', registerReviewRoutes(controller, middleware, null)],
      ['record', registerRecordRoutes(controller, middleware, null)],
    ] as const;
    const map = new Map<string, (req: unknown, res: unknown) => Promise<unknown>>();
    for (const [ns, router] of routers) {
      const stack = (
        router as unknown as {
          stack: Array<{
            route?: {
              path: string;
              methods: Record<string, boolean>;
              stack: Array<{ handle: (r: unknown, s: unknown) => unknown }>;
            };
          }>;
        }
      ).stack;
      for (const layer of stack) {
        if (!layer.route) continue;
        for (const method of Object.keys(layer.route.methods)) {
          if (!layer.route.methods[method]) continue;
          const key = `${ns} ${method.toUpperCase()} ${layer.route.path}`;
          map.set(key, layer.route.stack.at(-1)!.handle);
        }
      }
    }
    return map;
  }

  function buildIpc(port: GoalApplicationPort) {
    instance = { api: port, start: vi.fn(), dispose: vi.fn() };
    const moduleDef = createGoalElectronModule({ instance });
    const context = {
      db: {},
      auth: { requireRequestContext: async () => fixtureContext },
    } as unknown as IElectronModuleContext;
    moduleDef.register(context);
    return mocks.handlers;
  }

  function makeReq(fixture: HttpFixture) {
    return {
      ...fixture,
      headers: {},
      user: { identityId: 'identity-1' },
      requestContext: fixtureContext,
    } as never;
  }

  async function runRow(port: GoalApplicationPort, spec: RowSpec) {
    const http = buildHttp(port);
    const ipc = buildIpc(port);
    const httpHandler = http.get(spec.httpKey);
    expect(httpHandler, `HTTP handler for '${spec.httpKey}' must exist`).toBeDefined();
    const httpRes = createRes();
    await httpHandler!(makeReq(spec.httpReq), httpRes);
    expect(httpRes.statusCode).toBe(spec.successStatus ?? 200);
    expect(httpRes.body.ok).toBe(true);

    if (spec.ipcChannel) {
      const ipcHandler = ipc.get(spec.ipcChannel);
      expect(ipcHandler, `IPC handler for '${spec.ipcChannel}' must exist`).toBeDefined();
      const ipcResult = await ipcHandler!({ sender: {}, senderFrame: {} }, ...spec.ipcArgs);
      expect(ipcResult.ok).toBe(true);
      // Response DATA parity, not just ok flags.
      expect(httpRes.body.data).toEqual((ipcResult as { data: unknown }).data);
    } else {
      // HTTP-only operation: the key-result progress IPC channel is explicitly
      // NOT registered (documented unsupported), so invoking it would fail.
      expect(
        [...ipc.keys()].some((channel) => channel === 'goal:keyResult:progress'),
        'key-result progress has no IPC channel',
      ).toBe(false);
    }

    spec.assertPort(port, spec.validInvocation);

    // Malformed input rejected by the adapter before the controller on both transports.
    const badHttpRes = createRes();
    await httpHandler!(makeReq(spec.malformedHttpReq), badHttpRes);
    expect(badHttpRes.statusCode).toBe(400);
    expect(badHttpRes.body.error.code).toBe('VALIDATION_ERROR');

    if (spec.ipcChannel) {
      const ipcHandler = ipc.get(spec.ipcChannel)!;
      const badIpcResult = await ipcHandler(
        { sender: {}, senderFrame: {} },
        ...spec.malformedIpcArgs,
      );
      expect(badIpcResult.ok).toBe(false);
      expect(badIpcResult.error?.code).toBe('VALIDATION_ERROR');
      // Error DETAILS parity, not just ok flags.
      expect(badIpcResult.error?.details).toEqual(badHttpRes.body.error.details);
    }
  }

  it.each<[string, RowSpec]>([
    [
      'create',
      {
        httpKey: 'goal POST /',
        ipcChannel: GoalChannels.CREATE,
        successStatus: 201,
        httpReq: { body: validCreate },
        ipcArgs: [validCreate],
        validInvocation: validCreate,
        malformedHttpReq: { body: malformedCreate },
        malformedIpcArgs: [malformedCreate],
        assertPort: (port, expected) => {
          const mock = port.createGoal as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toEqual(expected);
            expect(call[1].identityId).toBe('identity-1');
          }
        },
      },
    ],
    [
      'update',
      {
        httpKey: 'goal PUT /:id',
        ipcChannel: GoalChannels.UPDATE,
        httpReq: { params: { id: GOAL_ID }, body: validUpdateBody },
        ipcArgs: [GOAL_ID, validUpdateBody],
        validInvocation: { params: { id: GOAL_ID }, body: validUpdateBody },
        malformedHttpReq: { params: { id: GOAL_ID }, body: malformedUpdateBody },
        malformedIpcArgs: [GOAL_ID, malformedUpdateBody],
        assertPort: (port, expected) => {
          const mock = port.updateGoal as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe((expected as { params: { id: string } }).params.id);
            expect(call[1]).toBe('identity-1');
            expect(call[2]).toEqual((expected as { body: never }).body);
          }
        },
      },
    ],
    [
      'delete',
      {
        httpKey: 'goal DELETE /:id',
        ipcChannel: GoalChannels.DELETE,
        httpReq: { params: { id: GOAL_ID }, query: { expectedVersion: 1 } },
        ipcArgs: [GOAL_ID, { expectedVersion: 1 }],
        validInvocation: { params: { id: GOAL_ID }, query: { expectedVersion: 1 } },
        malformedHttpReq: { params: { id: GOAL_ID }, query: malformedVersionCommand },
        malformedIpcArgs: [GOAL_ID, malformedVersionCommand],
        assertPort: (port, expected) => {
          const mock = port.deleteGoal as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe((expected as { params: { id: string } }).params.id);
            expect(call[1]).toBe('identity-1');
            expect(call[2]).toBe(
              (expected as { query: { expectedVersion: number } }).query.expectedVersion,
            );
          }
        },
      },
    ],
    [
      'archive',
      {
        httpKey: 'goal POST /:id/archive',
        ipcChannel: GoalChannels.ARCHIVE,
        httpReq: { params: { id: GOAL_ID }, body: validVersionCommand },
        ipcArgs: [GOAL_ID, validVersionCommand],
        validInvocation: { params: { id: GOAL_ID }, body: validVersionCommand },
        malformedHttpReq: { params: { id: GOAL_ID }, body: malformedVersionCommand },
        malformedIpcArgs: [GOAL_ID, malformedVersionCommand],
        assertPort: (port) => {
          const mock = port.archiveGoal as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[1]).toBe('identity-1');
            expect(call[2]).toBe(1);
          }
        },
      },
    ],
    [
      'plan',
      {
        httpKey: 'goal POST /:id/plan',
        ipcChannel: GoalChannels.PLAN,
        httpReq: { params: { id: GOAL_ID }, body: validVersionCommand },
        ipcArgs: [GOAL_ID, validVersionCommand],
        validInvocation: { params: { id: GOAL_ID }, body: validVersionCommand },
        malformedHttpReq: { params: { id: GOAL_ID }, body: malformedVersionCommand },
        malformedIpcArgs: [GOAL_ID, malformedVersionCommand],
        assertPort: (port) => {
          const mock = port.planGoal as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[1]).toBe('identity-1');
            expect(call[2]).toBe(1);
          }
        },
      },
    ],
    [
      'abandon',
      {
        httpKey: 'goal POST /:id/abandon',
        ipcChannel: GoalChannels.ABANDON,
        httpReq: { params: { id: GOAL_ID }, body: validVersionCommand },
        ipcArgs: [GOAL_ID, validVersionCommand],
        validInvocation: { params: { id: GOAL_ID }, body: validVersionCommand },
        malformedHttpReq: { params: { id: GOAL_ID }, body: malformedVersionCommand },
        malformedIpcArgs: [GOAL_ID, malformedVersionCommand],
        assertPort: (port) => {
          const mock = port.abandonGoal as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[1]).toBe('identity-1');
            expect(call[2]).toBe(1);
          }
        },
      },
    ],
    [
      'activate',
      {
        httpKey: 'goal POST /:id/activate',
        ipcChannel: GoalChannels.ACTIVATE,
        httpReq: { params: { id: GOAL_ID }, body: validVersionCommand },
        ipcArgs: [GOAL_ID, validVersionCommand],
        validInvocation: { params: { id: GOAL_ID }, body: validVersionCommand },
        malformedHttpReq: { params: { id: GOAL_ID }, body: malformedVersionCommand },
        malformedIpcArgs: [GOAL_ID, malformedVersionCommand],
        assertPort: (port) => {
          const mock = port.activateGoal as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[1]).toBe('identity-1');
            expect(call[2]).toBe(1);
          }
        },
      },
    ],
    [
      'complete',
      {
        httpKey: 'goal POST /:id/complete',
        ipcChannel: GoalChannels.COMPLETE,
        httpReq: { params: { id: GOAL_ID }, body: validVersionCommand },
        ipcArgs: [GOAL_ID, validVersionCommand],
        validInvocation: { params: { id: GOAL_ID }, body: validVersionCommand },
        malformedHttpReq: { params: { id: GOAL_ID }, body: malformedVersionCommand },
        malformedIpcArgs: [GOAL_ID, malformedVersionCommand],
        assertPort: (port) => {
          const mock = port.completeGoal as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[1]).toBe('identity-1');
            expect(call[2]).toBe(1);
          }
        },
      },
    ],
    [
      'clone',
      {
        httpKey: 'goal POST /:id/clone',
        ipcChannel: GoalChannels.CLONE,
        successStatus: 201,
        httpReq: { params: { id: GOAL_ID }, body: validClone },
        ipcArgs: [GOAL_ID, validClone],
        validInvocation: { params: { id: GOAL_ID }, body: validClone },
        malformedHttpReq: { params: { id: GOAL_ID }, body: malformedClone },
        malformedIpcArgs: [GOAL_ID, malformedClone],
        assertPort: (port) => {
          const mock = port.cloneGoal as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
          }
        },
      },
    ],
    [
      'key-result add',
      {
        httpKey: 'key-result POST /:id/key-results',
        successStatus: 201,
        ipcChannel: GoalChannels.KEY_RESULT_ADD,
        httpReq: { params: { id: GOAL_ID }, body: validAddKr },
        ipcArgs: [GOAL_ID, validAddKr],
        validInvocation: { params: { id: GOAL_ID }, body: validAddKr },
        malformedHttpReq: { params: { id: GOAL_ID }, body: malformedAddKr },
        malformedIpcArgs: [GOAL_ID, malformedAddKr],
        assertPort: (port) => {
          const mock = port.addKeyResult as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[1]).toBe('identity-1');
          }
        },
      },
    ],
    [
      'key-result update',
      {
        httpKey: 'key-result PUT /:id/key-results/:krId',
        ipcChannel: GoalChannels.KEY_RESULT_UPDATE,
        httpReq: { params: { id: GOAL_ID, krId: KR_ID }, body: validUpdateKr },
        ipcArgs: [GOAL_ID, KR_ID, validUpdateKr],
        validInvocation: { params: { id: GOAL_ID, krId: KR_ID }, body: validUpdateKr },
        malformedHttpReq: { params: { id: GOAL_ID, krId: KR_ID }, body: malformedUpdateKr },
        malformedIpcArgs: [GOAL_ID, KR_ID, malformedUpdateKr],
        assertPort: (port) => {
          const mock = port.updateKeyResult as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[2]).toBe(KR_ID);
          }
        },
      },
    ],
    [
      'key-result progress (HTTP-only)',
      {
        httpKey: 'key-result PATCH /:id/key-results/:krId/progress',
        ipcChannel: null,
        httpReq: { params: { id: GOAL_ID, krId: KR_ID }, body: validProgress },
        ipcArgs: [],
        validInvocation: { params: { id: GOAL_ID, krId: KR_ID }, body: validProgress },
        malformedHttpReq: { params: { id: GOAL_ID, krId: KR_ID }, body: malformedProgress },
        malformedIpcArgs: [],
        assertPort: (port) => {
          const mock = port.updateKeyResultProgress as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(1);
          expect(mock.mock.calls[0][0]).toBe(GOAL_ID);
          expect(mock.mock.calls[0][2]).toBe(KR_ID);
        },
      },
    ],
    [
      'key-result delete',
      {
        httpKey: 'key-result DELETE /:id/key-results/:krId',
        ipcChannel: GoalChannels.KEY_RESULT_DELETE,
        httpReq: { params: { id: GOAL_ID, krId: KR_ID }, query: validDeleteKr },
        ipcArgs: [GOAL_ID, KR_ID, validDeleteKr],
        validInvocation: { params: { id: GOAL_ID, krId: KR_ID }, query: validDeleteKr },
        malformedHttpReq: { params: { id: GOAL_ID, krId: KR_ID }, query: malformedDeleteKr },
        malformedIpcArgs: [GOAL_ID, KR_ID, malformedDeleteKr],
        assertPort: (port) => {
          const mock = port.deleteKeyResult as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[2]).toBe(KR_ID);
          }
        },
      },
    ],
    [
      'key-result batch weights',
      {
        httpKey: 'goal PUT /:id/key-results/batch-weight',
        ipcChannel: GoalChannels.KEY_RESULT_BATCH_UPDATE_WEIGHTS,
        httpReq: { params: { id: GOAL_ID }, body: validBatchWeights },
        ipcArgs: [GOAL_ID, validBatchWeights],
        validInvocation: { params: { id: GOAL_ID }, body: validBatchWeights },
        malformedHttpReq: { params: { id: GOAL_ID }, body: malformedBatchWeights },
        malformedIpcArgs: [GOAL_ID, malformedBatchWeights],
        assertPort: (port) => {
          const mock = port.batchUpdateKeyResultWeights as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
          }
        },
      },
    ],
    [
      'review create',
      {
        httpKey: 'review POST /:id/reviews',
        successStatus: 201,
        ipcChannel: GoalChannels.REVIEW_CREATE,
        httpReq: { params: { id: GOAL_ID }, body: validCreateReview },
        ipcArgs: [GOAL_ID, validCreateReview],
        validInvocation: { params: { id: GOAL_ID }, body: validCreateReview },
        malformedHttpReq: { params: { id: GOAL_ID }, body: malformedCreateReview },
        malformedIpcArgs: [GOAL_ID, malformedCreateReview],
        assertPort: (port) => {
          const mock = port.addReview as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
          }
        },
      },
    ],
    [
      'review context',
      {
        httpKey: 'review GET /:id/reviews/context',
        ipcChannel: GoalChannels.REVIEW_CONTEXT,
        httpReq: { params: { id: GOAL_ID }, query: { windowDays: '7' } },
        ipcArgs: [GOAL_ID, 7],
        validInvocation: { params: { id: GOAL_ID }, query: { windowDays: 7 } },
        malformedHttpReq: { params: { id: GOAL_ID }, query: { windowDays: 0 } },
        malformedIpcArgs: [GOAL_ID, 0],
        assertPort: (port) => {
          const mock = port.getReviewContext as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[1]).toBe('identity-1');
            expect(call[2]).toBe(7);
          }
        },
      },
    ],
    [
      'review update',
      {
        httpKey: 'review PUT /:id/reviews/:reviewId',
        ipcChannel: GoalChannels.REVIEW_UPDATE,
        httpReq: { params: { id: GOAL_ID, reviewId: REVIEW_ID }, body: validUpdateReview },
        ipcArgs: [GOAL_ID, REVIEW_ID, validUpdateReview],
        validInvocation: { params: { id: GOAL_ID, reviewId: REVIEW_ID }, body: validUpdateReview },
        malformedHttpReq: {
          params: { id: GOAL_ID, reviewId: REVIEW_ID },
          body: malformedUpdateReview,
        },
        malformedIpcArgs: [GOAL_ID, REVIEW_ID, malformedUpdateReview],
        assertPort: (port) => {
          const mock = port.updateReview as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[2]).toBe(REVIEW_ID);
          }
        },
      },
    ],
    [
      'review delete',
      {
        httpKey: 'review DELETE /:id/reviews/:reviewId',
        ipcChannel: GoalChannels.REVIEW_DELETE,
        httpReq: { params: { id: GOAL_ID, reviewId: REVIEW_ID }, query: validVersionCommand },
        ipcArgs: [GOAL_ID, REVIEW_ID, validVersionCommand],
        validInvocation: {
          params: { id: GOAL_ID, reviewId: REVIEW_ID },
          query: validVersionCommand,
        },
        malformedHttpReq: {
          params: { id: GOAL_ID, reviewId: REVIEW_ID },
          query: malformedVersionCommand,
        },
        malformedIpcArgs: [GOAL_ID, REVIEW_ID, malformedVersionCommand],
        assertPort: (port) => {
          const mock = port.deleteReview as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[2]).toBe(REVIEW_ID);
          }
        },
      },
    ],
    [
      'record create',
      {
        httpKey: 'record POST /:id/key-results/:krId/records',
        successStatus: 201,
        ipcChannel: GoalChannels.RECORD_CREATE,
        httpReq: { params: { id: GOAL_ID, krId: KR_ID }, body: validCreateRecord },
        ipcArgs: [GOAL_ID, KR_ID, validCreateRecord],
        validInvocation: { params: { id: GOAL_ID, krId: KR_ID }, body: validCreateRecord },
        malformedHttpReq: { params: { id: GOAL_ID, krId: KR_ID }, body: malformedCreateRecord },
        malformedIpcArgs: [GOAL_ID, KR_ID, malformedCreateRecord],
        assertPort: (port) => {
          const mock = port.createRecord as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[1]).toBe(KR_ID);
          }
        },
      },
    ],
    [
      'record update',
      {
        httpKey: 'record PUT /:id/key-results/:krId/records/:recordId',
        ipcChannel: GoalChannels.RECORD_UPDATE,
        httpReq: {
          params: { id: GOAL_ID, krId: KR_ID, recordId: RECORD_ID },
          body: validUpdateRecord,
        },
        ipcArgs: [GOAL_ID, KR_ID, RECORD_ID, validUpdateRecord],
        validInvocation: {
          params: { id: GOAL_ID, krId: KR_ID, recordId: RECORD_ID },
          body: validUpdateRecord,
        },
        malformedHttpReq: {
          params: { id: GOAL_ID, krId: KR_ID, recordId: RECORD_ID },
          body: malformedUpdateRecord,
        },
        malformedIpcArgs: [GOAL_ID, KR_ID, RECORD_ID, malformedUpdateRecord],
        assertPort: (port) => {
          const mock = port.updateRecord as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[1]).toBe(KR_ID);
            expect(call[2]).toBe(RECORD_ID);
          }
        },
      },
    ],
    [
      'record delete',
      {
        httpKey: 'record DELETE /:id/key-results/:krId/records/:recordId',
        ipcChannel: GoalChannels.RECORD_DELETE,
        httpReq: {
          params: { id: GOAL_ID, krId: KR_ID, recordId: RECORD_ID },
          query: validVersionCommand,
        },
        ipcArgs: [GOAL_ID, KR_ID, RECORD_ID, validVersionCommand],
        validInvocation: {
          params: { id: GOAL_ID, krId: KR_ID, recordId: RECORD_ID },
          query: validVersionCommand,
        },
        malformedHttpReq: {
          params: { id: GOAL_ID, krId: KR_ID, recordId: RECORD_ID },
          query: malformedVersionCommand,
        },
        malformedIpcArgs: [GOAL_ID, KR_ID, RECORD_ID, malformedVersionCommand],
        assertPort: (port) => {
          const mock = port.deleteRecord as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(GOAL_ID);
            expect(call[1]).toBe(KR_ID);
            expect(call[2]).toBe(RECORD_ID);
          }
        },
      },
    ],
  ])(
    'goal %s: HTTP and IPC reach the same port method with equivalent input',
    async (name, row) => {
      const port = createPortStub();
      await runRow(port, row);
    },
  );
});
