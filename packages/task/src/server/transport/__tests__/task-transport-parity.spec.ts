/**
 * Task transport parity spec (Phase 4).
 *
 * Every Task mutation ledger row is fed the SAME canonical fixture through the
 * PRODUCTION route registrations (registerTaskPlanRoutes /
 * registerTaskOccurrenceRoutes) and the
 * PRODUCTION IPC registrations (createTaskElectronModule). Both hosts consume
 * the same `TaskApplicationPort` stub, so parity is proven by construction:
 * production projectors + production controllers call the same port method
 * with equivalent input, and the HTTP/IPC envelopes carry the same response
 * data and error details. Malformed fixtures are rejected by the adapter
 * before the controller on both transports.
 *
 * 每个 Task mutation ledger 行都用同一 canonical fixture 走生产 route 注册
 * （registerTaskPlanRoutes / registerTaskOccurrenceRoutes）与生产 IPC 注册
 * （createTaskElectronModule）。
 * 两条宿主消费同一个 `TaskApplicationPort` stub，因此 parity 由构造保证：生产
 * projector + 生产 controller 以等价输入调用同一 port 方法，HTTP/IPC envelope
 * 携带相同的响应 data 与 error details。malformed fixture 在两条 transport 上
 * 都由 adapter 在 controller 前拒绝。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { RequestHandler } from 'express';
import { TaskChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import { TaskGoalBindingTrigger } from '@memoflow/contracts/task';
import type { ExecutionContext, RequestContext } from '@memoflow/contracts/shared';
import type { TaskApplicationPort } from '../../application';
import { createTaskTransportHandlers } from '..';
import { TaskPlanController } from '../task-plan.controller';
import { TaskOccurrenceController } from '../task-occurrence.controller';
import { registerTaskPlanRoutes } from '../../../api/routes/task-plan.routes';
import { registerTaskOccurrenceRoutes } from '../../../api/routes/task-occurrence.routes';
import { createTaskElectronModule } from '../../../electron';

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
  requestId: 'req-task-parity',
  traceId: 'req-task-parity',
  startedAt: 1_700_000_000_000,
  source: 'ipc',
};

const fixtureContext: ExecutionContext = {
  ...CARRIER,
  identityId: 'identity-1',
  deviceId: 'desktop-app',
};

const TEMPLATE_ID = 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440000';
const INSTANCE_ID = 'ITaskOccurrenceId_550e8400-e29b-41d4-a716-446655440001';
const GOAL_ID = 'IGoalId_550e8400-e29b-41d4-a716-446655440003';
const KR_ID = 'IKeyResultId_550e8400-e29b-41d4-a716-446655440004';

const FAKE_TEMPLATE = { id: TEMPLATE_ID, name: 'Template', status: 'Active' };
const FAKE_INSTANCE = { id: INSTANCE_ID, status: 'Scheduled' };

function createPortStub(): TaskApplicationPort {
  const fn = (value: unknown) => vi.fn(async () => ({ ok: true as const, data: value }));
  return {
    createTaskPlan: fn(FAKE_TEMPLATE),
    updateTaskPlan: fn(FAKE_TEMPLATE),
    deleteTaskPlan: fn(null),
    activateTaskPlan: fn({ plan: FAKE_TEMPLATE }),
    pauseTaskPlan: fn({ plan: FAKE_TEMPLATE }),
    archiveTaskPlan: fn(FAKE_TEMPLATE),
    abandonTaskPlan: fn(FAKE_TEMPLATE),
    generateTaskOccurrences: fn([FAKE_INSTANCE]),
    bindTaskToGoal: fn(FAKE_TEMPLATE),
    unbindTaskFromGoal: fn(FAKE_TEMPLATE),
    completeTaskOccurrence: fn({ occurrence: FAKE_INSTANCE }),
    uncompleteTaskOccurrence: fn({ occurrence: FAKE_INSTANCE }),
    skipTaskOccurrence: fn({ occurrence: FAKE_INSTANCE }),
    markTaskOccurrenceMissed: fn({ occurrence: FAKE_INSTANCE }),
    startTaskOccurrence: fn(FAKE_INSTANCE),
    deleteTaskOccurrence: fn(null),
    rescheduleTaskOccurrence: fn(FAKE_INSTANCE),
    setTaskOccurrenceChecklistItem: fn({ occurrence: FAKE_INSTANCE }),
    getTaskPlan: vi.fn(),
    listTaskPlans: vi.fn(),
    listTaskOccurrencesByPlan: vi.fn(),
    getTaskOccurrence: vi.fn(),
    listTaskOccurrencesByAccount: vi.fn(),
    listTaskOccurrencesByStatus: vi.fn(),
    getTaskOccurrencesByDateRange: vi.fn(),
  } as unknown as TaskApplicationPort;
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
  /** Production HTTP handler lookup key: `${ns} ${method.toUpperCase()} ${path}`. */
  readonly httpKey: string;
  /** Production IPC channel name. */
  readonly ipcChannel: string;
  /** HTTP success status for the valid fixture (plan create is 201). */
  readonly successStatus?: number;
  /** Raw wire request fixture (body/params/query). */
  readonly httpReq: HttpFixture;
  /** Raw single IPC payload for the valid fixture. */
  readonly ipcArgs: unknown;
  /** Asserts the port method was called TWICE (HTTP + IPC) with equivalent args. */
  readonly assertPort: (port: TaskApplicationPort, expected: unknown) => void;
  /** Raw wire request fixture that must fail schema validation on HTTP. */
  readonly malformedHttpReq: HttpFixture;
  /** Raw single IPC payload that must fail schema validation on IPC. */
  readonly malformedIpcArgs: unknown;
  /** Canonical invocation both transports must produce (for assertion). */
  readonly validInvocation: unknown;
}

