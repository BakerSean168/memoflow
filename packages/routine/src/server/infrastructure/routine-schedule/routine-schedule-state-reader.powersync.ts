import type { IElectronDatabase } from '@memoflow/desktop-contracts';
import { RoutineDefinition } from '../../domain/routine';
import {
  deserializeRoutineTemporaryOverride,
  deserializeRoutineTrigger,
} from '../routine-vnext/trigger-persistence-parity';
import type {
  RoutineScheduleSnapshot,
  RoutineScheduleStateReader,
} from './routine-schedule-projection-source';

interface DefinitionRow {
  id: string;
  identity_id: string;
  name: string;
  description: string | null;
  enabled: number;
  trigger_json: string | null;
  activated_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ElapsedOccurrenceRow {
  occurrence_key: string;
  source_revision: string | null;
  resolution_state: string;
  resolved_at: string | null;
}

/** PowerSync-backed snapshot reader shared by Desktop projection and execution. */
export function createPowerSyncRoutineScheduleStateReader(
  db: IElectronDatabase,
): RoutineScheduleStateReader {
  return {
    async readRoutineScheduleSnapshot(routineId, identityId) {
      const row = await db.getOptional<DefinitionRow>(
        `SELECT id, identity_id, name, description, enabled, trigger_json, activated_at,
                version, created_at, updated_at
           FROM routine_definitions
          WHERE id = ? AND identity_id = ? LIMIT 1`,
        [routineId, identityId],
      );
      if (!row) return null;

      const [preference, memberships, override, elapsedOccurrences, lastWallClock] =
        await Promise.all([
          db.getOptional<{ global_enabled: number }>(
            `SELECT global_enabled FROM routine_preferences WHERE identity_id = ? LIMIT 1`,
            [identityId],
          ),
          db.getAll<{ enabled: number; profile_enabled: number }>(
            `SELECT m.enabled, p.enabled AS profile_enabled
               FROM routine_profile_memberships m
               JOIN routine_profiles p
                 ON p.identity_id = m.identity_id AND p.id = m.profile_id
              WHERE m.identity_id = ? AND m.routine_id = ?`,
            [identityId, routineId],
          ),
          db.getOptional<{ override_json: string }>(
            `SELECT override_json FROM routine_temporary_overrides
              WHERE identity_id = ? AND routine_id = ? LIMIT 1`,
            [identityId, routineId],
          ),
          db.getAll<ElapsedOccurrenceRow>(
            `SELECT occurrence_key, source_revision, resolution_state, resolved_at
               FROM routine_occurrences
              WHERE identity_id = ? AND routine_id = ? AND trigger_kind = 'Elapsed'
              ORDER BY became_due_at DESC, id DESC LIMIT 128`,
            [identityId, routineId],
          ),
          db.getOptional<{ scheduled_for: string }>(
            `SELECT scheduled_for FROM routine_occurrences
              WHERE identity_id = ? AND routine_id = ? AND trigger_kind = 'WallClock'
                AND scheduled_for IS NOT NULL
              ORDER BY scheduled_for DESC, id DESC LIMIT 1`,
            [identityId, routineId],
          ),
        ]);

      const definition = RoutineDefinition.load({
        id: row.id,
        identityId: row.identity_id,
        name: row.name,
        description: row.description,
        enabled: row.enabled === 1,
        trigger: deserializeRoutineTrigger(row.trigger_json),
        activatedAt: row.activated_at == null ? null : new Date(row.activated_at),
        version: row.version,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      });

      return {
        definition,
        globalEnabled: preference?.global_enabled !== 0,
        durableProfileGateOpen:
          memberships.length === 0 ||
          memberships.some(
            (membership) => membership.enabled === 1 && membership.profile_enabled === 1,
          ),
        temporaryOverride: override
          ? deserializeRoutineTemporaryOverride(override.override_json)
          : null,
        elapsedOccurrences: elapsedOccurrences.map((occurrence) => ({
          occurrenceKey: occurrence.occurrence_key,
          sourceRevision: occurrence.source_revision,
          resolutionState: requireElapsedResolutionState(occurrence.resolution_state),
          resolvedAt: occurrence.resolved_at == null ? null : Date.parse(occurrence.resolved_at),
        })),
        lastWallClockScheduledFor:
          lastWallClock == null ? null : Date.parse(lastWallClock.scheduled_for),
      } satisfies RoutineScheduleSnapshot;
    },

    async listRoutineRefs() {
      const rows = await db.getAll<{ id: string; identity_id: string }>(
        `SELECT id, identity_id FROM routine_definitions ORDER BY identity_id, id`,
      );
      return rows.map((row) => ({ routineId: row.id, identityId: row.identity_id }));
    },
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
