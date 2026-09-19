import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { ActiveUsageRoutineRegistration } from '../../runtime/active-usage';
import type { ElapsedRoutineRegistration } from '../../runtime/elapsed';
import { asInstant } from '@memoflow/time';
import type { RoutineRuntimeContext } from '../../domain/routine';
import type { AmbientBreakCreditRegistration } from '../../runtime/protocol-break-credit';
import {
  deserializeRoutineTemporaryOverride,
  deserializeRoutineTrigger,
} from './trigger-persistence-parity';

interface RoutineDefinitionRow {
  id: string;
  identity_id: string;
  enabled: 0 | 1;
  trigger_json: string | null;
  version: number;
  updated_at: string;
}

interface RoutineTemporaryOverrideRow {
  routine_id: string;
  override_json: string;
}


interface RoutineLocalOccurrenceRow {
  routine_id: string;
  occurrence_key: string;
  trigger_kind: 'Elapsed' | 'ActiveUsage';
  source_revision: string | null;
  resolution_state: 'Open' | 'Satisfied' | 'Skipped' | 'Expired';
  resolved_at: string | null;
  became_due_at: string;
}

interface RoutineMembershipPathRow {
  routine_id: string;
  membership_enabled: 0 | 1;
  profile_id: string;
  profile_enabled: 0 | 1;
}

function elapsedOccurrenceGeneration(row: RoutineLocalOccurrenceRow): number | null {
  const suffix = row.occurrence_key.slice(row.occurrence_key.lastIndexOf(':') + 1);
  const generation = Number(suffix);
  return Number.isInteger(generation) && generation > 0 ? generation : null;
}

function latestSatisfiedOccurrence(
  rows: readonly RoutineLocalOccurrenceRow[],
): RoutineLocalOccurrenceRow | null {
  return [...rows]
    .filter((row) => row.resolution_state === 'Satisfied' && row.resolved_at != null)
    .sort((a, b) => Date.parse(b.resolved_at!) - Date.parse(a.resolved_at!))[0] ?? null;
}

function coldStartGeneration(input: {
  readonly rows: readonly RoutineLocalOccurrenceRow[];
  readonly anchorRevision: string;
  readonly anchorAt: number;
  readonly durationMs: number;
}): number {
  const matching = input.rows
    .filter((row) => row.source_revision === input.anchorRevision)
    .map((row) => ({ row, generation: elapsedOccurrenceGeneration(row) }))
    .filter((entry): entry is { row: RoutineLocalOccurrenceRow; generation: number } =>
      entry.generation != null,
    )
    .sort((a, b) => b.generation - a.generation);
  const latest = matching[0];
  if (!latest) return 1;
  if (latest.row.resolution_state === 'Open') return latest.generation;

  const resolvedAt = latest.row.resolved_at == null ? NaN : Date.parse(latest.row.resolved_at);
  const nextByResolution = Number.isFinite(resolvedAt)
    ? Math.floor(Math.max(0, resolvedAt - input.anchorAt) / input.durationMs) + 1
    : latest.generation + 1;
  return Math.max(latest.generation + 1, nextByResolution);
}

function activeUsageGeneration(row: RoutineLocalOccurrenceRow): number | null {
  const suffix = row.occurrence_key.slice(row.occurrence_key.lastIndexOf(':') + 1);
  const generation = Number(suffix);
  return Number.isInteger(generation) && generation > 0 ? generation : null;
}

