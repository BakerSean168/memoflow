import { Router } from 'express';
import { GetTaskWorkspaceInvocationSchema } from '@memoflow/contracts/task';
import { errorCodeToHttpStatus } from '@memoflow/contracts/result';
import type { TaskWorkspaceApplicationPort } from '@memoflow/task';
import type { IApiModule, IApiModuleContext } from '../../shared/contracts/api-module.js';
import type { AuthenticatedRequest } from '../../shared/infrastructure/http/middlewares/auth-middleware.js';
import { createApiResponseBuilder } from '../../shared/infrastructure/http/response-builder.js';

export function composeTaskWorkspaceApiModule(port: TaskWorkspaceApplicationPort): IApiModule {
  return {
    name: 'TaskWorkspace',
    register(context: IApiModuleContext) {
      const router = Router();
      router.get('/:planId/workspace', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const response = createApiResponseBuilder(request);
        const identityId = request.user?.identityId;
        if (!identityId) return res.status(401).json(response.unauthorized('Authentication required'));
        const parsed = GetTaskWorkspaceInvocationSchema.safeParse({ planId: req.params.planId, ...req.query });
        if (!parsed.success) return res.status(422).json(response.error('VALIDATION_ERROR', 'Invalid Task Workspace query'));
        const { planId, ...workspaceRequest } = parsed.data;
        const result = await port.getWorkspace(identityId, planId, workspaceRequest);
        return res.status(result.ok ? 200 : errorCodeToHttpStatus(result.error.code)).json(response.fromResult(result));
      });
      context.router.use('/tasks', router);
    },
  };
}
