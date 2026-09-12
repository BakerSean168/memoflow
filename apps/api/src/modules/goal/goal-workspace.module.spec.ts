import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { IApiModuleContext } from '../../shared/contracts/api-module.js';
import { composeGoalWorkspaceApiModule } from './goal-workspace.module';

const GOAL_ID = 'IGoalId_550e8400-e29b-41d4-a716-446655440000';
const IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440001';

function context(): IApiModuleContext {
  return {
    app: {} as never,
    router: Router(),
    middleware: {
      auth: (req, _res, next) => {
        (req as { user?: { identityId: string } }).user = { identityId: IDENTITY_ID };
        next();
      },
      requireRole: () => (_req, _res, next) => next(),
    },
  };
}

async function harness(port: Record<string, ReturnType<typeof vi.fn>>) {
  const module = composeGoalWorkspaceApiModule({ port: port as never });
  const ctx = context();
  module.register(ctx);
  const express = (await import('express')).default;
  const app = express();
  app.use('/api', ctx.router);
  return app;
}

describe('Goal Workspace HTTP module', () => {
  it('uses one authenticated read port for workspace and bounded full-list queries', async () => {
    const port = {
      getWorkspace: vi.fn().mockResolvedValue(ok({ kind: 'workspace' })),
      listTasks: vi.fn().mockResolvedValue(ok({ kind: 'tasks' })),
      listKnowledge: vi.fn().mockResolvedValue(ok({ kind: 'knowledge' })),
    };
    const app = await harness(port);

    expect(
      (await request(app).get(`/api/goals/${GOAL_ID}/workspace?previewLimit=3&recentLimit=4`))
        .status,
    ).toBe(200);
    expect(
      (
        await request(app).get(
          `/api/goals/${GOAL_ID}/workspace/tasks?limit=7&offset=2&keyResultId=kr-1`,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/goals/${GOAL_ID}/workspace/knowledge?limit=8&offset=3`)).status,
    ).toBe(200);

    expect(port.getWorkspace).toHaveBeenCalledWith(IDENTITY_ID, GOAL_ID, {
      previewLimit: 3,
      recentLimit: 4,
    });
    expect(port.listTasks).toHaveBeenCalledWith(IDENTITY_ID, GOAL_ID, {
      limit: 7,
      offset: 2,
      keyResultId: 'kr-1',
    });
    expect(port.listKnowledge).toHaveBeenCalledWith(IDENTITY_ID, GOAL_ID, {
      limit: 8,
      offset: 3,
    });
  });

  it('rejects malformed Goal ids before invoking the application port', async () => {
    const port = {
      getWorkspace: vi.fn(),
      listTasks: vi.fn(),
      listKnowledge: vi.fn(),
    };
    const app = await harness(port);
    const response = await request(app).get('/api/goals/not-a-goal/workspace');
    expect(response.status).toBe(422);
    expect(port.getWorkspace).not.toHaveBeenCalled();
  });
});
