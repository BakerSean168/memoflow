/** @vitest-environment happy-dom */

import { installGoalUiHost } from '@goal-ui-test-host/di/goal-ui-host';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { productionLocaleMessages } from '@goal-ui-test-host/locales/production-messages';
import WeightSnapshotList from './WeightSnapshotList.vue';

const snapshot = vi.hoisted(() => ({
  id: 'snapshot-1',
  keyResultId: 'kr-1',
  trigger: 'manual',
  snapshotTime: Date.now(),
  oldWeight: 20,
  newWeight: 25,
  delta: 5,
  weightDelta: 5,
  reason: 'Reallocated weight',
  operatorId: 'identity-operator-1',
}));

vi.mock('../../composables/useWeightSnapshot', async () => {
  const { ref } = await import('vue');
  return {
    useWeightSnapshot: () => ({
      goalSnapshots: ref([snapshot]),
      pagination: ref({ page: 1, pageSize: 20, total: 1, totalPages: 1 }),
      isLoading: ref(false),
      hasGoalSnapshots: ref(true),
      fetchGoalSnapshots: vi.fn(async () => {}),
    }),
  };
});

vi.mock('../../composables/useGoal', async () => {
  const { ref } = await import('vue');
  return {
    useGoal: () => ({
      keyResults: ref([{ id: 'kr-1', title: 'Grow revenue' }]),
    }),
  };
});

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: productionLocaleMessages,
});

async function mountAndExpand() {
  const wrapper = mount(WeightSnapshotList, {
    props: { goalId: 'goal-1' },
    global: { plugins: [i18n] },
  });
  await wrapper.get('button[aria-expanded]').trigger('click');
  return wrapper;
}

describe('WeightSnapshotList operator presentation', () => {
  it('shows a readable operator label and keeps the raw operator id in the tooltip', async () => {
    const wrapper = await mountAndExpand();

    const operator = wrapper.get('[data-testid="weight-snapshot-operator"]');
    expect(operator.text()).toBe('System');
    expect(operator.attributes('title')).toBe('identity-operator-1');

    wrapper.unmount();
  });

  it('localizes the system operator label in Chinese', async () => {
    const wrapper = mount(WeightSnapshotList, {
      props: { goalId: 'goal-1' },
      global: {
        plugins: [
          createI18n({ legacy: false, locale: 'zh-CN', messages: productionLocaleMessages }),
        ],
      },
    });
    await wrapper.get('button[aria-expanded]').trigger('click');

    expect(wrapper.get('[data-testid="weight-snapshot-operator"]').text()).toBe('系统');

    wrapper.unmount();
  });
});

installGoalUiHost();
