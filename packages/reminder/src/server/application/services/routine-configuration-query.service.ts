import type {
  RoutineConfigurationSnapshot,
  RoutineDefinitionDto,
  RoutineMembershipDto,
  RoutineProfileDto,
  RoutineTemporaryOverrideDto,
  RoutineTriggerDto,
} from '@memoflow/contracts/routine';
import type {
  RoutineProfileStore,
  RoutineRuntimeContextStore,
  RoutineTemporaryOverrideStore,
} from '../../domain/ports';
import type {
  ProfileMembership,
  RoutineDefinition,
  RoutineProfile,
  RoutineTemporaryOverride,
} from '../../domain/routine';

export interface RoutineConfigurationQueryPort {
  getConfigurationSnapshot(identityId: string): Promise<RoutineConfigurationSnapshot>;
}

export interface CreateRoutineConfigurationQueryServiceOptions {
  readonly routineProfileStore: RoutineProfileStore;
  readonly runtimeContextStore: RoutineRuntimeContextStore;
  readonly temporaryOverrideStore: RoutineTemporaryOverrideStore;
  /** True only when this host owns the local Elapsed/ActiveUsage runtime. */
  readonly localRuntimeAvailable?: boolean;
}

function definitionDto(definition: RoutineDefinition): RoutineDefinitionDto {
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    enabled: definition.enabled,
    trigger: definition.trigger
      ? (JSON.parse(JSON.stringify(definition.trigger)) as RoutineTriggerDto)
      : null,
    version: definition.version,
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString(),
  };
}

function profileDto(profile: RoutineProfile, activeProfileIds: ReadonlySet<string>): RoutineProfileDto {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    enabled: profile.enabled,
    active: activeProfileIds.has(profile.id),
    version: profile.version,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function membershipDto(membership: ProfileMembership): RoutineMembershipDto {
  return {
    routineId: membership.routineId,
    profileId: membership.profileId,
    enabled: membership.enabled,
    version: membership.version,
  };
}

function overrideDto(
  routineId: string,
  override: RoutineTemporaryOverride,
): RoutineTemporaryOverrideDto {
  return {
    routineId,
    snoozeUntil: override.snoozeUntil == null ? null : Number(override.snoozeUntil),
    suppressUntil: override.suppressUntil == null ? null : Number(override.suppressUntil),
    overrideIntervalMs: override.overrideIntervalMs,
    expiresAt: Number(override.expiresAt),
    reason: override.reason,
    source: override.source,
  };
}

/** Read-only projection for the Routine Configuration Center. */
export function createRoutineConfigurationQueryService(
  options: CreateRoutineConfigurationQueryServiceOptions,
): RoutineConfigurationQueryPort {
  return {
    async getConfigurationSnapshot(identityId) {
      const definitions = await options.routineProfileStore.listDefinitions({ identityId });
      const profiles = await options.routineProfileStore.listProfiles({ identityId });
      const memberships = await options.routineProfileStore.listMembershipsForRoutines({
        identityId,
        routineIds: definitions.map((definition) => definition.id),
      });
      const runtimeContext = options.runtimeContextStore.get({ identityId });
      const activeProfileIds = new Set(runtimeContext.activeProfileIds);
      const overrides: RoutineTemporaryOverrideDto[] = [];
      for (const definition of definitions) {
        const override = await options.temporaryOverrideStore.findRoutineTemporaryOverride({
          identityId,
          routineId: definition.id,
        });
        if (override) overrides.push(overrideDto(definition.id, override));
      }

      return {
        definitions: definitions.map(definitionDto),
        profiles: profiles.map((profile) => profileDto(profile, activeProfileIds)),
        memberships: memberships.map(membershipDto),
        runtimeContext: { activeProfileIds: [...runtimeContext.activeProfileIds] },
        capabilities: { localRuntime: options.localRuntimeAvailable ?? false },
        overrides,
      };
    },
  };
}