function activeUsageRestoredSnapshot(
  rows: readonly RoutineLocalOccurrenceRow[],
  trigger: ActiveUsageRoutineRegistration['trigger'],
): ActiveUsageRoutineRegistration['restoredSnapshot'] {
  const sequenced = rows
    .map((row) => ({ row, generation: activeUsageGeneration(row) }))
    .filter((entry): entry is { row: RoutineLocalOccurrenceRow; generation: number } =>
      entry.generation != null,
    )
    .sort((a, b) => b.generation - a.generation);
  const latest = sequenced[0];
  if (!latest) return null;

  const latestSatisfied = [...sequenced]
    .filter((entry) => entry.row.resolution_state === 'Satisfied' && entry.row.resolved_at != null)
    .sort((a, b) => Date.parse(b.row.resolved_at!) - Date.parse(a.row.resolved_at!))[0];
  const lastSatisfiedAt = latestSatisfied?.row.resolved_at
    ? asInstant(Date.parse(latestSatisfied.row.resolved_at))
    : null;
  if (lastSatisfiedAt != null && !Number.isFinite(Number(lastSatisfiedAt))) {
    throw new TypeError('ActiveUsage occurrence has invalid resolved_at');
  }

  if (latest.row.resolution_state === 'Open') {
    return {
      identityId: '',
      routineId: '',
      accumulatedActiveMs: trigger.requiredActiveMs,
      generation: latest.generation,
      thresholdSignaled: false,
      lastSatisfiedAt,
    };
  }
  return {
    identityId: '',
    routineId: '',
    accumulatedActiveMs: 0,
    generation: latest.generation + 1,
    thresholdSignaled: false,
    lastSatisfiedAt,
  };
}

export interface RoutineLocalRegistrationsSnapshot {
  readonly elapsed: readonly ElapsedRoutineRegistration[];
  readonly activeUsage: readonly ActiveUsageRoutineRegistration[];
  readonly protocolBreakCredits: readonly AmbientBreakCreditRegistration[];
}

