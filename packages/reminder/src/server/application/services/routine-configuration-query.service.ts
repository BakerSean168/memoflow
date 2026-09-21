import type {
  RoutineConfigurationSnapshot,
  RoutineDefinitionDto,
  RoutineMembershipDto,
  RoutineProfileDto,
  RoutineTemporaryOverrideDto,
  RoutineTriggerDto,
  RoutineUpcomingQuery,
  RoutineUpcomingResponse,
} from '@memoflow/contracts/routine';
import { asInstant, createRecurrenceEngine, type RecurrenceEnginePort } from '@memoflow/time';
import type {
  RoutineProfileStore,
  RoutineRuntimeContextStore,
  RoutineTemporaryOverrideStore,
} from '../../domain/ports';
import {
  computeRoutineNextEligibleOccurrence,
  type ProfileMembership,
  type RoutineDefinition,
  type RoutineProfile,
  type RoutineTemporaryOverride,
} from '../../domain/routine';

export interface RoutineConfigurationQueryPort {
  getConfigurationSnapshot(identityId: string): Promise<RoutineConfigurationSnapshot>;
  getUpcomingOccurrences(
    identityId: string,
    query: RoutineUpcomingQuery,
  ): Promise<RoutineUpcomingResponse>;
}

export interface CreateRoutineConfigurationQueryServiceOptions {
  readonly routineProfileStore: RoutineProfileStore;
  readonly runtimeContextStore: RoutineRuntimeContextStore;
  readonly temporaryOverrideStore: RoutineTemporaryOverrideStore;
  readonly recurrenceEngine?: RecurrenceEnginePort;
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

function profileDto(
  profile: RoutineProfile,
  activeProfileIds: ReadonlySet<string>,
): RoutineProfileDto {
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

/** Read-only projection for the Routine Configuration Center and adjacent product surfaces. */
export function createRoutineConfigurationQueryService(
  options: CreateRoutineConfigurationQueryServiceOptions,
): RoutineConfigurationQueryPort {
  const recurrenceEngine = options.recurrenceEngine ?? createRecurrenceEngine();

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

    async getUpcomingOccurrences(identityId, query) {
      const definitions = await options.routineProfileStore.listDefinitions({ identityId });
      const occurrences: RoutineUpcomingResponse['occurrences'] = [];

      for (const definition of definitions) {
        if (!definition.enabled || definition.trigger?.type !== 'WallClock') continue;
        const temporaryOverride = await options.temporaryOverrideStore.findRoutineTemporaryOverride(
          {
            identityId,
            routineId: definition.id,
          },
        );
        let cursor = asInstant(query.start > 0 ? query.start - 1 : query.start);

        for (let count = 0; count < query.limit; count += 1) {
          const occurrence = computeRoutineNextEligibleOccurrence({
            routineId: definition.id,
            engine: recurrenceEngine,
            trigger: definition.trigger,
            after: cursor,
            temporaryOverride,
          });
          if (!occurrence || Number(occurrence.occurrenceAt) > query.end) break;

          occurrences.push({
            identityId,
            routineId: definition.id,
            occurrenceKey: occurrence.occurrenceKey,
            title: definition.name,
            description: definition.description,
            occurrenceAt: Number(occurrence.occurrenceAt),
            endAt: null,
            revision: definition.version,
            editable: false,
          });
          cursor = occurrence.occurrenceAt;
        }
      }

      occurrences.sort((left, right) =>
        left.occurrenceAt === right.occurrenceAt
          ? left.occurrenceKey.localeCompare(right.occurrenceKey)
          : left.occurrenceAt - right.occurrenceAt,
      );
      return { occurrences: occurrences.slice(0, query.limit) };
    },
  };
}
