import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  createMockGoal,
  createMockGoalMutationReceipt,
  createMockGoalRecord,
  createMockGoalReview,
  createMockKeyResult,
} from '@memoflow/contracts/mocks';
import { useGoalStore } from './goal-store';

describe('Goal store vNext', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('starts with canonical vNext UI state and no retired Folder/Focus authority', () => {
    const store = useGoalStore();

    expect(store.goals).toEqual([]);
    expect(store.selectedGoal).toBeNull();
    expect(store.keyResults).toEqual([]);
    expect(store.systemView).toBe('active');
    expect(store.totalPages).toBe(0);
    expect(store.hasActiveFilter).toBe(false);
    expect(store.activeGoalCount).toBe(0);
    expect(store.completedGoalCount).toBe(0);
    expect('goalFolders' in store.$state).toBe(false);
    expect('focusMode' in store.$state).toBe(false);
  });

  it('normalizes goals and materializes reviews/key results from canonical stores', () => {
    const store = useGoalStore();
    const active = createMockGoal({ status: 'InProgress', version: 2 });
    const completed = createMockGoal({ status: 'Completed', version: 3 });
    const activeId = String(active.id);
    const kr = createMockKeyResult();
    const review = createMockGoalReview({ goalId: active.id });

    store.setGoals([active, completed], 7);
    store.setGoalReviews([review]);
    store.setKeyResults(activeId, [kr], 2);
    store.selectGoal(activeId);

    expect(store.goalIds).toEqual([String(active.id), String(completed.id)]);
    expect(store.pagination.total).toBe(7);
    expect(store.goals).toHaveLength(2);
    expect(store.selectedGoal?.keyResults).toEqual([kr]);
    expect(store.selectedGoal?.reviews).toEqual([review]);
    expect(store.keyResults).toEqual([kr]);
    expect(store.getGoalById(activeId)?.version).toBe(2);
    expect(store.getKeyResultById(String(kr.id))).toEqual(kr);
    expect(store.getGoalsByStatus('Completed').map((goal) => goal.id)).toEqual([completed.id]);
  });

  it('protects newer goal versions and key-result projections from stale writes', () => {
    const store = useGoalStore();
    const goal = createMockGoal({ version: 5 });
    const id = String(goal.id);
    const currentKr = createMockKeyResult();
    const nextKr = createMockKeyResult();

    store.setGoals([goal]);
    store.setKeyResults(id, [currentKr], 5);
    store.upsertGoal({ ...goal, name: 'stale', version: 4 });
    store.setKeyResults(id, [nextKr], 4);

    expect(store.getGoalById(id)?.name).toBe(goal.name);
    expect(store.keyResultIdsByGoalId[id]).toEqual([String(currentKr.id)]);

    store.upsertGoal({ ...goal, name: 'fresh', version: 6 });
    store.setKeyResults(id, [nextKr], 6);

    expect(store.getGoalById(id)?.name).toBe('fresh');
    expect(store.getKeyResultById(String(currentKr.id))).toBeUndefined();
    expect(store.getKeyResultById(String(nextKr.id))).toEqual(nextKr);
  });

  it('applies a mutation receipt atomically and ignores internally inconsistent or stale receipts', () => {
    const store = useGoalStore();
    const goal = createMockGoal({ version: 3 });
    const id = String(goal.id);
    store.setGoals([goal], 1);

    const inconsistent = createMockGoalMutationReceipt(
      { ...goal, version: 4 },
      { goalId: goal.id, goalVersion: 5 },
    );
    store.applyGoalMutationReceipt(inconsistent);
    expect(store.getGoalById(id)?.version).toBe(3);

    store.upsertGoal({ ...goal, version: 8, name: 'newest' });
    const stale = createMockGoalMutationReceipt(
      { ...goal, version: 7, name: 'older' },
      { goalId: goal.id, goalVersion: 7 },
    );
    store.applyGoalMutationReceipt(stale);
    expect(store.getGoalById(id)?.name).toBe('newest');
  });

  it('adds unseen receipt goals and reconciles reviews, key results and record changes', () => {
    const store = useGoalStore();
    const goal = createMockGoal({ version: 2 });
    const goalId = String(goal.id);
    const kr = createMockKeyResult();
    const review = createMockGoalReview({ goalId: goal.id });
    const oldRecord = createMockGoalRecord({ goalId: goal.id, keyResultId: kr.id });
    const replacedRecord = createMockGoalRecord({ goalId: goal.id, keyResultId: kr.id });
    const insertedRecord = createMockGoalRecord({ goalId: goal.id, keyResultId: kr.id });
    const unrelatedRecord = createMockGoalRecord();

    store.setGoalRecords([oldRecord, replacedRecord, unrelatedRecord]);
    const receipt = createMockGoalMutationReceipt(
      { ...goal, keyResults: [kr], reviews: [review] },
      {
        goalId: goal.id,
        goalVersion: 2,
        recordChanges: {
          removedIds: [oldRecord.id],
          upserted: [{ ...replacedRecord, value: 99 }, insertedRecord],
        },
      },
    );

    store.applyGoalMutationReceipt(receipt);

    expect(store.goalIds[0]).toBe(goalId);
    expect(store.pagination.total).toBe(1);
    expect(store.keyResultIdsByGoalId[goalId]).toEqual([String(kr.id)]);
    expect(store.goalReviews).toEqual([review]);
    expect(store.goalRecords.find((record) => record.id === oldRecord.id)).toBeUndefined();
    expect(store.goalRecords.find((record) => record.id === replacedRecord.id)?.value).toBe(99);
    expect(store.goalRecords).toContainEqual(insertedRecord);
    expect(store.goalRecords).toContainEqual(unrelatedRecord);
  });

  it('removes a goal, its key-result projections and selection without underflowing totals', () => {
    const store = useGoalStore();
    const goal = createMockGoal({ version: 1 });
    const id = String(goal.id);
    const kr = createMockKeyResult();

    store.setGoals([goal], 1);
    store.setKeyResults(id, [kr], 1);
    store.selectGoal(id);
    store.removeGoal(id);

    expect(store.getGoalById(id)).toBeUndefined();
    expect(store.getKeyResultById(String(kr.id))).toBeUndefined();
    expect(store.keyResultIdsByGoalId[id]).toBeUndefined();
    expect(store.selectedGoalId).toBeNull();
    expect(store.pagination.total).toBe(0);

    store.removeGoal('missing');
    expect(store.pagination.total).toBe(0);
  });

  it('derives active/completed counts from status plus archive/delete facts', () => {
    const store = useGoalStore();
    const planned = createMockGoal({ status: 'Planned', archivedAt: null, deletedAt: null });
    const inProgress = createMockGoal({ status: 'InProgress', archivedAt: null, deletedAt: null });
    const archivedActive = createMockGoal({
      status: 'InProgress',
      archivedAt: Date.now(),
      deletedAt: null,
    });
    const completed = createMockGoal({ status: 'Completed', deletedAt: null });
    const deletedCompleted = createMockGoal({ status: 'Completed', deletedAt: Date.now() });

    store.setGoals([planned, inProgress, archivedActive, completed, deletedCompleted]);

    expect(store.activeGoalCount).toBe(2);
    expect(store.completedGoalCount).toBe(1);
  });

  it('manages filters, pagination, loading/error/init state and reset', () => {
    const store = useGoalStore();
    const records = [createMockGoalRecord()];
    const reviews = [createMockGoalReview()];

    store.setPage(4);
    store.setPageSize(50);
    expect(store.pagination).toMatchObject({ page: 1, pageSize: 50 });
    store.setPage(3);
    store.setSearchQuery('run');
    expect(store.pagination.page).toBe(1);
    expect(store.hasActiveFilter).toBe(true);
    store.setSystemView('abandoned');
    expect(store.systemView).toBe('abandoned');
    store.setGoalRecords(records);
    store.setGoalReviews(reviews);
    store.setLoading(true);
    store.setError('boom');
    store.setInitialized(true);

    expect(store.goalRecords).toEqual(records);
    expect(store.goalReviews).toEqual(reviews);
    expect(store.isLoading).toBe(true);
    expect(store.error).toBe('boom');
    expect(store.isInitialized).toBe(true);

    store.clearFilters();
    expect(store.searchQuery).toBe('');
    store.setPage(2);
    store.reset();

    expect(store.systemView).toBe('active');
    expect(store.pagination).toEqual({ page: 1, pageSize: 20, total: 0 });
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.isInitialized).toBe(false);
  });
});
