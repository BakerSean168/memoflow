/** @vitest-environment happy-dom */
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { ok, fail } from '@memoflow/contracts/result';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { useGoalHomeSummary } from './useGoalHomeSummary';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': { goal: { error: { loadFailed: 'Failed to load goal' } } } },
});

async function mountComposable(getHomeSummary: ReturnType<typeof vi.fn>) {
  let api!: ReturnType<typeof useGoalHomeSummary>;
  const Host = defineComponent({
    setup() {
      api = useGoalHomeSummary();
      return () => null;
    },
  });
  const wrapper = mount(Host, {
    global: {
      plugins: [i18n],
      provide: {
        [GOAL_SERVICE_KEY as symbol]: { getHomeSummary },
      },
    },
  });
  await nextTick();
  return { wrapper, api };
}

describe('useGoalHomeSummary', () => {
  it('stores the Goal-owned summary without Dashboard state', async () => {
    const getHomeSummary = vi.fn().mockResolvedValue(
      ok({ activeCount: 2, goals: [{ id: 'g1', name: 'Goal', progress: 30, status: 'Planned', target: null, keyResultCount: 1 }] }),
    );
    const { wrapper, api } = await mountComposable(getHomeSummary);
    await api.refresh();
    expect(api.activeCount.value).toBe(2);
    expect(api.goals.value).toHaveLength(1);
    expect(api.error.value).toBeNull();
    wrapper.unmount();
  });

  it('degrades to a local error on a failed owner read', async () => {
    const getHomeSummary = vi.fn().mockResolvedValue(
      fail({ code: 'INTERNAL_ERROR', message: 'owner unavailable' }),
    );
    const { wrapper, api } = await mountComposable(getHomeSummary);
    await api.refresh();
    expect(api.error.value).toBeTruthy();
    expect(api.isLoading.value).toBe(false);
    wrapper.unmount();
  });
});
