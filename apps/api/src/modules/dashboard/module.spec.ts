/**
 * Temporary Dashboard compatibility API module spec.
 *
 * HOME-1804 removes the durable cross-domain activity ledger lifecycle; this
 * module is now only a read-only transport adapter until HOME-1805 deletes it.
 */

import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@memoflow/contracts/dashboard';
import type { IApiModuleContext } from '../../shared/contracts/api-module.js';
import { composeDashboardApiModule } from './module';
import type { DashboardReadPort } from './dashboard-read-port';

function createFakeReadPort(): DashboardReadPort & { getDashboardData: ReturnType<typeof vi.fn> } {
  return {
    getDashboardData: vi.fn(async () => ({}) as unknown as DashboardData),
  };
}

function createContext(): IApiModuleContext {
  const router = Router();
  return {
    app: {} as IApiModuleContext['app'],
    router,
    middleware: {
      auth: (req, _res, next) => {
        (req as { user?: { identityId: string } }).user = { identityId: 'identity-1' };
        next();
      },
      requireRole: () => (_req, _res, next) => next(),
    },
  };
}

describe('composeDashboardApiModule (HOME-1804)', () => {
  it('mounts /dashboard/stats as a read-only compatibility route', async () => {
    const readPort = createFakeReadPort();
    const module = composeDashboardApiModule({ dashboardReadPort: readPort });
    const context = createContext();
    module.register(context);

    const expressApp = await import('express').then((m) => m.default());
    expressApp.use('/api', context.router);

    const res = await request(expressApp).get('/api/dashboard/stats');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(readPort.getDashboardData).toHaveBeenCalledWith('identity-1');
    expect(module.destroy).toBeUndefined();
  });

  it('registers without a database or lifecycle runtime in transport context', () => {
    const module = composeDashboardApiModule({ dashboardReadPort: createFakeReadPort() });
    const context = createContext() as IApiModuleContext & { db?: unknown };
    delete (context as Record<string, unknown>).db;

    expect(() => module.register(context)).not.toThrow();
  });
});
