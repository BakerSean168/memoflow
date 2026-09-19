import { Router, type Response } from 'express';
import {
  GetGoalWorkspaceInvocationSchema,
  GoalWorkspaceKnowledgePageInvocationSchema,
  GoalWorkspaceTaskPageInvocationSchema,
} from '@memoflow/contracts/goal';
import { errorCodeToHttpStatus, type Result } from '@memoflow/contracts/result';
import type { GoalWorkspaceApplicationPort } from '@memoflow/goal';
import type { IApiModule, IApiModuleContext } from '../../shared/contracts/api-module.js';
import type { AuthenticatedRequest } from '../../shared/infrastructure/http/middlewares/auth-middleware.js';
import { createApiResponseBuilder } from '../../shared/infrastructure/http/response-builder.js';

export interface ComposeGoalWorkspaceApiModuleOptions {
  readonly port: GoalWorkspaceApplicationPort;
}

function sendResult<T>(res: Response, request: AuthenticatedRequest, result: Result<T>) {
  const response = createApiResponseBuilder(request);
  return res
    .status(result.ok ? 200 : errorCodeToHttpStatus(result.error.code))
    .json(response.fromResult(result));
}

/** Read-only Goal Workspace HTTP adapter; composition happens in the API host. */
export function composeGoalWorkspaceApiModule(
  options: ComposeGoalWorkspaceApiModuleOptions,
): IApiModule {
  return {
    name: 'GoalWorkspace',
    register(context: IApiModuleContext) {
      const router = Router();

      router.get('/:goalId/workspace', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const identityId = request.user?.identityId;
        const response = createApiResponseBuilder(request);
        if (!identityId)
          return res.status(401).json(response.unauthorized('Authentication required'));
        const parsed = GetGoalWorkspaceInvocationSchema.safeParse({
          goalId: req.params.goalId,
          ...req.query,
        });
        if (!parsed.success)
          return res
            .status(422)
            .json(response.error('VALIDATION_ERROR', 'Invalid Goal Workspace query'));
        const { goalId, ...workspaceRequest } = parsed.data;
        return sendResult(
          res,
          request,
          await options.port.getWorkspace(identityId, goalId, workspaceRequest),
        );
      });

      router.get('/:goalId/workspace/tasks', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const identityId = request.user?.identityId;
        const response = createApiResponseBuilder(request);
        if (!identityId)
          return res.status(401).json(response.unauthorized('Authentication required'));
        const parsed = GoalWorkspaceTaskPageInvocationSchema.safeParse({
          goalId: req.params.goalId,
          ...req.query,
        });
        if (!parsed.success)
          return res
            .status(422)
            .json(response.error('VALIDATION_ERROR', 'Invalid Goal Workspace task query'));
        const { goalId, ...page } = parsed.data;
        return sendResult(res, request, await options.port.listTasks(identityId, goalId, page));
      });

      router.get('/:goalId/workspace/knowledge', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const identityId = request.user?.identityId;
        const response = createApiResponseBuilder(request);
        if (!identityId)
          return res.status(401).json(response.unauthorized('Authentication required'));
        const parsed = GoalWorkspaceKnowledgePageInvocationSchema.safeParse({
          goalId: req.params.goalId,
          ...req.query,
        });
        if (!parsed.success)
          return res
            .status(422)
            .json(response.error('VALIDATION_ERROR', 'Invalid Goal Workspace knowledge query'));
        const { goalId, ...page } = parsed.data;
        return sendResult(res, request, await options.port.listKnowledge(identityId, goalId, page));
      });

      context.router.use('/goals', router);
    },
  };
}
