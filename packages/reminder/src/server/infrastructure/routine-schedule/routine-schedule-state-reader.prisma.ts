import type { PrismaClient } from '@memoflow/database';
import { RoutineDefinition } from '../../domain/routine';
import {
  deserializeRoutineTemporaryOverride,
  deserializeRoutineTrigger,
} from '../routine-vnext/trigger-persistence-parity';
import type {
  RoutineScheduleSnapshot,
  RoutineScheduleStateReader,
} from './routine-schedule-projection-source';

type PrismaRoutineDefinitionRow = NonNullable<
  Awaited<ReturnType<PrismaClient['routineDefinition']['findUnique']>>
>;

/**
 * Prisma-backed RoutineScheduleStateReader (`routine_definitions` + persisted
 * Profile/M:N membership gates + `routine_temporary_overrides`). The ROUTINE
 * schedule lane consumes the same Table/trigger codec the legacy powering tables use
 * (trigger-persistence-parity), so projection and execution agree on canonical
 * occurrence keys.
 *
 * `temporaryOverride` is decoded from the durable row written by
 * `PrismaRoutineTemporaryOverrideStore`: a persisted snooze/suppress therefore
 * shifts (or suppresses) the projected durable invocation in production instead
 * of being test-only injected state.
 */
export function createPrismaRoutineScheduleStateReader(
  prisma: PrismaClient,
): RoutineScheduleStateReader {
  return {
    async readRoutineScheduleSnapshot(routineId, identityId) {
      const [row, preferenceRow, temporaryOverrideRow, membershipRows, elapsedOccurrenceRows] =
        await Promise.all([
          prisma.routineDefinition.findUnique({
            where: { identityId_id: { identityId, id: routineId } },
          }),
          prisma.routinePreference.findUnique({
            where: { identityId },
            select: { globalEnabled: true },
          }),
          prisma.routineTemporaryOverride.findUnique({
            where: { identityId_routineId: { identityId, routineId } },
          }),
          prisma.routineProfileMembership.findMany({
            where: { identityId, routineId },
            select: { enabled: true, profile: { select: { enabled: true } } },
          }),
          prisma.routineOccurrence.findMany({
            where: { identityId, routineId, triggerKind: 'Elapsed' },
            select: {
              occurrenceKey: true,
              sourceRevision: true,
              resolutionState: true,
              resolvedAt: true,
            },
            orderBy: [{ becameDueAt: 'desc' }, { id: 'desc' }],
            take: 128,
          }),
        ]);
      return row
        ? mapRowToSnapshot(
            row,
            preferenceRow,
            temporaryOverrideRow,
            membershipRows,
            elapsedOccurrenceRows,
          )
        : null;
    },

    async listRoutineRefs() {
      // Enumerate every definition, not only currently enabled WallClock rows.
      // A missed disable/trigger-change event must still be able to reconcile
      // the old Scheduler owner to an empty desired set on restart.
      const rows = await prisma.routineDefinition.findMany();
      return rows.map((row) => ({ routineId: row.id, identityId: row.identityId }));
    },
  };
}

function mapRowToSnapshot(
  row: PrismaRoutineDefinitionRow,
  preferenceRow: { readonly globalEnabled: boolean } | null,
  temporaryOverrideRow: Awaited<ReturnType<PrismaClient['routineTemporaryOverride']['findUnique']>>,
  membershipRows: ReadonlyArray<{
    readonly enabled: boolean;
    readonly profile: { readonly enabled: boolean };
  }>,
  elapsedOccurrenceRows: ReadonlyArray<{
    readonly occurrenceKey: string;
    readonly sourceRevision: string | null;
    readonly resolutionState: string;
    readonly resolvedAt: Date | null;
  }>,
): RoutineScheduleSnapshot {
  const definition = RoutineDefinition.load({
    id: row.id,
    identityId: row.identityId,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    trigger: deserializeRoutineTrigger(row.triggerJson),
    activatedAt: row.activatedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
  const durableProfileGateOpen =
    membershipRows.length === 0 ||
    membershipRows.some((membership) => membership.enabled && membership.profile.enabled);
  return {
    definition,
    globalEnabled: preferenceRow?.globalEnabled ?? true,
    durableProfileGateOpen,
    temporaryOverride: temporaryOverrideRow
      ? deserializeRoutineTemporaryOverride(temporaryOverrideRow.overrideJson)
      : null,
    elapsedOccurrences: elapsedOccurrenceRows.map((occurrence) => ({
      occurrenceKey: occurrence.occurrenceKey,
      sourceRevision: occurrence.sourceRevision,
      resolutionState: requireElapsedResolutionState(occurrence.resolutionState),
      resolvedAt: occurrence.resolvedAt == null ? null : occurrence.resolvedAt.getTime(),
    })),
  };
}

function requireElapsedResolutionState(
  value: string,
): 'Open' | 'Satisfied' | 'Skipped' | 'Expired' {
  if (value === 'Open' || value === 'Satisfied' || value === 'Skipped' || value === 'Expired') {
    return value;
  }
  throw new TypeError(`Invalid Routine Elapsed resolution state: ${value}`);
}
