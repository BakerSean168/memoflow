import { Router } from 'express';
import { CreateLabelReqSchema, ListLabelsReqSchema } from '@memoflow/label-contracts';
import type { LabelService } from '@memoflow/label';
import { toLabelClientDTO } from '@memoflow/label/client';
import type { IApiModule, IApiModuleContext } from '../../shared/contracts/api-module.js';
import type { AuthenticatedRequest } from '../../shared/infrastructure/http/middlewares/auth-middleware.js';
import { createApiResponseBuilder } from '../../shared/infrastructure/http/response-builder.js';

export interface ComposeLabelApiModuleOptions {
  readonly service: Pick<LabelService, 'list' | 'create'>;
}

function validationDetails(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Array<{ field: string; code: string; message: string }> {
  return issues.map((issue) => ({
    field: issue.path.map(String).join('.') || 'request',
    code: 'INVALID_FIELD',
    message: issue.message,
  }));
}

/** Host-bound current-user Label catalog transport. */
export function composeLabelApiModule(options: ComposeLabelApiModuleOptions): IApiModule {
  return {
    name: 'Label',
    register(context: IApiModuleContext) {
      const labelRouter = Router();

      labelRouter.get('/', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const response = createApiResponseBuilder(request);
        const identityId = request.user?.identityId;
        if (!identityId)
          return res.status(401).json(response.unauthorized('Authentication required'));

        const parsed = ListLabelsReqSchema.safeParse(req.query);
        if (!parsed.success) {
          return res
            .status(422)
            .json(
              response.validationError(
                validationDetails(parsed.error.issues),
                'Invalid label query',
              ),
            );
        }

        try {
          const labels = await options.service.list({ identityId, ...parsed.data });
          return res.status(200).json(response.success(labels.map(toLabelClientDTO)));
        } catch {
          return res.status(500).json(response.internalError('Failed to load labels'));
        }
      });

      labelRouter.post('/', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const response = createApiResponseBuilder(request);
        const identityId = request.user?.identityId;
        if (!identityId)
          return res.status(401).json(response.unauthorized('Authentication required'));

        const parsed = CreateLabelReqSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(422)
            .json(
              response.validationError(validationDetails(parsed.error.issues), 'Invalid label'),
            );
        }

        try {
          const label = await options.service.create({ identityId, ...parsed.data });
          return res.status(201).json(response.success(toLabelClientDTO(label)));
        } catch {
          return res.status(500).json(response.internalError('Failed to create label'));
        }
      });

      context.router.use('/labels', labelRouter);
    },
  };
}
