import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { KeyResultCalculationMethod } from '@memoflow/contracts/goal';
import {
  createMockGoal,
  createMockGoalMutationReceipt,
  createMockGoalRecord,
  createMockKeyResult,
} from '@memoflow/contracts/mocks';
import { ok } from '@memoflow/contracts/result';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { useGoalStore } from '../stores/goal-store';
import { useGoalRecords } from './useGoalRecords';

const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': {} } });

describe('useGoalRecords manual creation', () => {
  it.each(Object.values(KeyResultCalculationMethod))(
    'applies %s receipt values immediately without a refetch',
    async (aggregationMethod) => {
      const store = useGoalStore();
      const goal = createMockGoal({ version: 1 });
      const kr = createMockKeyResult();
      kr.progress.aggregationMethod = aggregationMethod;
      store.setGoals([goal]);
      store.setKeyResults(goal.id, [kr], 1);
      store.selectGoal(goal.id);
      const updatedKr = { ...kr, progress: { ...kr.progress, currentValue: -5 } };
      const record = createMockGoalRecord({
        goalId: goal.id,
        keyResultId: kr.id,
        value: -5,
        valueAfter: -5,
      });
      const receipt = createMockGoalMutationReceipt(
        { ...goal, version: 2, keyResults: [updatedKr] },
        { recordChanges: { upserted: [record], removedIds: [] } },
      );
      const service = {
        createGoalRecord: vi.fn().mockResolvedValue(ok(receipt)),
        getGoal: vi.fn(),
      };
      let api!: ReturnType<typeof useGoalRecords>;
      const wrapper = mount(
        defineComponent({
          setup() {
            api = useGoalRecords();
            return () => h('div');
          },
        }),
        { global: { plugins: [i18n], provide: { [GOAL_SERVICE_KEY as symbol]: service } } },
      );

      expect(
        await api.createGoalRecord(goal.id, kr.id, { value: -5, note: 'measurement' }),
      ).toEqual(record);
      expect(service.createGoalRecord).toHaveBeenCalledExactlyOnceWith(goal.id, kr.id, {
        expectedVersion: 1,
        value: -5,
        note: 'measurement',
      });
      expect(store.getKeyResultById(kr.id)?.progress.currentValue).toBe(-5);
      expect(store.getGoalById(goal.id)?.version).toBe(2);
      expect(store.keyResults[0].progress.currentValue).toBe(-5);
      expect(store.selectedGoal?.keyResults[0].progress.currentValue).toBe(-5);
      expect(store.goals[0].keyResults[0].progress.currentValue).toBe(-5);
      expect(store.goalRecords).toContainEqual(record);
      expect(service.getGoal).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );
});

it('corrects a Task measurement through the versioned Goal command and preserves provenance in its receipt', async () => {
  const store = useGoalStore();
  const goal = createMockGoal({ version: 4 });
  store.setGoals([goal]);
  const record = createMockGoalRecord({ goalId: goal.id, value: -2, comment: 'corrected', authorship: 'TaskUserMeasurement', source: { type: 'TASK_INSTANCE', id: 'occurrence-1' } });
  const receipt = createMockGoalMutationReceipt({ ...goal, version: 5 }, { recordChanges: { upserted: [record], removedIds: [] } });
  const service = { updateGoalRecord: vi.fn().mockResolvedValue(ok(receipt)) };
  let api!: ReturnType<typeof useGoalRecords>;
  const wrapper = mount(defineComponent({ setup() { api = useGoalRecords(); return () => h('div'); } }), {
    global: { plugins: [i18n], provide: { [GOAL_SERVICE_KEY as symbol]: service } },
  });
  expect(await api.updateGoalRecord(goal.id, record.keyResultId, record.id, { value: -2, note: 'corrected' })).toEqual(record);
  expect(service.updateGoalRecord).toHaveBeenCalledExactlyOnceWith(goal.id, record.keyResultId, record.id, { expectedVersion: 4, value: -2, note: 'corrected' });
  expect(store.goalRecords).toContainEqual(record);
  expect(store.getGoalById(goal.id)?.version).toBe(5);
  wrapper.unmount();
});
