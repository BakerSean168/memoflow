/**
 * Task Routes Index
 * 
 * Aggregates all task-related route registration functions.
 * Follows ADR-021/022 split-route pattern.
 */

import { Router, type RequestHandler } from 'express';
import type { OpenApiRegistryLike } from '@memoflow/utils/result';
import type { TaskPlanController } from '../../server/transport/task-plan.controller';
import type { TaskOccurrenceController } from '../../server/transport/task-occurrence.controller';
import { registerTaskPlanRoutes } from './task-plan.routes';
import { registerTaskOccurrenceRoutes } from './task-occurrence.routes';

// ============ Types ============

interface PlatformMiddleware {
  readonly auth: RequestHandler;
  requireRole?(roles: string[]): RequestHandler;
}

interface TaskControllers {
  templateController: TaskPlanController;
  instanceController: TaskOccurrenceController;
}

// ============ Route Registration ============

/**
 * Register all task routes with their appropriate prefixes
 */
export function registerTaskRoutes(
  controllers: TaskControllers,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();

  // Task Templates: /api/task-plans
  const templateRouter = registerTaskPlanRoutes(
    controllers.templateController,
    middleware,
    openApiRegistry,
  );
  router.use('/task-plans', templateRouter);

  // Task Instances: /api/task-occurrences
  const instanceRouter = registerTaskOccurrenceRoutes(
    controllers.instanceController,
    middleware,
    openApiRegistry,
  );
  router.use('/task-occurrences', instanceRouter);


  return router;
}
