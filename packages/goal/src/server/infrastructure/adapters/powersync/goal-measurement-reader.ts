import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { GetGoalUseCase } from '../../../application/use-cases/queries/get-goal.use-case';
import { GoalPowerSyncRepository } from './goal-powersync.repository';

/** A Goal-owned read port bound to the caller's business transaction. */
export function createGoalPowerSyncMeasurementReader(tx: IElectronDatabaseTransaction) {
  const query = new GetGoalUseCase(new GoalPowerSyncRepository(tx));
  return {
    getKeyResultMeasurementContext: (goalId: string, keyResultId: string, identityId: string) =>
      query.getKeyResultMeasurementContext(goalId, keyResultId, identityId),
  };
}
