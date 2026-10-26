import { goalUiHost } from '../goal-ui-host';
/**
 * useKeyResults — Key result CRUD composable
 */

import { useI18n } from 'vue-i18n';
import { useGoalStore } from '../stores/goal-store';

import type { AddKeyResultReq, UpdateKeyResultReq } from '@memoflow/goal-contracts';
import { executeGoalOperation, createGoalErrorHandler } from './goalOperations';

export function useKeyResults() {
  const store = useGoalStore();
  const service = goalUiHost.useStrictInject(goalUiHost.GOAL_SERVICE_KEY, 'GoalService');
  const { t } = useI18n();

  const opOpts = {
    t,
    setError: (msg: string | null) => store.setError(msg),
    onError: createGoalErrorHandler(t, (msg) => store.setError(msg)),
  };

  function getExpectedVersion(goalId: string): number | null {
    const version = store.getGoalById(goalId)?.version;
    if (version === undefined) {
      store.setError(t('goal.error.loadFailed'));
      return null;
    }
    return version;
  }

  async function addKeyResult(
    goalId: string,
    req: Omit<AddKeyResultReq, 'goalId' | 'expectedVersion'>,
  ) {
    const expectedVersion = getExpectedVersion(goalId);
    if (expectedVersion === null) return null;
    const data = await executeGoalOperation(
      () => service.createKeyResult(goalId, goalUiHost.sanitizeForIpc({ ...req, expectedVersion })),
      { ...opOpts, fallbackKey: 'goal.error.addKRFailed', scope: 'addKeyResult' },
    );
    if (data) {
      store.applyGoalMutationReceipt(data);
      return data.readModel.keyResults.find(
        (keyResult) => String(keyResult.id) === String(data.affectedEntityIds.keyResultIds[0]),
      );
    }
    return null;
  }

  async function updateKeyResult(
    goalId: string,
    krId: string,
    req: Omit<UpdateKeyResultReq, 'expectedVersion'>,
  ) {
    const expectedVersion = getExpectedVersion(goalId);
    if (expectedVersion === null) return null;
    const data = await executeGoalOperation(
      () =>
        service.updateKeyResult(
          goalId,
          krId,
          goalUiHost.sanitizeForIpc({ ...req, expectedVersion }),
        ),
      { ...opOpts, fallbackKey: 'goal.error.updateKRFailed', scope: 'updateKeyResult' },
    );
    if (data) {
      store.applyGoalMutationReceipt(data);
      return data.readModel.keyResults.find((keyResult) => String(keyResult.id) === krId);
    }
    return null;
  }

  async function deleteKeyResult(goalId: string, krId: string) {
    const expectedVersion = getExpectedVersion(goalId);
    if (expectedVersion === null) return false;
    const receipt = await executeGoalOperation(
      () => service.deleteKeyResult(goalId, krId, { expectedVersion }),
      {
        ...opOpts,
        fallbackKey: 'goal.error.deleteKRFailed',
        scope: 'deleteKeyResult',
      },
    );
    if (receipt) {
      store.applyGoalMutationReceipt(receipt);
      return true;
    }
    return false;
  }

  return {
    addKeyResult,
    updateKeyResult,
    deleteKeyResult,
  };
}
