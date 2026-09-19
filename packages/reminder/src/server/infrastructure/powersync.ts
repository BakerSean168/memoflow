import type { IElectronDatabase } from '@memoflow/contracts/electron';
import { PowerSyncProtocolSessionStore } from './routine-vnext/protocol-session-store.powersync';
import { PowerSyncRoutineOccurrenceTruthStore } from './routine-vnext/routine-occurrence-truth-store.powersync';
import { PowerSyncRoutineProfileStore } from './routine-vnext/routine-profile-store.powersync';
import { PowerSyncRoutineTemporaryOverrideStore } from './routine-schedule/routine-temporary-override-store.powersync';
import type {
  ProtocolSessionStore,
  RoutineOccurrenceTruthStore,
  RoutineProfileStore,
  RoutineTemporaryOverrideStore,
} from '../domain/ports';

type Queryable = IElectronDatabase;

/**
 * Desktop PowerSync closure gate. Kept as a host capability for canonical
 * Routine entrypoints; there is no legacy Reminder persistence fallback.
 */
export function createPowerSyncClosureChecker(
  db: Queryable,
): (identityId: string) => Promise<boolean> {
  return async (identityId: string): Promise<boolean> => {
    try {
      const row = await db.getOptional<{ status: string }>(
        'SELECT status FROM accounts WHERE id = ? LIMIT 1',
        [identityId],
      );
      if (!row || row.status !== 'Active') return true;
      const marker = await db.getOptional<{ identity_id: string }>(
        'SELECT identity_id FROM account_closure_requested WHERE identity_id = ? LIMIT 1',
        [identityId],
      );
      return marker !== null;
    } catch {
      return true;
    }
  };
}

/** Canonical PowerSync persistence set for Routine vNext. */
export interface RoutinePowerSyncRepositorySet {
  readonly routineProfileStore: RoutineProfileStore;
  readonly routineTemporaryOverrideStore: RoutineTemporaryOverrideStore;
  readonly protocolSessionStore: ProtocolSessionStore;
  readonly routineOccurrenceTruthStore: RoutineOccurrenceTruthStore;
  readonly closureChecker: (identityId: string) => Promise<boolean>;
}

export function createRoutinePowerSyncRepositories(db: Queryable): RoutinePowerSyncRepositorySet {
  return {
    routineProfileStore: new PowerSyncRoutineProfileStore(db),
    routineTemporaryOverrideStore: new PowerSyncRoutineTemporaryOverrideStore(db),
    protocolSessionStore: new PowerSyncProtocolSessionStore(db),
    routineOccurrenceTruthStore: new PowerSyncRoutineOccurrenceTruthStore(db),
    closureChecker: createPowerSyncClosureChecker(db),
  };
}
