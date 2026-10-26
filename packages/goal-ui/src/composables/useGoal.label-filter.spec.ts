import { installGoalUiHost } from '@goal-ui-test-host/di/goal-ui-host';
/** @vitest-environment happy-dom */

import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts';
import { GOAL_SERVICE_KEY } from '@goal-ui-test-host/di/keys';
import { useGoalStore } from '../stores/goal-store';
import { useGoal } from './useGoal';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      errors: { unknown: 'Unexpected error' },
      goal: { error: { loadListFailed: 'load failed', loadListException: 'load exception' } },
    },
  },
});

describe('useGoal label filtering (GOAL-5101)', () => {
  it('sends selected labels to listGoals as labelIdsAll so AND filtering is repository-owned', async () => {
    const listGoals = vi.fn().mockResolvedValue(
      ok({
        goals: [],
        pagination: { page: 1, pageSize: 20, total: 0, hasMore: false, totalPages: 0 },
      }),
    );
    const service = {
      listGoals,
      searchGoals: vi.fn(),
    };

    let api!: ReturnType<typeof useGoal>;
    const Host = defineComponent({
      setup() {
        api = useGoal();
        return () => h('div');
      },
    });
    const wrapper = mount(Host, {
      global: {
        plugins: [i18n],
        provide: { [GOAL_SERVICE_KEY as symbol]: service },
      },
    });
    const store = useGoalStore();
    store.setLabelIdsAll(['label-work', 'label-ai', 'label-work']);

    await api.fetchGoals();

    expect(store.labelIdsAll).toEqual(['label-work', 'label-ai']);
    expect(listGoals).toHaveBeenCalledOnce();
    expect(listGoals).toHaveBeenCalledWith({
      systemView: 'active',
      page: 1,
      pageSize: 20,
      labelIdsAll: ['label-work', 'label-ai'],
    });
    expect(service.searchGoals).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

installGoalUiHost();