const validCreateTemplate = {
  name: 'My Task',
  schedule: { kind: 'OneTime', date: '2026-09-08', timing: { kind: 'AllDay' } },
  importance: 'Moderate',
};
const malformedCreateTemplate = { name: '' };

const validUpdateTemplate = { name: 'Updated Name' };
const malformedUpdateTemplate = { name: '' };

const validGenerate = { fromDate: 1_700_000_000_000, toDate: 1_700_000_086_400 };
const malformedGenerate = { fromDate: 'not-a-number', toDate: 1_700_000_086_400 };

const validBindGoal = {
  goalId: GOAL_ID,
  keyResultId: KR_ID,
  contribution: { value: 1, trigger: TaskGoalBindingTrigger.EachCompletion },
};
const malformedBindGoal = {
  goalId: GOAL_ID,
  keyResultId: KR_ID,
  contribution: { value: -1, trigger: TaskGoalBindingTrigger.EachCompletion },
};

const validComplete = { duration: 30, rating: 5 };
const malformedComplete = { rating: 99 };

const validSkip = { reason: 'Too tired' };
const malformedSkip = { reason: 42 };

const validChecklistItem = {
  definitionId: 'check-1',
  completed: true,
  expectedVersion: 3,
};
const malformedChecklistItem = {
  definitionId: '',
  completed: 'yes',
  expectedVersion: 0,
};

const validReschedule = {
  scheduleSnapshot: {
    date: '2026-08-28',
    timing: { kind: 'At' as const, time: '16:00' },
  },
  expectedVersion: 3,
};
const malformedReschedule = {
  // TASK-7306 anti-resurrection: the old TaskTimeConfig command shape is rejected.
  newTime: {
    timeType: 'TimePoint' as const,
    startDate: 1_787_860_800_000,
    timePoint: 16 * 60,
    timeRange: null,
  },
  expectedVersion: 3,
};

