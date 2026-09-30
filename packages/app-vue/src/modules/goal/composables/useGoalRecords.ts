/**
 * useGoalRecords — Goal records and reviews composable
 */

import { useI18n } from 'vue-i18n';
import { useGoalStore } from '../stores/goal-store';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { sanitizeForIpc } from '../../../shared/utils/ipc';
import type { CreateGoalRecordReq, CreateGoalReviewReq } from '@memoflow/contracts/goal';
import { executeGoalOperation, createGoalErrorHandler } from './goalOperations';

export function useGoalRecords() {
  const store = useGoalStore();
  const service = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
  const { t } = useI18n();

  const opOpts = {
    t,
    setError: (msg: string | null) => store.setError(msg),
    onError: createGoalErrorHandler(t, (msg) => store.setError(msg)),
  };

  // ── Records ──────────────────────────────────────────────────────────

  async function createRecord(goalId: string, req: Omit<CreateGoalRecordReq, 'expectedVersion'>) {
    const expectedVersion = store.getGoalById(goalId)?.version;
    if (expectedVersion === undefined) {
      store.setError(t('goal.error.loadFailed'));
      return null;
    }
    const { keyResultId, ...rest } = req;
    const data = await executeGoalOperation(
      () =>
        service.createGoalRecord(goalId, keyResultId, sanitizeForIpc({ ...rest, expectedVersion })),
      { ...opOpts, fallbackKey: 'goal.error.createRecordFailed', scope: 'createRecord' },
    );
    if (data) {
      store.applyGoalMutationReceipt(data);
      return data.recordChanges?.upserted[0] ?? null;
    }
    return null;
  }

  async function createGoalRecord(
    goalId: string,
    keyResultId: string,
    data: Pick<CreateGoalRecordReq, 'value' | 'note'>,
  ) {
    return createRecord(goalId, {
      keyResultId: keyResultId as CreateGoalRecordReq['keyResultId'],
      ...data,
    });
  }

  async function getGoalRecordPreviewContext(goalId: string, keyResultId: string) {
    const data = await executeGoalOperation(
      () => service.getGoalRecordsByKeyResult(goalId, keyResultId, { limit: 1 }),
      { ...opOpts, fallbackKey: 'goal.error.loadFailed', scope: 'getGoalRecordPreviewContext' },
    );
    return data?.previewContext ?? null;
  }

  // ── Reviews ──────────────────────────────────────────────────────────

  async function createReview(goalId: string, req: Omit<CreateGoalReviewReq, 'expectedVersion'>) {
    const expectedVersion = store.getGoalById(goalId)?.version;
    if (expectedVersion === undefined) {
      store.setError(t('goal.error.loadFailed'));
      return null;
    }
    const data = await executeGoalOperation(
      () => service.createGoalReview(goalId, sanitizeForIpc({ ...req, expectedVersion })),
      { ...opOpts, fallbackKey: 'goal.error.createReviewFailed', scope: 'createReview' },
    );
    if (data) {
      store.applyGoalMutationReceipt(data);
      return data.readModel.reviews.find(
        (review) => String(review.id) === String(data.affectedEntityIds.reviewIds[0]),
      );
    }
    return null;
  }

  return {
    getGoalRecordPreviewContext,
    createRecord,
    createGoalRecord,
    createReview,
  };
}
