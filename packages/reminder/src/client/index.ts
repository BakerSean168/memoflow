import type { Result } from '@memoflow/contracts/result';
import type {
  ClearRoutineTemporaryOverrideRequest,
  CreateRoutineProfileRequest,
  CreateRoutineRequest,
  DeleteRoutineProfileRequest,
  DeleteRoutineRequest,
  ReplaceRoutineProfilesRequest,
  RoutineConfigurationSnapshot,
  RoutineMutationReceipt,
  SetRoutineMembershipEnabledRequest,
  SetRoutineProfileActiveRequest,
  SetRoutineTemporaryOverrideRequest,
  UpdateRoutineProfileRequest,
  UpdateRoutineRequest,
} from '@memoflow/contracts/routine';
import { RoutineChannels } from '@memoflow/contracts/electron';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';

export interface RoutineClientPort {
  getConfigurationSnapshot(): Promise<Result<RoutineConfigurationSnapshot>>;
  createRoutine(input: CreateRoutineRequest): Promise<Result<RoutineMutationReceipt>>;
  updateRoutine(
    routineId: string,
    input: UpdateRoutineRequest,
  ): Promise<Result<RoutineMutationReceipt>>;
  deleteRoutine(
    routineId: string,
    input?: DeleteRoutineRequest,
  ): Promise<Result<RoutineMutationReceipt>>;
  createProfile(input: CreateRoutineProfileRequest): Promise<Result<RoutineMutationReceipt>>;
  updateProfile(
    profileId: string,
    input: UpdateRoutineProfileRequest,
  ): Promise<Result<RoutineMutationReceipt>>;
  deleteProfile(
    profileId: string,
    input?: DeleteRoutineProfileRequest,
  ): Promise<Result<RoutineMutationReceipt>>;
  replaceRoutineProfiles(
    routineId: string,
    input: ReplaceRoutineProfilesRequest,
  ): Promise<Result<RoutineMutationReceipt>>;
  setMembershipEnabled(
    routineId: string,
    profileId: string,
    input: SetRoutineMembershipEnabledRequest,
  ): Promise<Result<RoutineMutationReceipt>>;
  setProfileActive(
    profileId: string,
    input: SetRoutineProfileActiveRequest,
  ): Promise<Result<RoutineMutationReceipt>>;
  setTemporaryOverride(
    routineId: string,
    input: SetRoutineTemporaryOverrideRequest,
  ): Promise<Result<RoutineMutationReceipt>>;
  clearTemporaryOverride(
    routineId: string,
    input?: ClearRoutineTemporaryOverrideRequest,
  ): Promise<Result<RoutineMutationReceipt>>;
}

export class RoutineHttpClient implements RoutineClientPort {
  private readonly baseUrl = '/routines';

  constructor(private readonly http: IResultHttpClient) {}

  getConfigurationSnapshot(): Promise<Result<RoutineConfigurationSnapshot>> {
    return this.http.get(this.baseUrl + '/configuration');
  }

  createRoutine(input: CreateRoutineRequest): Promise<Result<RoutineMutationReceipt>> {
    return this.http.post(this.baseUrl, input);
  }

  updateRoutine(
    routineId: string,
    input: UpdateRoutineRequest,
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.http.patch(this.baseUrl + '/' + routineId, input);
  }

  deleteRoutine(
    routineId: string,
    input: DeleteRoutineRequest = {},
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.http.delete(this.baseUrl + '/' + routineId, { data: input });
  }

  createProfile(input: CreateRoutineProfileRequest): Promise<Result<RoutineMutationReceipt>> {
    return this.http.post('/routine-profiles', input);
  }

  updateProfile(
    profileId: string,
    input: UpdateRoutineProfileRequest,
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.http.patch('/routine-profiles/' + profileId, input);
  }

  deleteProfile(
    profileId: string,
    input: DeleteRoutineProfileRequest = {},
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.http.delete('/routine-profiles/' + profileId, { data: input });
  }

