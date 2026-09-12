/**
 * Task smoke app helpers.
 *
 * Provides a reusable smoke-test composition root for host integration tests
 * without exposing the full application-server public surface.
 */

import express, {
  Router,
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { randomUUID } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { vi } from 'vitest';
import { createTimeContext } from '@memoflow/time';
import { TaskPlanController } from '../server/transport/task-plan.controller';
import { TaskOccurrenceController } from '../server/transport/task-occurrence.controller';
import {
  createTaskModule,
  type TaskModuleDependencies,
} from '../server/infrastructure/task.module';
import { createTaskTransportHandlers } from '../server/transport';
import { registerTaskRoutes } from '../api/routes';
import type { ITaskPlanRepository } from '../server/domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../server/domain/repositories/i-task-occurrence-repository';

export const JWT_SECRET = 'smoke-test-jwt-secret-key-at-least-32-chars';
export const TEST_IDENTITY_ID = 'IdentityId_550e8400-e29b-41d4-a716-446655440001';

export interface TaskSmokeApp {
  app: Express;
  templateRepo: ITaskPlanRepository;
  instanceRepo: ITaskOccurrenceRepository;
  token: string;
}

export function createMockTemplateRepo(): ITaskPlanRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findByIdForIdentity: vi.fn().mockResolvedValue(null),
    findByIdWithChildren: vi.fn().mockResolvedValue(null),
    findByIdentityId: vi.fn().mockResolvedValue([]),
    findByStatus: vi.fn().mockResolvedValue([]),
    findActiveTemplates: vi.fn().mockResolvedValue([]),
    findByGoalId: vi.fn().mockResolvedValue([]),
    findByLabelIdsAll: vi.fn().mockResolvedValue([]),
    replaceLabels: vi.fn().mockResolvedValue([]),
    findNeedGenerateInstances: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    findOneTimeTasks: vi.fn().mockResolvedValue([]),
    findRecurringTasks: vi.fn().mockResolvedValue([]),
    findByGoalAndKeyResultId: vi.fn().mockResolvedValue([]),
    countTasks: vi.fn().mockResolvedValue(0),
    saveBatch: vi.fn().mockResolvedValue(undefined),
    deleteBatch: vi.fn().mockResolvedValue(undefined),
    findAllTemplateRefs: vi.fn(async () => []),
  };
}

export function createMockInstanceRepo(): ITaskOccurrenceRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    saveMany: vi.fn().mockResolvedValue(undefined),
    findByIdForIdentity: vi.fn().mockResolvedValue(null),
    findByTemplateId: vi.fn().mockResolvedValue([]),
    findByIdentityId: vi.fn().mockResolvedValue([]),
    findByDateRange: vi.fn().mockResolvedValue([]),
    findByStatus: vi.fn().mockResolvedValue([]),
    findOverdueInstances: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    deleteMany: vi.fn().mockResolvedValue(undefined),
    deleteByTemplateId: vi.fn().mockResolvedValue(undefined),
    countFutureInstances: vi.fn().mockResolvedValue(0),
    findByTemplateIdAndDateRange: vi.fn().mockResolvedValue([]),
    getTemplateStats: vi.fn().mockResolvedValue({}),
    deleteIncompleteInstancesFrom: vi.fn().mockResolvedValue(0),
  };
}

export function createTestToken(identityId = TEST_IDENTITY_ID): string {
  return jwt.sign({ identityId }, JWT_SECRET, { expiresIn: '1h' });
}

const smokeAuthMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, code: 401, message: 'Missing token' });
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as unknown as Record<string, unknown>).user = { identityId: decoded.identityId };
    return next();
  } catch {
    return res.status(401).json({ ok: false, code: 401, message: 'Invalid token' });
  }
};

export function createTaskSmokeApp(): TaskSmokeApp {
  const templateRepo = createMockTemplateRepo();
  const instanceRepo = createMockInstanceRepo();
  const taskModule = createTaskModule({
    taskPlanRepository: templateRepo,
    taskOccurrenceRepository: instanceRepo,
    taskWriteTransactionRunner: {
      run: (work) => work({ templateRepository: templateRepo, instanceRepository: instanceRepo }),
    },
    userTimeContextPort: {
      getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
    },
  } satisfies TaskModuleDependencies);
  const handlers = createTaskTransportHandlers(taskModule.api);

  const templateController = new TaskPlanController(handlers.template);
  const instanceController = new TaskOccurrenceController(handlers.instance);

  const app = express();
  app.use(express.json());

  // Mirrors the API RequestContext middleware: the expressAdapter fails closed
  // without a producer-owned carrier, so smoke tests need one before routes.
  app.use((req, _res, next) => {
    const requestId = randomUUID();
    (req as unknown as Record<string, unknown>).requestContext = {
      requestId,
      traceId: requestId,
      startedAt: Date.now(),
      source: 'http',
    };
    next();
  });

  const rootRouter = Router();
  const taskRoutes = registerTaskRoutes(
    { templateController, instanceController },
    {
      auth: smokeAuthMiddleware,
      requireRole: (_roles: string[]) => smokeAuthMiddleware,
    },
  );
  rootRouter.use(taskRoutes);

  app.use('/api/v1', rootRouter);
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ ok: false, code: 500, message: err.message || 'Internal error' });
  });

  return {
    app,
    templateRepo,
    instanceRepo,
    token: createTestToken(),
  };
}