describe('task transport parity (Phase 4) — production registrations', () => {
  beforeEach(() => {
    mocks.handlers.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
  });

  function buildHttp(port: TaskApplicationPort) {
    const handlers = createTaskTransportHandlers(port);
    const templateController = new TaskPlanController(handlers.plan);
    const instanceController = new TaskOccurrenceController(handlers.occurrence);
    const routers = [
      ['plan', registerTaskPlanRoutes(templateController, middleware, null)],
      ['occurrence', registerTaskOccurrenceRoutes(instanceController, middleware, null)],
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

  async function buildIpc(port: TaskApplicationPort) {
    const instance = { api: port, start: vi.fn(), dispose: vi.fn() };
    const moduleDef = createTaskElectronModule({ instance });
    const context = {
      db: {},
      auth: { requireRequestContext: async () => fixtureContext },
    } as unknown as IElectronModuleContext;
    await moduleDef.register(context);
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

  async function runRow(port: TaskApplicationPort, spec: RowSpec) {
    const http = buildHttp(port);
    const ipc = await buildIpc(port);
    const httpHandler = http.get(spec.httpKey);
    expect(httpHandler, `HTTP handler for '${spec.httpKey}' must exist`).toBeDefined();
    const httpRes = createRes();
    await httpHandler!(makeReq(spec.httpReq), httpRes);
    expect(httpRes.statusCode).toBe(spec.successStatus ?? 200);
    expect(httpRes.body.ok).toBe(true);

    const ipcHandler = ipc.get(spec.ipcChannel);
    expect(ipcHandler, `IPC handler for '${spec.ipcChannel}' must exist`).toBeDefined();
    const ipcResult = await ipcHandler!({ sender: {}, senderFrame: {} }, spec.ipcArgs);
    expect(ipcResult.ok).toBe(true);
    // Response DATA parity, not just ok flags.
    expect(httpRes.body.data).toEqual((ipcResult as { data: unknown }).data);

    spec.assertPort(port, spec.validInvocation);

    // Malformed input rejected by the adapter before the controller on both transports.
    const badHttpRes = createRes();
    await httpHandler!(makeReq(spec.malformedHttpReq), badHttpRes);
    expect(badHttpRes.statusCode).toBe(400);
    expect(badHttpRes.body.error.code).toBe('VALIDATION_ERROR');

    const badIpcResult = await ipcHandler({ sender: {}, senderFrame: {} }, spec.malformedIpcArgs);
    expect(badIpcResult.ok).toBe(false);
    expect(badIpcResult.error?.code).toBe('VALIDATION_ERROR');
    // Error DETAILS parity, not just ok flags.
    expect(badIpcResult.error?.details).toEqual(badHttpRes.body.error.details);
  }

  describe('task plan mutations', () => {
    it.each<[string, RowSpec]>([
      [
        'plan create',
        {
          httpKey: 'plan POST /',
          ipcChannel: TaskChannels.PLAN_CREATE,
          successStatus: 201,
          httpReq: { body: validCreateTemplate },
          ipcArgs: validCreateTemplate,
          validInvocation: validCreateTemplate,
          malformedHttpReq: { body: malformedCreateTemplate },
          malformedIpcArgs: malformedCreateTemplate,
          assertPort: (port) => {
            const mock = port.createTaskPlan as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0].name).toEqual(validCreateTemplate.name);
              expect(call[0].identityId).toBe('identity-1');
            }
          },
        },
      ],
      [
        'plan update',
        {
          httpKey: 'plan PUT /:id',
          ipcChannel: TaskChannels.PLAN_UPDATE,
          httpReq: { params: { id: TEMPLATE_ID }, body: validUpdateTemplate },
          ipcArgs: { id: TEMPLATE_ID, request: validUpdateTemplate },
          validInvocation: { params: { id: TEMPLATE_ID }, body: validUpdateTemplate },
          malformedHttpReq: { params: { id: TEMPLATE_ID }, body: malformedUpdateTemplate },
          malformedIpcArgs: { id: TEMPLATE_ID, request: malformedUpdateTemplate },
          assertPort: (port) => {
            const mock = port.updateTaskPlan as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(TEMPLATE_ID);
              expect(call[1]).toBe('identity-1');
              expect(call[2]).toMatchObject(validUpdateTemplate);
            }
          },
        },
      ],
      [
        'plan delete',
        {
          httpKey: 'plan DELETE /:id',
          ipcChannel: TaskChannels.PLAN_DELETE,
          httpReq: { params: { id: TEMPLATE_ID } },
          ipcArgs: { id: TEMPLATE_ID },
          validInvocation: { params: { id: TEMPLATE_ID } },
          malformedHttpReq: { params: { id: 'bad' } },
          malformedIpcArgs: { id: 'bad' },
          assertPort: (port) => {
            const mock = port.deleteTaskPlan as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(TEMPLATE_ID);
            }
          },
        },
      ],
      [
        'plan activate',
        {
          httpKey: 'plan POST /:id/activate',
          ipcChannel: TaskChannels.PLAN_ACTIVATE,
          httpReq: { params: { id: TEMPLATE_ID } },
          ipcArgs: { id: TEMPLATE_ID },
          validInvocation: { params: { id: TEMPLATE_ID } },
          malformedHttpReq: { params: { id: 'bad' } },
          malformedIpcArgs: { id: 'bad' },
          assertPort: (port) => {
            const mock = port.activateTaskPlan as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(TEMPLATE_ID);
            }
          },
        },
      ],
      [
        'plan pause',
        {
          httpKey: 'plan POST /:id/pause',
          ipcChannel: TaskChannels.PLAN_PAUSE,
          httpReq: { params: { id: TEMPLATE_ID } },
          ipcArgs: { id: TEMPLATE_ID },
          validInvocation: { params: { id: TEMPLATE_ID } },
          malformedHttpReq: { params: { id: 'bad' } },
          malformedIpcArgs: { id: 'bad' },
          assertPort: (port) => {
            const mock = port.pauseTaskPlan as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(TEMPLATE_ID);
            }
          },
        },
      ],
      [
        'plan archive',
        {
          httpKey: 'plan POST /:id/archive',
          ipcChannel: TaskChannels.PLAN_ARCHIVE,
          httpReq: { params: { id: TEMPLATE_ID } },
          ipcArgs: { id: TEMPLATE_ID },
          validInvocation: { params: { id: TEMPLATE_ID } },
          malformedHttpReq: { params: { id: 'bad' } },
          malformedIpcArgs: { id: 'bad' },
          assertPort: (port) => {
            const mock = port.archiveTaskPlan as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(TEMPLATE_ID);
            }
          },
        },
      ],
      [
        'plan abandon',
        {
          httpKey: 'plan POST /:id/abandon',
          ipcChannel: TaskChannels.PLAN_ABANDON,
          httpReq: { params: { id: TEMPLATE_ID }, body: { reason: 'User stopped' } },
          ipcArgs: { id: TEMPLATE_ID, request: { reason: 'User stopped' } },
          validInvocation: { params: { id: TEMPLATE_ID }, body: { reason: 'User stopped' } },
          malformedHttpReq: { params: { id: 'bad' }, body: {} },
          malformedIpcArgs: { id: 'bad', request: {} },
          assertPort: (port) => {
            const mock = port.abandonTaskPlan as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(TEMPLATE_ID);
              expect(call[1]).toBe('identity-1');
              expect(call[2]).toEqual({ reason: 'User stopped' });
            }
          },
        },
      ],
      [
        'plan generate-occurrences',
        {
          httpKey: 'plan POST /:id/generate-occurrences',
          ipcChannel: TaskChannels.PLAN_GENERATE_OCCURRENCES,
          httpReq: { params: { id: TEMPLATE_ID }, body: validGenerate },
          ipcArgs: { planId: TEMPLATE_ID, request: validGenerate },
          validInvocation: { params: { id: TEMPLATE_ID }, body: validGenerate },
          malformedHttpReq: { params: { id: TEMPLATE_ID }, body: malformedGenerate },
          malformedIpcArgs: { planId: TEMPLATE_ID, request: malformedGenerate },
          assertPort: (port) => {
            const mock = port.generateTaskOccurrences as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(TEMPLATE_ID);
              expect(call[2]).toEqual(validGenerate);
            }
          },
        },
      ],
      [
        'plan bind-goal',
        {
          httpKey: 'plan POST /:id/bind-goal',
          ipcChannel: TaskChannels.PLAN_BIND_GOAL,
          httpReq: { params: { id: TEMPLATE_ID }, body: validBindGoal },
          ipcArgs: { planId: TEMPLATE_ID, request: validBindGoal },
          validInvocation: { params: { id: TEMPLATE_ID }, body: validBindGoal },
          malformedHttpReq: { params: { id: TEMPLATE_ID }, body: malformedBindGoal },
          malformedIpcArgs: { planId: TEMPLATE_ID, request: malformedBindGoal },
          assertPort: (port) => {
            const mock = port.bindTaskToGoal as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(TEMPLATE_ID);
              expect(call[2]).toMatchObject(validBindGoal);
            }
          },
        },
      ],
      [
        'plan unbind-goal',
        {
          httpKey: 'plan POST /:id/unbind-goal',
          ipcChannel: TaskChannels.PLAN_UNBIND_GOAL,
          httpReq: { params: { id: TEMPLATE_ID } },
          ipcArgs: { planId: TEMPLATE_ID },
          validInvocation: { params: { id: TEMPLATE_ID } },
          malformedHttpReq: { params: { id: 'bad' } },
          malformedIpcArgs: { planId: 'bad' },
          assertPort: (port) => {
            const mock = port.unbindTaskFromGoal as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(TEMPLATE_ID);
            }
          },
        },
      ],
    ])(
      'task %s: HTTP and IPC reach the same port method with equivalent input',
      async (name, row) => {
        const port = createPortStub();
        await runRow(port, row);
      },
    );
  });

  describe('task occurrence mutations', () => {
    it.each<[string, RowSpec]>([
      [
        'occurrence complete',
        {
          httpKey: 'occurrence POST /:id/complete',
          ipcChannel: TaskChannels.OCCURRENCE_COMPLETE,
          httpReq: { params: { id: INSTANCE_ID }, body: validComplete },
          ipcArgs: { id: INSTANCE_ID, request: validComplete },
          validInvocation: { params: { id: INSTANCE_ID }, body: validComplete },
          malformedHttpReq: { params: { id: INSTANCE_ID }, body: malformedComplete },
          malformedIpcArgs: { id: INSTANCE_ID, request: malformedComplete },
          assertPort: (port) => {
            const mock = port.completeTaskOccurrence as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(INSTANCE_ID);
              expect(call[2]).toMatchObject(validComplete);
            }
          },
        },
      ],
      [
        'occurrence skip',
        {
          httpKey: 'occurrence POST /:id/skip',
          ipcChannel: TaskChannels.OCCURRENCE_SKIP,
          httpReq: { params: { id: INSTANCE_ID }, body: validSkip },
          ipcArgs: { id: INSTANCE_ID, request: validSkip },
          validInvocation: { params: { id: INSTANCE_ID }, body: validSkip },
          malformedHttpReq: { params: { id: INSTANCE_ID }, body: malformedSkip },
          malformedIpcArgs: { id: INSTANCE_ID, request: malformedSkip },
          assertPort: (port) => {
            const mock = port.skipTaskOccurrence as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(INSTANCE_ID);
              expect(call[2]).toMatchObject(validSkip);
            }
          },
        },
      ],
      [
        'occurrence start',
        {
          httpKey: 'occurrence POST /:id/start',
          ipcChannel: TaskChannels.OCCURRENCE_CREATE,
          httpReq: { params: { id: INSTANCE_ID } },
          ipcArgs: { id: INSTANCE_ID },
          validInvocation: { params: { id: INSTANCE_ID } },
          malformedHttpReq: { params: { id: 'bad' } },
          malformedIpcArgs: { id: 'bad' },
          assertPort: (port) => {
            const mock = port.startTaskOccurrence as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(INSTANCE_ID);
            }
          },
        },
      ],
      [
        'occurrence delete',
        {
          httpKey: 'occurrence DELETE /:id',
          ipcChannel: TaskChannels.OCCURRENCE_DELETE,
          httpReq: { params: { id: INSTANCE_ID } },
          ipcArgs: { id: INSTANCE_ID },
          validInvocation: { params: { id: INSTANCE_ID } },
          malformedHttpReq: { params: { id: 'bad' } },
          malformedIpcArgs: { id: 'bad' },
          assertPort: (port) => {
            const mock = port.deleteTaskOccurrence as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(INSTANCE_ID);
            }
          },
        },
      ],
      [
        'occurrence uncomplete',
        {
          httpKey: 'occurrence POST /:id/uncomplete',
          ipcChannel: TaskChannels.OCCURRENCE_UNCOMPLETE,
          httpReq: { params: { id: INSTANCE_ID } },
          ipcArgs: { id: INSTANCE_ID },
          validInvocation: { params: { id: INSTANCE_ID } },
          malformedHttpReq: { params: { id: 'bad' } },
          malformedIpcArgs: { id: 'bad' },
          assertPort: (port) => {
            const mock = port.uncompleteTaskOccurrence as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(INSTANCE_ID);
            }
          },
        },
      ],
      [
        'occurrence checklist-set',
        {
          httpKey: 'occurrence POST /:id/checklist',
          ipcChannel: TaskChannels.OCCURRENCE_CHECKLIST_SET,
          httpReq: { params: { id: INSTANCE_ID }, body: validChecklistItem },
          ipcArgs: { id: INSTANCE_ID, request: validChecklistItem },
          validInvocation: { params: { id: INSTANCE_ID }, body: validChecklistItem },
          malformedHttpReq: { params: { id: INSTANCE_ID }, body: malformedChecklistItem },
          malformedIpcArgs: { id: INSTANCE_ID, request: malformedChecklistItem },
          assertPort: (port) => {
            const mock = port.setTaskOccurrenceChecklistItem as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(INSTANCE_ID);
              expect(call[1]).toBe('identity-1');
              expect(call[2]).toEqual(validChecklistItem);
            }
          },
        },
      ],
      [
        'occurrence reschedule',
        {
          httpKey: 'occurrence POST /:id/reschedule',
          ipcChannel: TaskChannels.OCCURRENCE_RESCHEDULE,
          httpReq: { params: { id: INSTANCE_ID }, body: validReschedule },
          ipcArgs: { occurrenceId: INSTANCE_ID, ...validReschedule },
          validInvocation: { params: { id: INSTANCE_ID }, body: validReschedule },
          malformedHttpReq: { params: { id: INSTANCE_ID }, body: malformedReschedule },
          malformedIpcArgs: { occurrenceId: INSTANCE_ID, ...malformedReschedule },
          assertPort: (port) => {
            const mock = port.rescheduleTaskOccurrence as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(INSTANCE_ID);
              expect(call[1]).toBe('identity-1');
              expect(call[2]).toEqual(validReschedule);
            }
          },
        },
      ],
      [
        'occurrence mark-missed',
        {
          httpKey: 'occurrence POST /:id/missed',
          ipcChannel: TaskChannels.OCCURRENCE_MARK_MISSED,
          httpReq: { params: { id: INSTANCE_ID }, body: { reason: 'No completion evidence' } },
          ipcArgs: { id: INSTANCE_ID, request: { reason: 'No completion evidence' } },
          validInvocation: {
            params: { id: INSTANCE_ID },
            body: { reason: 'No completion evidence' },
          },
          malformedHttpReq: { params: { id: 'bad' }, body: {} },
          malformedIpcArgs: { id: 'bad', request: {} },
          assertPort: (port) => {
            const mock = port.markTaskOccurrenceMissed as ReturnType<typeof vi.fn>;
            expect(mock).toHaveBeenCalledTimes(2);
            for (const call of mock.mock.calls) {
              expect(call[0]).toBe(INSTANCE_ID);
              expect(call[1]).toBe('identity-1');
              expect(call[2]).toEqual({ reason: 'No completion evidence' });
            }
          },
        },
      ],
    ])(
      'task %s: HTTP and IPC reach the same port method with equivalent input',
      async (name, row) => {
        const port = createPortStub();
        await runRow(port, row);
      },
    );
  });
});
