import { ipcMain } from 'electron';
import {
  RoutineChannels,
  withAuthenticatedIdentity,
  type IElectronModule,
  type IElectronModuleContext,
} from '@memoflow/contracts/electron';
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
import {
  ResultCode,
  extractStructuredResultError,
  fail,
  ok,
  type Result,
} from '@memoflow/contracts/result';
import type {
  RoutineCoachCommandPort,
  RoutineConfigurationQueryPort,
  RoutineTrigger,
} from '@memoflow/reminder';

export interface RoutineConfigurationElectronModuleOptions {
  readonly commandPort: RoutineCoachCommandPort;
  readonly queryPort: RoutineConfigurationQueryPort;
  readonly afterMutation?: () => Promise<void>;
}

function invalid(message: string): Result<never> {
  return fail({ code: 'VALIDATION_ERROR', message });
}

function failed(error: unknown): Result<never> {
  if (error instanceof TypeError) {
    return fail({ code: ResultCode.VALIDATION_ERROR, message: 'Invalid Routine operation' });
  }
  const structured = extractStructuredResultError(error);
  if (structured?.code === ResultCode.NOT_FOUND) {
    return fail({ code: ResultCode.NOT_FOUND, message: 'Routine resource not found' });
  }
  if (structured?.code === ResultCode.CONFLICT) {
    return fail({ code: ResultCode.CONFLICT, message: 'Routine state conflict' });
  }
  return fail({ code: ResultCode.INTERNAL_ERROR, message: 'Routine operation failed' });
}

