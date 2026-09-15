import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { ActiveUsageRoutineRegistration } from '../../runtime/active-usage';
import type { AmbientBreakCreditRegistration } from '../../runtime/protocol-break-credit';
import { deserializeRoutineTrigger } from './trigger-persistence-parity';

interface RoutineDefinitionRow {
  id: string;
  identity_id: string;
  enabled: 0 | 1;
  trigger_json: string | null;
}

interface RoutineMembershipPathRow {
  routine_id: string;
  membership_enabled: 0 | 1;
  profile_enabled: 0 | 1;
}

export interface RoutineLocalRegistrationsSnapshot {
  readonly activeUsage: readonly ActiveUsageRoutineRegistration[];
  readonly protocolBreakCredits: readonly AmbientBreakCreditRegistration[];
}

/** Projects durable Routine state into the local ActiveUsage runtime. */
export async function loadPowerSyncRoutineLocalRegistrations(
  db: IElectronDatabase,
  identityId: string,
): Promise<RoutineLocalRegistrationsSnapshot> {
  const owner = identityId.trim();
  if (!owner) throw new TypeError('Routine local registration identityId must not be empty');

  const [definitions, membershipPaths] = await Promise.all([
    db.getAll<RoutineDefinitionRow>(
      `SELECT id, identity_id, enabled, trigger_json
         FROM routine_definitions
        WHERE identity_id = ?
        ORDER BY id`,
      [owner],
    ),
    db.getAll<RoutineMembershipPathRow>(
      `SELECT m.routine_id,
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
  ]);

  const pathsByRoutine = new Map<string, RoutineMembershipPathRow[]>();
  for (const row of membershipPaths) {
    const paths = pathsByRoutine.get(row.routine_id) ?? [];
    paths.push(row);
    pathsByRoutine.set(row.routine_id, paths);
  }

  const activeUsage: ActiveUsageRoutineRegistration[] = [];
  const protocolBreakCredits: AmbientBreakCreditRegistration[] = [];

  for (const row of definitions) {
    if (row.identity_id !== owner) {
      throw new TypeError(`Routine local registration ownership mismatch for '${row.id}'`);
    }
    const trigger = deserializeRoutineTrigger(row.trigger_json);
    if (trigger?.type !== 'ActiveUsage') continue;

    const paths = pathsByRoutine.get(row.id) ?? [];
    const membershipPathEnabled =
      paths.length === 0
        ? null
        : paths.some((path) => path.membership_enabled === 1 && path.profile_enabled === 1);

    activeUsage.push({
      identityId: owner,
      routineId: row.id,
      trigger,
      gates: {
        routineEnabled: row.enabled === 1,
        ...(membershipPathEnabled == null
          ? {}
          : {
              profileEnabled: membershipPathEnabled,
              membershipEnabled: membershipPathEnabled,
            }),
      },
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

  return { activeUsage, protocolBreakCredits };
}
