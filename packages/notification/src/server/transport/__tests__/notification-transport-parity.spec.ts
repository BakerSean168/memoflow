/**
 * Notification transport parity spec (Phase 4).
 *
 * Every Notification mutation ledger row is fed the SAME canonical fixture
 * through the PRODUCTION route registration (registerNotificationRoutes) and
 * the PRODUCTION IPC registrations (createNotificationElectronModule). Both
 * hosts consume the same `NotificationInboxPort` stub, so parity is
 * proven by construction: production projectors + production controllers call
 * the same port method with equivalent input, and the HTTP/IPC envelopes carry
 * the same response data and error details. Malformed fixtures are rejected by
 * the adapter before the controller on both transports.
 *
 * HTTP-only operations (batch-read, cleanup) assert the IPC channel is NOT
 * registered (documented unsupported) instead of fabricating a host.
 *
 * 每个 Notification mutation ledger 行都用同一 canonical fixture 走生产 route
 * 注册（registerNotificationRoutes）与生产 IPC 注册
 * （createNotificationElectronModule）。两条宿主消费同一个
 * `NotificationInboxPort` stub，因此 parity 由构造保证：生产 projector +
 * 生产 controller 以等价输入调用同一 port 方法，HTTP/IPC envelope 携带相同的
 * 响应 data 与 error details。malformed fixture 在两条 transport 上都由
 * adapter 在 controller 前拒绝。
 *
 * HTTP-only 操作（batch-read、cleanup）断言 IPC 通道未注册（文档化
 * unsupported），而不是伪造一个宿主。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { RequestHandler } from 'express';
import { NotificationChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import type { ExecutionContext, RequestContext } from '@memoflow/contracts/shared';
import type { NotificationInboxPort, NotificationOperationsPort } from '../../application';
import { registerNotificationRoutes } from '../../../api/routes';
import { createNotificationElectronModule } from '../../../electron';

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
  requestId: 'req-notification-parity',
  traceId: 'req-notification-parity',
  startedAt: 1_700_000_000_000,
  source: 'ipc',
};

const fixtureContext: ExecutionContext = {
  ...CARRIER,
  identityId: 'identity-1',
  deviceId: 'desktop-app',
};

const NOTIFICATION_ID = 'INotificationId_550e8400-e29b-41d4-a716-446655440000';
const NOTIFICATION_ID_2 = 'INotificationId_550e8400-e29b-41d4-a716-446655440001';

const FAKE_NOTIFICATION = { id: NOTIFICATION_ID, title: 'Hi', isRead: false };

function createPortStub(): NotificationInboxPort {
  const fn = (value: unknown) => vi.fn(async () => ({ ok: true as const, data: value }));
  return {
    createNotification: fn(FAKE_NOTIFICATION),
    deleteNotification: fn(null),
    markAsRead: fn(FAKE_NOTIFICATION),
    markAllAsRead: fn(5),
    batchMarkAsRead: fn(3),
    batchDelete: fn({ deletedCount: 2 }),
    cleanupOldNotifications: fn({ deletedCount: 4 }),
    updatePreferences: fn({ globalChannels: { InApp: true } }),
    listNotifications: vi.fn(),
    getNotification: vi.fn(),
    getUnreadCount: vi.fn(),
    getPreferences: vi.fn(),
    queryDeadLetters: vi.fn(),
    replayDeadLetter: vi.fn(),
    getDeliveryReceipts: vi.fn(),
    getOperationTimeline: vi.fn(),
    getOperationAudit: vi.fn(),
  } as unknown as NotificationInboxPort;
}

function createOperationsStub(): NotificationOperationsPort {
  return {
    queryDeadLetters: vi.fn(async () => ({ ok: true, data: [] })),
    replayDeadLetter: vi.fn(async () => ({ ok: true, data: null })),
    getDeliveryReceipts: vi.fn(async () => ({ ok: true, data: [] })),
    getOperationTimeline: vi.fn(async () => ({ ok: true, data: [] })),
    getOperationAudit: vi.fn(async () => ({ ok: true, data: [] })),
  };
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
  /** HTTP success status for the valid fixture (create is 201). */
  readonly successStatus?: number;
  /** Raw wire request fixture (body/params/query). */
  readonly httpReq: HttpFixture;
  /** Raw single IPC payload for the valid fixture. */
  readonly ipcArgs: unknown;
  /** Asserts the port method was called TWICE (HTTP + IPC) with equivalent args. */
  readonly assertPort: (port: NotificationInboxPort, expected: unknown) => void;
  /** Raw wire request fixture that must fail schema validation on HTTP. */
  readonly malformedHttpReq: HttpFixture;
  /** Raw single IPC payload that must fail schema validation on IPC. */
  readonly malformedIpcArgs: unknown;
  /** Canonical invocation both transports must produce (for assertion). */
  readonly validInvocation: unknown;
}

