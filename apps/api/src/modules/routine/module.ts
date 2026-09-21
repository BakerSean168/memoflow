import { Router, type Response } from 'express';
import {
  ClearRoutineTemporaryOverrideRequestSchema,
  CreateRoutineProfileRequestSchema,
  CreateRoutineRequestSchema,
  DeleteRoutineProfileRequestSchema,
  DeleteRoutineRequestSchema,
  ReplaceRoutineProfilesRequestSchema,
  SetRoutineMembershipEnabledRequestSchema,
  SetRoutineProfileActiveRequestSchema,
  SetRoutineTemporaryOverrideRequestSchema,
  UpdateRoutineProfileRequestSchema,
  UpdateRoutineRequestSchema,
} from '@memoflow/contracts/routine';
import { ResultCode, extractStructuredResultError } from '@memoflow/contracts/result';
import type {
  RoutineCoachCommandPort,
  RoutineConfigurationQueryPort,
  RoutineTrigger,
} from '@memoflow/reminder';
import type { IApiModule, IApiModuleContext } from '../../shared/contracts/api-module.js';
import type { AuthenticatedRequest } from '../../shared/infrastructure/http/middlewares/auth-middleware.js';
import { createApiResponseBuilder } from '../../shared/infrastructure/http/response-builder.js';

export interface ComposeRoutineApiModuleOptions {
  readonly commandPort: RoutineCoachCommandPort;
  readonly queryPort: RoutineConfigurationQueryPort;
}

function validationDetails(issues: readonly { path: PropertyKey[]; message: string }[]) {
  return issues.map((issue) => ({
    field: issue.path.map(String).join('.') || 'request',
    code: 'INVALID_FIELD',
    message: issue.message,
  }));
}

function identityId(request: AuthenticatedRequest): string | null {
  return request.user?.identityId ?? null;
}

function handleRoutineError(
  response: ReturnType<typeof createApiResponseBuilder>,
  res: Response,
  error: unknown,
) {
  const structured = extractStructuredResultError(error);
  if (structured?.code === ResultCode.NOT_FOUND) {
    return res.status(404).json(response.notFound('Routine resource not found'));
  }
  if (structured?.code === ResultCode.CONFLICT) {
    return res.status(409).json(response.conflict('Routine state conflict'));
  }
  if (error instanceof TypeError) {
    return res.status(422).json(response.badRequest('Invalid Routine operation'));
  }
  return res.status(500).json(response.internalError('Routine operation failed'));
}

function authIdentity(request: AuthenticatedRequest, res: Response) {
  const response = createApiResponseBuilder(request);
  const id = identityId(request);
  if (!id) {
    res.status(401).json(response.unauthorized('Authentication required'));
    return null;
  }
  return { id, response };
}

