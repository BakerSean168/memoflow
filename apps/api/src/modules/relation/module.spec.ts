import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { IApiModuleContext } from '../../shared/contracts/api-module.js';
import { composeGoalKnowledgeApiModule } from './module.js';

const LINK = {
  goalId: 'IGoalId_550e8400-e29b-41d4-a716-446655440000',
  knowledgeDocument: {
    knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440091',
    documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440090',
  },
};

function createContext(): IApiModuleContext {
  return {
    app: {} as IApiModuleContext['app'],
    router: Router(),
    middleware: {
      auth: (req, _res, next) => {
        (req as { user?: { identityId: string } }).user = { identityId: 'identity-1' };
        next();
      },
      requireRole: () => (_req, _res, next) => next(),
    },
  };
}

async function harness(service: Record<string, ReturnType<typeof vi.fn>>) {
  const module = composeGoalKnowledgeApiModule({ service: service as never });
  const context = createContext();
  module.register(context);
  const expressModule = await import('express');
  const app = expressModule.default();
  app.use(expressModule.default.json());
  app.use('/api', context.router);
  return app;
}

describe('composeGoalKnowledgeApiModule', () => {
  it('creates, lists, reverse-lists and unlinks using authenticated identity', async () => {
    const relation = { relationId: 'rel-1', ...LINK, createdAt: 1 };
    const service = {
      link: vi.fn().mockResolvedValue(relation),
      unlink: vi.fn().mockResolvedValue(true),
      listForGoal: vi.fn().mockResolvedValue([relation]),
      listGoalsForKnowledge: vi.fn().mockResolvedValue([relation]),
    };
    const app = await harness(service);

    expect((await request(app).post('/api/goal-knowledge').send(LINK)).status).toBe(201);
    expect((await request(app).get(`/api/goal-knowledge/${LINK.goalId}`)).status).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/goal-knowledge/reverse')
          .send({ knowledgeDocument: LINK.knowledgeDocument })
      ).status,
    ).toBe(200);
    const unlinked = await request(app).delete('/api/goal-knowledge').send(LINK);
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.data).toEqual({ unlinked: true });
    expect(service.link).toHaveBeenCalledWith('identity-1', LINK);
    expect(service.unlink).toHaveBeenCalledWith('identity-1', LINK);
  });

  it('rejects path-derived note identity before calling the service', async () => {
    const service = {
      link: vi.fn(),
      unlink: vi.fn(),
      listForGoal: vi.fn(),
      listGoalsForKnowledge: vi.fn(),
    };
    const app = await harness(service);
    const response = await request(app)
      .post('/api/goal-knowledge')
      .send({
        ...LINK,
        knowledgeDocument: { ...LINK.knowledgeDocument, documentId: 'notes/interview.md' },
      });
    expect(response.status).toBe(422);
    expect(service.link).not.toHaveBeenCalled();
  });
});
