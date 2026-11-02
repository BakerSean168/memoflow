import {
  ProfileMembership,
  createSnoozeOverride,
  createTemporaryOverride,
} from '../../../domain/routine';
import type { RoutineCoachCommandPort } from '../routine-coach-command.service';
import {
  positiveInteger,
  routineConflict,
  routineNotFound,
  type RoutineCoachCommandContext,
} from './command-context';

export function createMembershipCommands(
  ctx: RoutineCoachCommandContext,
): Pick<
  RoutineCoachCommandPort,
  | 'replaceRoutineProfiles'
  | 'setMembershipEnabled'
  | 'setProfileActive'
  | 'setTemporaryOverride'
  | 'clearTemporaryOverride'
  | 'respondToOccurrence'
> {
  const { options, now, notifyOverrideChanged, notifyScheduleChanged } = ctx;
  return {
    async replaceRoutineProfiles(input) {
      const routine = await options.routineProfileStore.findDefinition({
        identityId: input.identityId,
        routineId: input.routineId,
      });
      if (!routine) throw routineNotFound(`Routine '${input.routineId}' was not found`);
      if (routine.version !== input.expectedVersion)
        throw routineConflict(`Routine '${input.routineId}' version conflict`);
      const profileIds = [...input.profileIds];
      if (new Set(profileIds).size !== profileIds.length)
        throw new TypeError('Duplicate Routine profile membership');
      const profiles = await options.routineProfileStore.findProfilesByIds({
        identityId: input.identityId,
        profileIds,
      });
      if (profiles.length !== profileIds.length)
        throw routineNotFound('One or more Routine profiles were not found');
      const existing = await options.routineProfileStore.listMembershipsForRoutine({
        identityId: input.identityId,
        routineId: input.routineId,
      });
      const existingByProfile = new Map(
        existing.map((membership) => [membership.profileId, membership]),
      );
      const memberships = profileIds.map(
        (profileId) =>
          existingByProfile.get(profileId) ??
          ProfileMembership.create({
            identityId: input.identityId,
            profileId,
            routineId: input.routineId,
            now: new Date(input.at ?? now()),
          }),
      );
      await options.routineProfileStore.replaceRoutineMemberships({
        identityId: input.identityId,
        routineId: input.routineId,
        memberships,
        expectedVersion: input.expectedVersion,
      });
      await notifyScheduleChanged(input.identityId, input.routineId);
      return {
        identityId: input.identityId,
        routineId: input.routineId,
        profileIds,
        version: input.expectedVersion + 1,
      };
    },

    async setMembershipEnabled(input) {
      const memberships = await options.routineProfileStore.listMembershipsForRoutine({
        identityId: input.identityId,
        routineId: input.routineId,
      });
      const membership = memberships.find((entry) => entry.profileId === input.profileId);
      if (!membership)
        throw routineNotFound(`Routine membership '${input.profileId}' was not found`);
      if (membership.version !== input.expectedVersion)
        throw routineConflict('Routine membership version conflict');
      if (input.enabled) membership.enable(new Date(input.at ?? now()));
      else membership.disable(new Date(input.at ?? now()));
      await options.routineProfileStore.upsertMembership(membership, input.expectedVersion);
      await notifyScheduleChanged(input.identityId, input.routineId);
      return {
        identityId: input.identityId,
        routineId: input.routineId,
        profileId: input.profileId,
        enabled: membership.enabled,
        version: membership.version,
      };
    },

    async setProfileActive(input) {
      const profile = await options.routineProfileStore.findProfile({
        identityId: input.identityId,
        profileId: input.profileId,
      });
      if (!profile) throw routineNotFound(`Routine profile '${input.profileId}' was not found`);
      const receipt = options.runtimeContextStore.setProfileActive({
        identityId: profile.identityId,
        profileId: profile.id,
        active: input.active,
        at: input.at,
      });
      await options.onProfileActiveChanged?.({
        identityId: profile.identityId,
        profileId: profile.id,
        active: input.active,
      });
      return receipt;
    },

    async setTemporaryOverride(input) {
      const routine = await options.routineProfileStore.findDefinition({
        identityId: input.identityId,
        routineId: input.routineId,
      });
      if (!routine) throw routineNotFound(`Routine '${input.routineId}' was not found`);
      const override = createTemporaryOverride({
        snoozeUntil: input.snoozeUntil,
        suppressUntil: input.suppressUntil,
        overrideIntervalMs: input.overrideIntervalMs,
        expiresAt: input.expiresAt,
        reason: input.reason,
        source: input.source ?? 'ai',
      });
      await options.temporaryOverrideStore.setRoutineTemporaryOverride({
        identityId: input.identityId,
        routineId: input.routineId,
        override,
        expectedVersion: input.expectedVersion,
      });
      await notifyOverrideChanged(input.identityId, input.routineId);
      return { identityId: input.identityId, routineId: input.routineId, override };
    },

    async clearTemporaryOverride(input) {
      const existing = await options.temporaryOverrideStore.findRoutineTemporaryOverride(input);
      if (existing == null && input.expectedVersion !== undefined) {
        return { identityId: input.identityId, routineId: input.routineId, override: null };
      }
      await options.temporaryOverrideStore.clearRoutineTemporaryOverride(input);
      if (existing != null) await notifyOverrideChanged(input.identityId, input.routineId);
      return { identityId: input.identityId, routineId: input.routineId, override: null };
    },

    async respondToOccurrence(input) {
      const commandId = input.commandId.trim();
      if (!commandId) throw new TypeError('Routine occurrence commandId must not be empty');
      const occurrence = await options.occurrenceTruthStore.findOccurrence({
        identityId: input.identityId,
        routineId: input.routineId,
        occurrenceKey: input.occurrenceKey,
      });
      if (!occurrence) {
        throw routineNotFound(`Routine occurrence '${input.occurrenceKey}' was not found`);
      }
      const actedAt = input.at ?? now();
      const action =
        input.action === 'acknowledge'
          ? 'Acknowledged'
          : input.action === 'complete'
            ? 'Completed'
            : input.action === 'snooze'
              ? 'Snoozed'
              : input.action === 'dismiss'
                ? 'Dismissed'
                : 'Skipped';
      const responseLatencyMs =
        input.responseLatencyMs ?? Math.max(0, actedAt - Number(occurrence.becameDueAt));

      const snoozeDurationMs =
        input.action === 'snooze'
          ? positiveInteger(input.snoozeDurationMs ?? 0, 'snoozeDurationMs')
          : null;
      const temporaryOverride =
        snoozeDurationMs == null
          ? null
          : createSnoozeOverride({
              now: actedAt,
              durationMs: snoozeDurationMs,
              reason: 'Routine occurrence snoozed',
              source: 'user',
            });

      // Interaction + snooze product state are one owner-domain commit. This is
      // the replay fence: a failed transaction leaves neither side visible, and
      // the same commandId returns the original fact without extending snooze.
      const receipt = await options.occurrenceTruthStore.applyInteraction({
        idempotencyKey: commandId,
        identityId: input.identityId,
        routineId: input.routineId,
        occurrenceKey: input.occurrenceKey,
        action,
        actedAt,
        responseLatencyMs,
        snoozeDurationMs,
        temporaryOverride,
        metadata: input.metadata,
      });
      if (input.action === 'snooze') {
        await notifyOverrideChanged(input.identityId, input.routineId);
      }
      // Completion must reach the local runtime BEFORE any schedule
      // reconciliation: a refresh triggered below snapshots the lane, and a
      // stale thresholdSignaled=true would keep it silent until restart.
      if (input.action === 'complete' && !receipt.replayed) {
        await options.onOccurrenceCompleted?.({
          identityId: input.identityId,
          routineId: input.routineId,
          occurrenceKey: input.occurrenceKey,
          triggerKind: receipt.occurrence.triggerKind,
          at: actedAt,
        });
      }
      if (input.action === 'complete' || input.action === 'skip') {
        // Durable Elapsed ownership depends on business resolution truth. A
        // terminal response may reset the last-satisfied anchor or advance the
        // routine-activation generation, so reconcile the Scheduler owner now.
        await notifyScheduleChanged(input.identityId, input.routineId);
      }
      return receipt;
    },
  };
}
