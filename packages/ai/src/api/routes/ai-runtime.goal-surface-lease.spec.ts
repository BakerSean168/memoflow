import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { registerAIRuntimeRoutes } from './ai-runtime.routes';

describe('Goal native surface lease authenticated HTTP transport', () => {
  function makeApp(identityId: string | null = 'owner-1') {
    const goalSurfaceLease = vi.fn(async () => ({
      status: 'claimed' as const,
      token: '11111111-1111-4111-8111-111111111111',
      fence: 3,
      expiresAt: Date.now() + 30_000,
    }));
    const app = express();
    app.use(express.json());
    app.use(
      '/ai/runtime',
      registerAIRuntimeRoutes(
        null,
        {
          auth: (req, _res, next) => {
            if (identityId)
              (req as typeof req & { user: { identityId: string } }).user = { identityId };
            next();
          },
        },
        { goalSurfaceLease } as never,
      ),
    );
    return { app, goalSurfaceLease };
  }

  it('gets the identity from the authenticated request, not a client field', async () => {
    const { app, goalSurfaceLease } = makeApp();
    const response = await request(app)
      .post('/ai/runtime/workflow/goal-surface-lease')
      .send({ action: 'claim', runId: 'run-1' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'claimed',
      fence: 3,
    });
    expect(goalSurfaceLease).toHaveBeenCalledExactlyOnceWith({
      identityId: 'owner-1',
      request: { action: 'claim', runId: 'run-1' },
    });
  });

  it('rejects spoofed identity, malformed token and unauthenticated requests', async () => {
    const { app, goalSurfaceLease } = makeApp();
    const spoofed = await request(app)
      .post('/ai/runtime/workflow/goal-surface-lease')
      .send({ action: 'claim', runId: 'run-1', identityId: 'other' });
    expect(spoofed.status).toBe(400);
    const invalid = await request(app)
      .post('/ai/runtime/workflow/goal-surface-lease')
      .send({ action: 'renew', runId: 'run-1', token: 'not-a-token', fence: 1 });
    expect(invalid.status).toBe(400);
    expect(goalSurfaceLease).not.toHaveBeenCalled();

    const unauthenticated = makeApp(null);
    const missing = await request(unauthenticated.app)
      .post('/ai/runtime/workflow/goal-surface-lease')
      .send({ action: 'claim', runId: 'run-1' });
    expect(missing.status).toBe(401);
    expect(unauthenticated.goalSurfaceLease).not.toHaveBeenCalled();
  });
});
