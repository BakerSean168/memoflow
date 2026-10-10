import { z } from 'zod';
import { Router, type RequestHandler } from 'express';
import {
  RouteRegistrar,
  type OpenApiRegistryLike,
  successResponse,
  errorResponse,
} from '@memoflow/utils/result';
import {
  AgentConversationSelectionSchema,
  AgentInstanceSchema,
  AgentRegistrySnapshotSchema,
  AgentRegistryCommandSchema,
} from '@memoflow/contracts/ai';
import type { AgentInstanceController } from '../../server/transport/agent-instance.controller';

interface PlatformMiddleware {
  readonly auth: RequestHandler;
}

const AgentRegistryResultSchema = z.union([
  AgentInstanceSchema,
  AgentRegistrySnapshotSchema,
  AgentConversationSelectionSchema,
  z.null(),
]);

/** Credential-free Agent instance CRUD, independent of model-service onboarding. */
export function registerAIAgentInstanceRoutes(
  controller: AgentInstanceController,
  middleware: PlatformMiddleware,
  openApiRegistry?: OpenApiRegistryLike | null,
): Router {
  const router = Router();
  const r = new RouteRegistrar(router, openApiRegistry ?? null, {
    basePath: '/api/v1/ai/agent-instances',
    defaultTags: ['AI Agent Instances'],
    defaultSecurity: [{ bearerAuth: [] }],
  });
  r.route(
    {
      method: 'get',
      path: '/',
      summary: 'List explicit and implicit Agent instances for the authenticated identity',
      responses: { 200: successResponse(AgentRegistrySnapshotSchema, 'Agent Registry') },
    },
    [middleware.auth],
    (_req, cx) => controller.list(cx),
  );
  r.route(
    {
      method: 'post',
      path: '/',
      summary: 'Create, update, delete or bind an Agent instance with owner-scoped CAS',
      request: {
        body: { content: { 'application/json': { schema: AgentRegistryCommandSchema } } },
      },
      responses: {
        200: successResponse(AgentRegistryResultSchema, 'Agent Registry operation'),
        400: errorResponse('Invalid instance command'),
        403: errorResponse('Unsupported Agent driver'),
        409: errorResponse('Revision conflict'),
      },
    },
    [middleware.auth],
    (req, cx) => controller.execute(req.body, cx),
  );
  return router;
}