/** Projects durable Routine state into the local ActiveUsage runtime. */
export async function loadPowerSyncRoutineLocalRegistrations(
  db: IElectronDatabase,
  identityId: string,
  runtimeContext: RoutineRuntimeContext,
): Promise<RoutineLocalRegistrationsSnapshot> {
  const owner = identityId.trim();
  if (!owner) throw new TypeError('Routine local registration identityId must not be empty');

  const [definitions, membershipPaths, overrideRows, localOccurrenceRows] = await Promise.all([
    db.getAll<RoutineDefinitionRow>(
      `SELECT id, identity_id, enabled, trigger_json, version, updated_at
         FROM routine_definitions
        WHERE identity_id = ?
        ORDER BY id`,
      [owner],
    ),
    db.getAll<RoutineMembershipPathRow>(
      `SELECT m.routine_id,
              m.profile_id,
              m.enabled AS membership_enabled,
              p.enabled AS profile_enabled
         FROM routine_profile_memberships m
         JOIN routine_profiles p
           ON p.identity_id = m.identity_id
          AND p.id = m.profile_id
        WHERE m.identity_id = ?
        ORDER BY m.routine_id, m.profile_id`,
      [owner],
    ),
    db.getAll<RoutineTemporaryOverrideRow>(
      `SELECT routine_id, override_json
         FROM routine_temporary_overrides
        WHERE identity_id = ?
        ORDER BY routine_id`,
      [owner],
    ),
    db.getAll<RoutineLocalOccurrenceRow>(
      `SELECT routine_id, occurrence_key, trigger_kind, source_revision,
              resolution_state, resolved_at, became_due_at
         FROM routine_occurrences
        WHERE identity_id = ?
          AND trigger_kind IN ('Elapsed', 'ActiveUsage')
        ORDER BY routine_id, became_due_at DESC, created_at DESC`,
      [owner],
    ),
  ]);

  const pathsByRoutine = new Map<string, RoutineMembershipPathRow[]>();
  for (const row of membershipPaths) {
    const paths = pathsByRoutine.get(row.routine_id) ?? [];
    paths.push(row);
    pathsByRoutine.set(row.routine_id, paths);
  }

  const overridesByRoutine = new Map(
    overrideRows.map((row) => [row.routine_id, deserializeRoutineTemporaryOverride(row.override_json)] as const),
  );
  const elapsedOccurrencesByRoutine = new Map<string, RoutineLocalOccurrenceRow[]>();
  const activeUsageOccurrencesByRoutine = new Map<string, RoutineLocalOccurrenceRow[]>();
  for (const row of localOccurrenceRows) {
    const target =
      row.trigger_kind === 'Elapsed' ? elapsedOccurrencesByRoutine : activeUsageOccurrencesByRoutine;
    const rows = target.get(row.routine_id) ?? [];
    rows.push(row);
    target.set(row.routine_id, rows);
  }

  const elapsed: ElapsedRoutineRegistration[] = [];
  const activeUsage: ActiveUsageRoutineRegistration[] = [];
  const protocolBreakCredits: AmbientBreakCreditRegistration[] = [];

  for (const row of definitions) {
    if (row.identity_id !== owner) {
      throw new TypeError(`Routine local registration ownership mismatch for '${row.id}'`);
    }
    const trigger = deserializeRoutineTrigger(row.trigger_json);
    if (trigger?.type !== 'ActiveUsage' && trigger?.type !== 'Elapsed') continue;

    const paths = pathsByRoutine.get(row.id) ?? [];
    const membershipPathEnabled =
      paths.length === 0
        ? null
        : paths.some(
            (path) =>
              path.membership_enabled === 1 &&
              path.profile_enabled === 1 &&
              runtimeContext.activeProfileIds.includes(path.profile_id),
          );

    const gates = {
      routineEnabled: row.enabled === 1,
      ...(overridesByRoutine.has(row.id)
        ? { temporaryOverride: overridesByRoutine.get(row.id)! }
        : {}),
      ...(membershipPathEnabled == null
        ? {}
        : {
            profileEnabled: membershipPathEnabled,
            membershipEnabled: membershipPathEnabled,
          }),
    };

    if (trigger.type === 'Elapsed') {
      const updatedAtMs = Date.parse(row.updated_at);
      if (!Number.isFinite(updatedAtMs)) {
        throw new TypeError(`Routine '${row.id}' has invalid updated_at runtime anchor`);
      }
      const occurrenceRows = elapsedOccurrencesByRoutine.get(row.id) ?? [];
      const lastSatisfied = latestSatisfiedOccurrence(occurrenceRows);
      const lastSatisfiedAtMs = lastSatisfied?.resolved_at
        ? Date.parse(lastSatisfied.resolved_at)
        : null;
      if (lastSatisfiedAtMs != null && !Number.isFinite(lastSatisfiedAtMs)) {
        throw new TypeError(`Routine '${row.id}' has invalid last satisfied runtime anchor`);
      }
      const useLastSatisfied = trigger.anchor === 'last-satisfied' && lastSatisfiedAtMs != null;
      const durableAnchorAt = useLastSatisfied ? lastSatisfiedAtMs! : updatedAtMs;
      const durableAnchorRevision = useLastSatisfied
        ? `satisfied-${lastSatisfiedAtMs}`
        : `definition-${row.version}`;
      elapsed.push({
        identityId: owner,
        routineId: row.id,
        trigger,
        gates,
        ...(trigger.anchor === 'profile-activation'
          ? {}
          : {
              durableAnchorAt: asInstant(durableAnchorAt),
              durableAnchorRevision,
              initialGeneration: coldStartGeneration({
                rows: occurrenceRows,
                anchorRevision: durableAnchorRevision,
                anchorAt: durableAnchorAt,
                durationMs: trigger.durationMs,
              }),
            }),
      });
      continue;
    }

    const durableActiveUsageSnapshot = activeUsageRestoredSnapshot(
      activeUsageOccurrencesByRoutine.get(row.id) ?? [],
      trigger,
    );
    activeUsage.push({
      identityId: owner,
      routineId: row.id,
      trigger,
      gates,
      ...(durableActiveUsageSnapshot
        ? {
            restoredSnapshot: {
              ...durableActiveUsageSnapshot,
              identityId: owner,
              routineId: row.id,
            },
          }
        : {}),
    });
    if (trigger.protocolBreakCredit) {
      protocolBreakCredits.push({
        identityId: owner,
        routineId: row.id,
        kind: trigger.protocolBreakCredit.kind,
        minimumBreakMs: trigger.protocolBreakCredit.minimumBreakMs,
      });
    }
  }

  return { elapsed, activeUsage, protocolBreakCredits };
}
