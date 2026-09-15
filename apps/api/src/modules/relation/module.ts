import { Router } from 'express';
import {
  GoalKnowledgeLinkReqSchema,
  GoalKnowledgeListReqSchema,
  GoalsForKnowledgeReqSchema,
} from '@memoflow/contracts/relation';
import type { GoalKnowledgeService } from '@memoflow/relation';
import type { IApiModule, IApiModuleContext } from '../../shared/contracts/api-module.js';
import type { AuthenticatedRequest } from '../../shared/infrastructure/http/middlewares/auth-middleware.js';
import { createApiResponseBuilder } from '../../shared/infrastructure/http/response-builder.js';

export interface ComposeGoalKnowledgeApiModuleOptions {
  readonly service: Pick<
    GoalKnowledgeService,
    'link' | 'unlink' | 'listForGoal' | 'listGoalsForKnowledge'
  >;
}

function validationDetails(issues: readonly { path: PropertyKey[]; message: string }[]) {
  return issues.map((issue) => ({
    field: issue.path.map(String).join('.') || 'request',
    code: 'INVALID_FIELD',
    message: issue.message,
  }));
}

/** Current-user GoalKnowledge transport; generic Relation mutation is intentionally not public. */
export function composeGoalKnowledgeApiModule(
  options: ComposeGoalKnowledgeApiModuleOptions,
): IApiModule {
  return {
    name: 'Relation',
    register(context: IApiModuleContext) {
      const router = Router();
      const identity = (req: AuthenticatedRequest) => req.user?.identityId ?? null;

      router.post('/', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const response = createApiResponseBuilder(request);
        const identityId = identity(request);
        if (!identityId)
          return res.status(401).json(response.unauthorized('Authentication required'));
        const parsed = GoalKnowledgeLinkReqSchema.safeParse(req.body);
        if (!parsed.success)
          return res
            .status(422)
            .json(
              response.validationError(
                validationDetails(parsed.error.issues),
                'Invalid Goal Knowledge link',
              ),
            );
        try {
          return res
            .status(201)
            .json(response.success(await options.service.link(identityId, parsed.data)));
        } catch {
          return res.status(404).json(response.notFound('Knowledge document not found'));
        }
      });

      router.delete('/', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const response = createApiResponseBuilder(request);
        const identityId = identity(request);
        if (!identityId)
          return res.status(401).json(response.unauthorized('Authentication required'));
        const parsed = GoalKnowledgeLinkReqSchema.safeParse(req.body);
        if (!parsed.success)
          return res
            .status(422)
            .json(
              response.validationError(
                validationDetails(parsed.error.issues),
                'Invalid Goal Knowledge unlink',
              ),
            );
        return res
          .status(200)
          .json(
            response.success({ unlinked: await options.service.unlink(identityId, parsed.data) }),
          );
      });

      router.get('/:goalId', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const response = createApiResponseBuilder(request);
        const identityId = identity(request);
        if (!identityId)
          return res.status(401).json(response.unauthorized('Authentication required'));
        const parsed = GoalKnowledgeListReqSchema.safeParse({ goalId: req.params.goalId });
        if (!parsed.success)
          return res
            .status(422)
            .json(
              response.validationError(validationDetails(parsed.error.issues), 'Invalid Goal id'),
            );
        return res
          .status(200)
          .json(response.success(await options.service.listForGoal(identityId, parsed.data)));
      });

      router.post('/reverse', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const response = createApiResponseBuilder(request);
        const identityId = identity(request);
        if (!identityId)
          return res.status(401).json(response.unauthorized('Authentication required'));
        const parsed = GoalsForKnowledgeReqSchema.safeParse(req.body);
        if (!parsed.success)
          return res
            .status(422)
            .json(
              response.validationError(
                validationDetails(parsed.error.issues),
                'Invalid Knowledge document reference',
              ),
            );
        return res
          .status(200)
          .json(
            response.success(await options.service.listGoalsForKnowledge(identityId, parsed.data)),
          );
      });

      context.router.use('/goal-knowledge', router);
    },
  };
}