const validCreate = { title: 'Reminder', content: 'Body', type: 'Reminder', category: 'Task' };
const malformedCreate = { title: '', content: '', type: 'Reminder', category: 'Task' };

const validBatch = { notificationIds: [NOTIFICATION_ID, NOTIFICATION_ID_2] };
const malformedBatch = { notificationIds: [] };

const validCleanup = { beforeDays: 30, category: 'Task' };
const malformedCleanup = { beforeDays: 0, category: 'Task' };

const validPreferences = {
  globalChannels: { InApp: true },
  workflowOverrides: { 'task.deadline': { Desktop: true } },
};
const malformedPreferences = {
  quietHours: { enabled: true, timeZone: 'Asia/Tokyo', weeklyWindows: [{ daysOfWeek: [9], start: '22:00', end: '08:00' }] },
};

describe('notification transport parity (Phase 4) — production registrations', () => {
  beforeEach(() => {
    mocks.handlers.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
  });

  function buildHttp(port: NotificationInboxPort) {
    const router = registerNotificationRoutes(port, createOperationsStub(), middleware, null);
    const map = new Map<string, (req: unknown, res: unknown) => Promise<unknown>>();
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
        const key = `${method.toUpperCase()} ${layer.route.path}`;
        map.set(key, layer.route.stack.at(-1)!.handle);
      }
    }
    return map;
  }

  function buildIpc(port: NotificationInboxPort) {
    const instance = { api: port, start: vi.fn(), dispose: vi.fn() };
    const moduleDef = createNotificationElectronModule({ instance });
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

  async function runRow(port: NotificationInboxPort, spec: RowSpec) {
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
      const ipcResult = await ipcHandler!({ sender: {}, senderFrame: {} }, spec.ipcArgs);
      expect(ipcResult.ok).toBe(true);
      // Response DATA parity, not just ok flags.
      expect(httpRes.body.data).toEqual((ipcResult as { data: unknown }).data);
    } else {
      // HTTP-only operation: the IPC channel must be explicitly absent.
      expect(
        ipc.has(
          spec.httpKey === 'POST /batch-read'
            ? 'notification:mark-as-read-batch'
            : 'notification:cleanup-old',
        ),
        `${spec.httpKey} has no IPC channel (documented unsupported)`,
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
      const badIpcResult = await ipcHandler({ sender: {}, senderFrame: {} }, spec.malformedIpcArgs);
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
        httpKey: 'POST /',
        ipcChannel: NotificationChannels.CREATE,
        successStatus: 201,
        httpReq: { body: validCreate },
        ipcArgs: validCreate,
        validInvocation: validCreate,
        malformedHttpReq: { body: malformedCreate },
        malformedIpcArgs: malformedCreate,
        assertPort: (port) => {
          const mock = port.createNotification as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toMatchObject(validCreate);
            expect(call[0].identityId).toBe('identity-1');
          }
        },
      },
    ],
    [
      'delete',
      {
        httpKey: 'DELETE /:id',
        ipcChannel: NotificationChannels.DELETE,
        httpReq: { params: { id: NOTIFICATION_ID } },
        ipcArgs: { id: NOTIFICATION_ID },
        validInvocation: { params: { id: NOTIFICATION_ID } },
        malformedHttpReq: { params: { id: 'bad' } },
        malformedIpcArgs: { id: 'bad' },
        assertPort: (port) => {
          const mock = port.deleteNotification as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(NOTIFICATION_ID);
            expect(call[1]).toBe('identity-1');
          }
        },
      },
    ],
    [
      'mark-read',
      {
        httpKey: 'PATCH /:id/read',
        ipcChannel: NotificationChannels.MARK_READ,
        httpReq: { params: { id: NOTIFICATION_ID } },
        ipcArgs: { id: NOTIFICATION_ID },
        validInvocation: { params: { id: NOTIFICATION_ID } },
        malformedHttpReq: { params: { id: 'bad' } },
        malformedIpcArgs: { id: 'bad' },
        assertPort: (port) => {
          const mock = port.markAsRead as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe(NOTIFICATION_ID);
            expect(call[1]).toBe('identity-1');
          }
        },
      },
    ],
    [
      'mark-all-read',
      {
        httpKey: 'PATCH /read-all',
        ipcChannel: NotificationChannels.MARK_ALL_READ,
        httpReq: {},
        ipcArgs: undefined,
        validInvocation: undefined,
        malformedHttpReq: { body: { unexpected: true } },
        malformedIpcArgs: { unexpected: true },
        assertPort: (port) => {
          const mock = port.markAllAsRead as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toBe('identity-1');
          }
        },
      },
    ],
    [
      'batch-read (HTTP-only)',
      {
        httpKey: 'POST /batch-read',
        ipcChannel: null,
        httpReq: { body: validBatch },
        ipcArgs: undefined,
        validInvocation: validBatch,
        malformedHttpReq: { body: malformedBatch },
        malformedIpcArgs: undefined,
        assertPort: (port) => {
          const mock = port.batchMarkAsRead as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(1);
          expect(mock.mock.calls[0][0]).toEqual(validBatch);
          expect(mock.mock.calls[0][1]).toBe('identity-1');
        },
      },
    ],
    [
      'batch-delete',
      {
        httpKey: 'POST /batch-delete',
        ipcChannel: NotificationChannels.CLEAR_ALL,
        httpReq: { body: validBatch },
        ipcArgs: [NOTIFICATION_ID, NOTIFICATION_ID_2],
        validInvocation: validBatch,
        malformedHttpReq: { body: malformedBatch },
        malformedIpcArgs: [],
        assertPort: (port) => {
          const mock = port.batchDelete as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toEqual(validBatch);
            expect(call[1]).toBe('identity-1');
          }
        },
      },
    ],
    [
      'cleanup (HTTP-only)',
      {
        httpKey: 'POST /cleanup',
        ipcChannel: null,
        httpReq: { body: validCleanup },
        ipcArgs: undefined,
        validInvocation: validCleanup,
        malformedHttpReq: { body: malformedCleanup },
        malformedIpcArgs: undefined,
        assertPort: (port) => {
          const mock = port.cleanupOldNotifications as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(1);
          expect(mock.mock.calls[0][0]).toMatchObject(validCleanup);
          expect(mock.mock.calls[0][0].identityId).toBe('identity-1');
        },
      },
    ],
    [
      'preferences update',
      {
        httpKey: 'PUT /preferences',
        ipcChannel: NotificationChannels.PREFERENCES_UPDATE,
        httpReq: { body: validPreferences },
        ipcArgs: validPreferences,
        validInvocation: validPreferences,
        malformedHttpReq: { body: malformedPreferences },
        malformedIpcArgs: malformedPreferences,
        assertPort: (port) => {
          const mock = port.updatePreferences as ReturnType<typeof vi.fn>;
          expect(mock).toHaveBeenCalledTimes(2);
          for (const call of mock.mock.calls) {
            expect(call[0]).toEqual(validPreferences);
            expect(call[1]).toBe('identity-1');
          }
        },
      },
    ],
  ])(
    'notification %s: HTTP and IPC reach the same port method with equivalent input',
    async (name, row) => {
      const port = createPortStub();
      await runRow(port, row);
    },
  );
});