/** Canonical Routine vNext HTTP transport. No legacy Reminder routes are mounted. */
export function composeRoutineApiModule(options: ComposeRoutineApiModuleOptions): IApiModule {
  return {
    name: 'Routine',
    register(context: IApiModuleContext) {
      const routineRouter = Router();
      const profileRouter = Router();

      routineRouter.get('/configuration', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const auth = authIdentity(request, res);
        if (!auth) return;
        try {
          return res
            .status(200)
            .json(auth.response.success(await options.queryPort.getConfigurationSnapshot(auth.id)));
        } catch (error) {
          return handleRoutineError(auth.response, res, error);
        }
      });

      routineRouter.post('/', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const auth = authIdentity(request, res);
        if (!auth) return;
        const parsed = CreateRoutineRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(422)
            .json(auth.response.validationError(validationDetails(parsed.error.issues)));
        }
        try {
          const receipt = await options.commandPort.createRoutine({
            identityId: auth.id,
            name: parsed.data.name,
            description: parsed.data.description,
            trigger: parsed.data.trigger as RoutineTrigger | null | undefined,
            profileIds: parsed.data.profileIds,
          });
          return res
            .status(201)
            .json(auth.response.success({ id: receipt.routineId, version: receipt.version }));
        } catch (error) {
          return handleRoutineError(auth.response, res, error);
        }
      });

      routineRouter.patch('/:routineId', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const auth = authIdentity(request, res);
        if (!auth) return;
        const parsed = UpdateRoutineRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(422)
            .json(auth.response.validationError(validationDetails(parsed.error.issues)));
        }
        try {
          const receipt = await options.commandPort.updateRoutine({
            identityId: auth.id,
            routineId: req.params.routineId,
            expectedVersion: parsed.data.expectedVersion,
            name: parsed.data.name,
            description: parsed.data.description,
            enabled: parsed.data.enabled,
            trigger: parsed.data.trigger as RoutineTrigger | null | undefined,
          });
          return res
            .status(200)
            .json(auth.response.success({ id: receipt.routineId, version: receipt.version }));
        } catch (error) {
          return handleRoutineError(auth.response, res, error);
        }
      });

      routineRouter.delete('/:routineId', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const auth = authIdentity(request, res);
        if (!auth) return;
        const parsed = DeleteRoutineRequestSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res
            .status(422)
            .json(auth.response.validationError(validationDetails(parsed.error.issues)));
        }
        try {
          const receipt = await options.commandPort.deleteRoutine({
            identityId: auth.id,
            routineId: req.params.routineId,
            expectedVersion: parsed.data.expectedVersion,
          });
          return res.status(200).json(auth.response.success({ id: receipt.routineId }));
        } catch (error) {
          return handleRoutineError(auth.response, res, error);
        }
      });

      routineRouter.put('/:routineId/profiles', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const auth = authIdentity(request, res);
        if (!auth) return;
        const parsed = ReplaceRoutineProfilesRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(422)
            .json(auth.response.validationError(validationDetails(parsed.error.issues)));
        }
        try {
          const receipt = await options.commandPort.replaceRoutineProfiles({
            identityId: auth.id,
            routineId: req.params.routineId,
            expectedVersion: parsed.data.expectedVersion,
            profileIds: parsed.data.profileIds,
          });
          return res
            .status(200)
            .json(auth.response.success({ id: receipt.routineId, version: receipt.version }));
        } catch (error) {
          return handleRoutineError(auth.response, res, error);
        }
      });

      routineRouter.patch(
        '/:routineId/profiles/:profileId',
        context.middleware.auth,
        async (req, res) => {
          const request = req as AuthenticatedRequest;
          const auth = authIdentity(request, res);
          if (!auth) return;
          const parsed = SetRoutineMembershipEnabledRequestSchema.safeParse(req.body);
          if (!parsed.success) {
            return res
              .status(422)
              .json(auth.response.validationError(validationDetails(parsed.error.issues)));
          }
          try {
            const receipt = await options.commandPort.setMembershipEnabled({
              identityId: auth.id,
              routineId: req.params.routineId,
              profileId: req.params.profileId,
              enabled: parsed.data.enabled,
              expectedVersion: parsed.data.expectedVersion,
            });
            return res.status(200).json(
              auth.response.success({
                id: receipt.routineId,
                version: receipt.version,
              }),
            );
          } catch (error) {
            return handleRoutineError(auth.response, res, error);
          }
        },
      );

      routineRouter.put('/:routineId/override', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const auth = authIdentity(request, res);
        if (!auth) return;
        const parsed = SetRoutineTemporaryOverrideRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(422)
            .json(auth.response.validationError(validationDetails(parsed.error.issues)));
        }
        try {
          const receipt = await options.commandPort.setTemporaryOverride({
            identityId: auth.id,
            routineId: req.params.routineId,
            ...parsed.data,
            source: parsed.data.source ?? 'user',
          });
          return res.status(200).json(auth.response.success({ id: receipt.routineId }));
        } catch (error) {
          return handleRoutineError(auth.response, res, error);
        }
      });

      routineRouter.delete('/:routineId/override', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const auth = authIdentity(request, res);
        if (!auth) return;
        const parsed = ClearRoutineTemporaryOverrideRequestSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res
            .status(422)
            .json(auth.response.validationError(validationDetails(parsed.error.issues)));
        }
        try {
          const receipt = await options.commandPort.clearTemporaryOverride({
            identityId: auth.id,
            routineId: req.params.routineId,
            expectedVersion: parsed.data.expectedVersion,
          });
          return res.status(200).json(auth.response.success({ id: receipt.routineId }));
        } catch (error) {
          return handleRoutineError(auth.response, res, error);
        }
      });

      profileRouter.post('/', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const auth = authIdentity(request, res);
        if (!auth) return;
        const parsed = CreateRoutineProfileRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(422)
            .json(auth.response.validationError(validationDetails(parsed.error.issues)));
        }
        try {
          const receipt = await options.commandPort.createProfile({
            identityId: auth.id,
            ...parsed.data,
          });
          return res
            .status(201)
            .json(auth.response.success({ id: receipt.profileId, version: receipt.version }));
        } catch (error) {
          return handleRoutineError(auth.response, res, error);
        }
      });

      profileRouter.patch('/:profileId', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const auth = authIdentity(request, res);
        if (!auth) return;
        const parsed = UpdateRoutineProfileRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(422)
            .json(auth.response.validationError(validationDetails(parsed.error.issues)));
        }
        try {
          const receipt = await options.commandPort.updateProfile({
            identityId: auth.id,
            profileId: req.params.profileId,
            ...parsed.data,
          });
          return res
            .status(200)
            .json(auth.response.success({ id: receipt.profileId, version: receipt.version }));
        } catch (error) {
          return handleRoutineError(auth.response, res, error);
        }
      });

      profileRouter.delete('/:profileId', context.middleware.auth, async (req, res) => {
        const request = req as AuthenticatedRequest;
        const auth = authIdentity(request, res);
        if (!auth) return;
        const parsed = DeleteRoutineProfileRequestSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res
            .status(422)
            .json(auth.response.validationError(validationDetails(parsed.error.issues)));
        }
        try {
          const receipt = await options.commandPort.deleteProfile({
            identityId: auth.id,
            profileId: req.params.profileId,
            expectedVersion: parsed.data.expectedVersion,
          });
          return res.status(200).json(auth.response.success({ id: receipt.profileId }));
        } catch (error) {
          return handleRoutineError(auth.response, res, error);
        }
      });

      profileRouter.patch('/:profileId/runtime', context.middleware.auth, (req, res) => {
        const request = req as AuthenticatedRequest;
        const auth = authIdentity(request, res);
        if (!auth) return;
        const parsed = SetRoutineProfileActiveRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(422)
            .json(auth.response.validationError(validationDetails(parsed.error.issues)));
        }
        // RuntimeContext is host-local state. The API/Web host deliberately has no
        // ActivitySensor or local Routine runtime, so accepting this mutation would
        // manufacture process-local state that cannot drive actual execution.
        return res
          .status(409)
          .json(auth.response.conflict('Routine local runtime is unavailable on the Web host'));
      });

      context.router.use('/routines', routineRouter);
      context.router.use('/routine-profiles', profileRouter);
    },
  };
}