  replaceRoutineProfiles(
    routineId: string,
    input: ReplaceRoutineProfilesRequest,
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.http.put(this.baseUrl + '/' + routineId + '/profiles', input);
  }

  setMembershipEnabled(
    routineId: string,
    profileId: string,
    input: SetRoutineMembershipEnabledRequest,
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.http.patch(
      this.baseUrl + '/' + routineId + '/profiles/' + profileId,
      input,
    );
  }

  setProfileActive(
    profileId: string,
    input: SetRoutineProfileActiveRequest,
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.http.patch('/routine-profiles/' + profileId + '/runtime', input);
  }

  setTemporaryOverride(
    routineId: string,
    input: SetRoutineTemporaryOverrideRequest,
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.http.put(this.baseUrl + '/' + routineId + '/override', input);
  }

  clearTemporaryOverride(
    routineId: string,
    input: ClearRoutineTemporaryOverrideRequest = {},
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.http.delete(this.baseUrl + '/' + routineId + '/override', { data: input });
  }
}

export class RoutineIpcClient implements RoutineClientPort {
  constructor(private readonly ipc: IResultIpcClient) {}

  getConfigurationSnapshot(): Promise<Result<RoutineConfigurationSnapshot>> {
    return this.ipc.invoke(RoutineChannels.CONFIGURATION_GET);
  }

  createRoutine(input: CreateRoutineRequest): Promise<Result<RoutineMutationReceipt>> {
    return this.ipc.invoke(RoutineChannels.CREATE, input);
  }

  updateRoutine(
    routineId: string,
    input: UpdateRoutineRequest,
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.ipc.invoke(RoutineChannels.UPDATE, routineId, input);
  }

  deleteRoutine(
    routineId: string,
    input: DeleteRoutineRequest = {},
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.ipc.invoke(RoutineChannels.DELETE, routineId, input);
  }

  createProfile(input: CreateRoutineProfileRequest): Promise<Result<RoutineMutationReceipt>> {
    return this.ipc.invoke(RoutineChannels.PROFILE_CREATE, input);
  }

  updateProfile(
    profileId: string,
    input: UpdateRoutineProfileRequest,
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.ipc.invoke(RoutineChannels.PROFILE_UPDATE, profileId, input);
  }

  deleteProfile(
    profileId: string,
    input: DeleteRoutineProfileRequest = {},
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.ipc.invoke(RoutineChannels.PROFILE_DELETE, profileId, input);
  }

  replaceRoutineProfiles(
    routineId: string,
    input: ReplaceRoutineProfilesRequest,
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.ipc.invoke(RoutineChannels.REPLACE_PROFILES, routineId, input);
  }

  setMembershipEnabled(
    routineId: string,
    profileId: string,
    input: SetRoutineMembershipEnabledRequest,
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.ipc.invoke(
      RoutineChannels.MEMBERSHIP_SET_ENABLED,
      routineId,
      profileId,
      input,
    );
  }

  setProfileActive(
    profileId: string,
    input: SetRoutineProfileActiveRequest,
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.ipc.invoke(RoutineChannels.PROFILE_SET_ACTIVE, profileId, input);
  }

  setTemporaryOverride(
    routineId: string,
    input: SetRoutineTemporaryOverrideRequest,
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.ipc.invoke(RoutineChannels.OVERRIDE_SET, routineId, input);
  }

  clearTemporaryOverride(
    routineId: string,
    input: ClearRoutineTemporaryOverrideRequest = {},
  ): Promise<Result<RoutineMutationReceipt>> {
    return this.ipc.invoke(RoutineChannels.OVERRIDE_CLEAR, routineId, input);
  }
}

export function createRoutineHttpClient(http: IResultHttpClient): RoutineClientPort {
  return new RoutineHttpClient(http);
}

export function createRoutineIpcClient(ipc: IResultIpcClient): RoutineClientPort {
  return new RoutineIpcClient(ipc);
}

export type { IResultHttpClient, IResultIpcClient };
