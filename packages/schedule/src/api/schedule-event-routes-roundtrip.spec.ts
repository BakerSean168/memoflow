import express from 'express';
import request from 'supertest';
import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type { ScheduleEventApplicationPort } from '../server/application';
import { registerScheduleEventRoutes } from './schedule-event.routes';

const authMiddleware: RequestHandler = (req, _res, next) => {
  (req as { user?: unknown }).user = { identityId: 'roundtrip-user' };
  next();
};

function createApp(port: ScheduleEventApplicationPort) {
  const app = express();
  app.use(express.json());
  // Simulate the API RequestContext middleware (expressAdapter fails closed
  // without a producer-owned carrier).
  app.use((req, _res, next) => {
    (req as { requestContext?: unknown }).requestContext = {
      requestId: 'req-schedule-roundtrip',
      traceId: 'req-schedule-roundtrip',
      startedAt: 1_700_000_000_000,
      source: 'http',
    };
    next();
  });
  app.use(
    '/schedules/events',
    registerScheduleEventRoutes(port, {
      auth: authMiddleware,
      requireRole: () => authMiddleware,
    }),
  );
  return app;
}

function createStubPort(overrides: Partial<ScheduleEventApplicationPort> = {}) {
  return {
    createEvent: vi.fn(),
    getEvent: vi.fn(),
    listEvents: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
    getConflicts: vi.fn(),
    detectConflicts: vi.fn(),
    createEventWithConflictDetection: vi.fn(),
    resolveConflict: vi.fn(),
    ...overrides,
  } as unknown as ScheduleEventApplicationPort;
}

describe('Schedule event DELETE HTTP round-trip contract (real Express handler)', () => {
  it('rejects a DELETE without expectedVersion with a 422 validation envelope', async () => {
    const app = createApp(createStubPort());

    const res = await request(app).delete('/schedules/events/schedule-1').send({});

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      ok: false,
      code: 422,
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('passes the numeric expectedVersion from the JSON body through to controller.deleteEvent', async () => {
    const deleteSpy = vi.fn().mockResolvedValue(ok(null));
    const port = createStubPort({ deleteEvent: deleteSpy });
    const app = createApp(port);

    const res = await request(app)
      .delete('/schedules/events/schedule-1')
      .send({ expectedVersion: 4 });

    expect(res.status).toBe(200);
    expect(deleteSpy).toHaveBeenCalledWith('schedule-1', expect.anything(), 4);
  });

  it('preserves currentVersion in the 409 CONFLICT receipt', async () => {
    const port = createStubPort({
      deleteEvent: vi.fn().mockResolvedValue(
        fail({
          code: 'CONFLICT',
          message: '版本冲突',
          context: { currentVersion: 2, expectedVersion: 1 },
        }),
      ),
    });
    const app = createApp(port);

    const res = await request(app)
      .delete('/schedules/events/schedule-1')
      .send({ expectedVersion: 1 });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      ok: false,
      code: 409,
      error: {
        code: 'CONFLICT',
        context: { currentVersion: 2, expectedVersion: 1 },
      },
    });
    // currentVersion must be a required, structured field on the receipt.
    expect(res.body.error.context.currentVersion).toBe(2);
  });
});
