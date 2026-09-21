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
      const [row, temporaryOverrideRow, membershipRows] = await Promise.all([
        prisma.routineDefinition.findUnique({
          where: { identityId_id: { identityId, id: routineId } },
        }),
        prisma.routineTemporaryOverride.findUnique({
          where: { identityId_routineId: { identityId, routineId } },
        }),
        prisma.routineProfileMembership.findMany({
          where: { identityId, routineId },
          select: { enabled: true, profile: { select: { enabled: true } } },
        }),
      ]);
      return row ? mapRowToSnapshot(row, temporaryOverrideRow, membershipRows) : null;
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
  temporaryOverrideRow: Awaited<ReturnType<PrismaClient['routineTemporaryOverride']['findUnique']>>,
  membershipRows: ReadonlyArray<{
    readonly enabled: boolean;
    readonly profile: { readonly enabled: boolean };
  }>,
): RoutineScheduleSnapshot {
  const definition = RoutineDefinition.load({
    id: row.id,
    identityId: row.identityId,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    trigger: deserializeRoutineTrigger(row.triggerJson),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
  const durableProfileGateOpen =
    membershipRows.length === 0 ||
    membershipRows.some((membership) => membership.enabled && membership.profile.enabled);
  return {
    definition,
    durableProfileGateOpen,
    temporaryOverride: temporaryOverrideRow
      ? deserializeRoutineTemporaryOverride(temporaryOverrideRow.overrideJson)
      : null,
  };
}
