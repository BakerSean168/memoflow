import type {
  RoutineConfigurationSnapshot,
  RoutineDefinitionDto,
  RoutineMembershipDto,
  RoutineProfileDto,
  RoutineTemporaryOverrideDto,
  RoutineTriggerDto,
  RoutineUpcomingQuery,
  RoutineUpcomingResponse,
} from '@memoflow/routine-contracts';
import { asInstant, createRecurrenceEngine, type RecurrenceEnginePort } from '@memoflow/time';
import type {
  RoutineOccurrenceTruthStore,
  RoutineProfileStore,
  RoutinePreferencesStore,
  RoutineRuntimeContextStore,
  RoutineTemporaryOverrideStore,
} from '../../domain/ports';
import {
  computeRoutineNextEligibleOccurrence,
  computeDurableElapsedNextOccurrence,
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
  readonly routinePreferencesStore?: RoutinePreferencesStore;
  readonly runtimeContextStore: RoutineRuntimeContextStore;
  readonly temporaryOverrideStore: RoutineTemporaryOverrideStore;
  readonly occurrenceTruthStore?: RoutineOccurrenceTruthStore;
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
      const preferences = options.routinePreferencesStore
        ? await options.routinePreferencesStore.find({ identityId })
        : null;
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
        preferences: {
          globalEnabled: preferences?.globalEnabled ?? true,
          version: preferences?.version ?? 0,
        },
        runtimeContext: { activeProfileIds: [...runtimeContext.activeProfileIds] },
        capabilities: { localRuntime: options.localRuntimeAvailable ?? false },
        overrides,
      };
    },

    async getUpcomingOccurrences(identityId, query) {
      const preferences = options.routinePreferencesStore
        ? await options.routinePreferencesStore.find({ identityId })
        : null;
      if (preferences?.globalEnabled === false) return { occurrences: [] };

      const definitions = await options.routineProfileStore.listDefinitions({ identityId });
      const memberships = await options.routineProfileStore.listMembershipsForRoutines({
        identityId,
        routineIds: definitions.map((definition) => definition.id),
      });
      const profileIds = Array.from(new Set(memberships.map((membership) => membership.profileId)));
      const profiles = await options.routineProfileStore.findProfilesByIds({
        identityId,
        profileIds,
      });
      const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
      const membershipsByRoutine = new Map<string, ProfileMembership[]>();
      for (const membership of memberships) {
        const paths = membershipsByRoutine.get(membership.routineId) ?? [];
        paths.push(membership);
        membershipsByRoutine.set(membership.routineId, paths);
      }
      const occurrences: RoutineUpcomingResponse['occurrences'] = [];

      const facts = query.includeElapsed && options.occurrenceTruthStore
        ? await options.occurrenceTruthStore.listOccurrences({ identityId })
        : [];
      for (const definition of definitions) {
        if (!definition.enabled || !definition.trigger) continue;
        if (definition.trigger.type !== 'WallClock' &&
          !(query.includeElapsed && definition.trigger.type === 'Elapsed')) continue;
        const paths = membershipsByRoutine.get(definition.id) ?? [];
        const durableProfileGateOpen =
          paths.length === 0 ||
          paths.some(
            (membership) =>
              membership.enabled && (profilesById.get(membership.profileId)?.enabled ?? false),
          );
        if (!durableProfileGateOpen) continue;
        const temporaryOverride = await options.temporaryOverrideStore.findRoutineTemporaryOverride(
          {
            identityId,
            routineId: definition.id,
          },
        );
        if (definition.trigger.type === 'Elapsed') {
          const history = facts.filter((fact) => fact.routineId === definition.id);
          const open = history.find((fact) => fact.resolutionState === 'Open');
          const next = definition.trigger.timingOwner === 'scheduler'
            ? computeDurableElapsedNextOccurrence({
                routineId: definition.id,
                trigger: definition.trigger,
                activatedAt: definition.activatedAt,
                occurrences: history,
                temporaryOverride,
              })
            : null;
          const occurrenceAt = open ? Number(open.scheduledFor ?? open.becameDueAt)
            : next ? Number(next.runAt) : query.start;
          if (occurrenceAt > query.end) continue;
          occurrences.push({
            identityId, routineId: definition.id,
            occurrenceKey: open?.occurrenceKey ?? next?.occurrenceKey ?? `routine:${definition.id}:local-runtime`,
            title: definition.name, description: definition.description,
            occurrenceAt, intervalMs: definition.trigger.durationMs,
            timingStatus: open ? 'awaiting-completion' : next ? 'scheduled' : 'local-runtime',
            endAt: null, revision: definition.version, editable: false,
          });
          continue;
        }
        if (definition.trigger.type !== 'WallClock') continue;
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