export function createRoutineConfigurationElectronModule(
  options: RoutineConfigurationElectronModuleOptions,
): IElectronModule {
  let registered = false;
  const channels = [
    RoutineChannels.CONFIGURATION_GET,
    RoutineChannels.CREATE,
    RoutineChannels.UPDATE,
    RoutineChannels.DELETE,
    RoutineChannels.PROFILE_CREATE,
    RoutineChannels.PROFILE_UPDATE,
    RoutineChannels.PROFILE_DELETE,
    RoutineChannels.PROFILE_SET_ACTIVE,
    RoutineChannels.REPLACE_PROFILES,
    RoutineChannels.MEMBERSHIP_SET_ENABLED,
    RoutineChannels.OVERRIDE_SET,
    RoutineChannels.OVERRIDE_CLEAR,
  ] as const;

  const mutate = async <T>(work: () => Promise<T>): Promise<Result<T>> => {
    try {
      const value = await work();
      await options.afterMutation?.();
      return ok(value);
    } catch (error) {
      return failed(error);
    }
  };

  return {
    name: 'RoutineConfiguration',
    register(context: IElectronModuleContext) {
      if (registered) throw new Error('RoutineConfigurationElectronModule may only register once');
      registered = true;

      ipcMain.handle(RoutineChannels.CONFIGURATION_GET, () =>
        withAuthenticatedIdentity(context, async (identityId) => {
          try {
            return ok(await options.queryPort.getConfigurationSnapshot(identityId));
          } catch (error) {
            return failed(error);
          }
        }),
      );

      ipcMain.handle(RoutineChannels.CREATE, (_event, request: unknown) =>
        withAuthenticatedIdentity(context, async (identityId) => {
          const parsed = CreateRoutineRequestSchema.safeParse(request);
          if (!parsed.success) return invalid('Invalid Routine request');
          return mutate(async () => {
            const receipt = await options.commandPort.createRoutine({
              identityId,
              name: parsed.data.name,
              description: parsed.data.description,
              trigger: parsed.data.trigger as RoutineTrigger | null | undefined,
              profileIds: parsed.data.profileIds,
            });
            return { id: receipt.routineId, version: receipt.version };
          });
        }),
      );

      ipcMain.handle(
        RoutineChannels.UPDATE,
        (_event, routineId: string, request: unknown) =>
          withAuthenticatedIdentity(context, async (identityId) => {
            const parsed = UpdateRoutineRequestSchema.safeParse(request);
            if (!parsed.success) return invalid('Invalid Routine update');
            return mutate(async () => {
              const receipt = await options.commandPort.updateRoutine({
                identityId,
                routineId,
                expectedVersion: parsed.data.expectedVersion,
                name: parsed.data.name,
                description: parsed.data.description,
                enabled: parsed.data.enabled,
                trigger: parsed.data.trigger as RoutineTrigger | null | undefined,
              });
              return { id: receipt.routineId, version: receipt.version };
            });
          }),
      );

      ipcMain.handle(
        RoutineChannels.DELETE,
        (_event, routineId: string, request: unknown = {}) =>
          withAuthenticatedIdentity(context, async (identityId) => {
            const parsed = DeleteRoutineRequestSchema.safeParse(request);
            if (!parsed.success) return invalid('Invalid Routine delete');
            return mutate(async () => {
              const receipt = await options.commandPort.deleteRoutine({
                identityId,
                routineId,
                expectedVersion: parsed.data.expectedVersion,
              });
              return { id: receipt.routineId };
            });
          }),
      );

      ipcMain.handle(RoutineChannels.PROFILE_CREATE, (_event, request: unknown) =>
        withAuthenticatedIdentity(context, async (identityId) => {
          const parsed = CreateRoutineProfileRequestSchema.safeParse(request);
          if (!parsed.success) return invalid('Invalid Routine profile request');
          return mutate(async () => {
            const receipt = await options.commandPort.createProfile({ identityId, ...parsed.data });
            return { id: receipt.profileId, version: receipt.version };
          });
        }),
      );

      ipcMain.handle(
        RoutineChannels.PROFILE_UPDATE,
        (_event, profileId: string, request: unknown) =>
          withAuthenticatedIdentity(context, async (identityId) => {
            const parsed = UpdateRoutineProfileRequestSchema.safeParse(request);
            if (!parsed.success) return invalid('Invalid Routine profile update');
            return mutate(async () => {
              const receipt = await options.commandPort.updateProfile({
                identityId,
                profileId,
                ...parsed.data,
              });
              return { id: receipt.profileId, version: receipt.version };
            });
          }),
      );

      ipcMain.handle(
        RoutineChannels.PROFILE_DELETE,
        (_event, profileId: string, request: unknown = {}) =>
          withAuthenticatedIdentity(context, async (identityId) => {
            const parsed = DeleteRoutineProfileRequestSchema.safeParse(request);
            if (!parsed.success) return invalid('Invalid Routine profile delete');
            return mutate(async () => {
              const receipt = await options.commandPort.deleteProfile({
                identityId,
                profileId,
                expectedVersion: parsed.data.expectedVersion,
              });
              return { id: receipt.profileId };
            });
          }),
      );

      ipcMain.handle(
        RoutineChannels.REPLACE_PROFILES,
        (_event, routineId: string, request: unknown) =>
          withAuthenticatedIdentity(context, async (identityId) => {
            const parsed = ReplaceRoutineProfilesRequestSchema.safeParse(request);
            if (!parsed.success) return invalid('Invalid Routine membership request');
            return mutate(async () => {
              const receipt = await options.commandPort.replaceRoutineProfiles({
                identityId,
                routineId,
                expectedVersion: parsed.data.expectedVersion,
                profileIds: parsed.data.profileIds,
              });
              return { id: receipt.routineId, version: receipt.version };
            });
          }),
      );

      ipcMain.handle(
        RoutineChannels.MEMBERSHIP_SET_ENABLED,
        (_event, routineId: string, profileId: string, request: unknown) =>
          withAuthenticatedIdentity(context, async (identityId) => {
            const parsed = SetRoutineMembershipEnabledRequestSchema.safeParse(request);
            if (!parsed.success) return invalid('Invalid Routine membership update');
            return mutate(async () => {
              const receipt = await options.commandPort.setMembershipEnabled({
                identityId,
                routineId,
                profileId,
                enabled: parsed.data.enabled,
                expectedVersion: parsed.data.expectedVersion,
              });
              return { id: receipt.routineId, version: receipt.version };
            });
          }),
      );

      ipcMain.handle(
        RoutineChannels.PROFILE_SET_ACTIVE,
        (_event, profileId: string, request: unknown) =>
          withAuthenticatedIdentity(context, async (identityId) => {
            const parsed = SetRoutineProfileActiveRequestSchema.safeParse(request);
            if (!parsed.success) return invalid('Invalid Routine profile runtime update');
            return mutate(async () => {
              const receipt = await options.commandPort.setProfileActive({
                identityId,
                profileId,
                active: parsed.data.active,
              });
              return { id: receipt.profileId, version: receipt.version };
            });
          }),
      );

      ipcMain.handle(
        RoutineChannels.OVERRIDE_SET,
        (_event, routineId: string, request: unknown) =>
          withAuthenticatedIdentity(context, async (identityId) => {
            const parsed = SetRoutineTemporaryOverrideRequestSchema.safeParse(request);
            if (!parsed.success) return invalid('Invalid Routine override');
            return mutate(async () => {
              const receipt = await options.commandPort.setTemporaryOverride({
                identityId,
                routineId,
                ...parsed.data,
                source: parsed.data.source ?? 'user',
              });
              return { id: receipt.routineId };
            });
          }),
      );

      ipcMain.handle(
        RoutineChannels.OVERRIDE_CLEAR,
        (_event, routineId: string, request: unknown = {}) =>
          withAuthenticatedIdentity(context, async (identityId) => {
            const parsed = ClearRoutineTemporaryOverrideRequestSchema.safeParse(request);
            if (!parsed.success) return invalid('Invalid Routine override clear');
            return mutate(async () => {
              const receipt = await options.commandPort.clearTemporaryOverride({
                identityId,
                routineId,
                expectedVersion: parsed.data.expectedVersion,
              });
              return { id: receipt.routineId };
            });
          }),
      );
    },
    destroy() {
      for (const channel of channels) ipcMain.removeHandler(channel);
    },
  };
}
