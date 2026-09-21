import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  CreateRoutineProfileRequest,
  CreateRoutineRequest,
  DeleteRoutineProfileRequest,
  DeleteRoutineRequest,
  ReplaceRoutineProfilesRequest,
  RoutineConfigurationSnapshot,
  SetRoutineMembershipEnabledRequest,
  SetRoutineProfileActiveRequest,
  SetRoutineTemporaryOverrideRequest,
  UpdateRoutineProfileRequest,
  UpdateRoutineRequest,
} from '@memoflow/contracts/routine';
import { toResultErrorException, type Result } from '@memoflow/contracts/result';
import { ROUTINE_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { translateResultError } from '../../../shared/utils/translate-result-error';

const EMPTY_SNAPSHOT: RoutineConfigurationSnapshot = {
  definitions: [],
  profiles: [],
  memberships: [],
  runtimeContext: { activeProfileIds: [] },
  capabilities: { localRuntime: false },
  overrides: [],
};

function unwrapResult<T>(result: Result<T>): T {
  if (!result.ok) throw toResultErrorException(result.error);
  return result.data;
}

export function useRoutineConfiguration() {
  const { t } = useI18n();
  const service = useStrictInject(ROUTINE_SERVICE_KEY, 'ROUTINE_SERVICE_KEY');
  const snapshot = ref<RoutineConfigurationSnapshot>(EMPTY_SNAPSHOT);
  const loading = ref(false);
  const mutating = ref(false);
  const error = ref<string | null>(null);

  const enabledCount = computed(
    () => snapshot.value.definitions.filter((definition) => definition.enabled).length,
  );
  const activeProfileCount = computed(
    () => snapshot.value.profiles.filter((profile) => profile.active).length,
  );

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      snapshot.value = unwrapResult(await service.getConfigurationSnapshot());
    } catch (cause) {
      error.value = translateResultError(cause, t, { fallbackKey: 'routine.toast.operationFailed' });
    } finally {
      loading.value = false;
    }
  }

  async function mutate(work: () => Promise<Result<unknown>>): Promise<void> {
    mutating.value = true;
    error.value = null;
    try {
      unwrapResult(await work());
      await load();
    } catch (cause) {
      error.value = translateResultError(cause, t, { fallbackKey: 'routine.toast.operationFailed' });
      throw cause;
    } finally {
      mutating.value = false;
    }
  }

  return {
    snapshot,
    loading,
    mutating,
    error,
    enabledCount,
    activeProfileCount,
    load,
    createRoutine: (input: CreateRoutineRequest) => mutate(() => service.createRoutine(input)),
    updateRoutine: (routineId: string, input: UpdateRoutineRequest) =>
      mutate(() => service.updateRoutine(routineId, input)),
    deleteRoutine: (routineId: string, input: DeleteRoutineRequest = {}) =>
      mutate(() => service.deleteRoutine(routineId, input)),
    createProfile: (input: CreateRoutineProfileRequest) =>
      mutate(() => service.createProfile(input)),
    updateProfile: (profileId: string, input: UpdateRoutineProfileRequest) =>
      mutate(() => service.updateProfile(profileId, input)),
    deleteProfile: (profileId: string, input: DeleteRoutineProfileRequest = {}) =>
      mutate(() => service.deleteProfile(profileId, input)),
    replaceRoutineProfiles: (routineId: string, input: ReplaceRoutineProfilesRequest) =>
      mutate(() => service.replaceRoutineProfiles(routineId, input)),
    setMembershipEnabled: (
      routineId: string,
      profileId: string,
      input: SetRoutineMembershipEnabledRequest,
    ) => mutate(() => service.setMembershipEnabled(routineId, profileId, input)),
    setProfileActive: (profileId: string, input: SetRoutineProfileActiveRequest) =>
      mutate(() => service.setProfileActive(profileId, input)),
    setTemporaryOverride: (routineId: string, input: SetRoutineTemporaryOverrideRequest) =>
      mutate(() => service.setTemporaryOverride(routineId, input)),
    clearTemporaryOverride: (routineId: string) =>
      mutate(() => service.clearTemporaryOverride(routineId)),
  };
}
