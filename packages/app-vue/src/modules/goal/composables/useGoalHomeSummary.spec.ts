/** @vitest-environment happy-dom */
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { ok, fail } from '@memoflow/contracts/result';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import {
  createTestServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
  type ServerStateRuntime,
} from '../../../platform/server-state';
import { GOAL_HOME_STALE_TIME_MS } from '../../../platform/server-state/query-policy';
import { useGoalHomeSummary } from './useGoalHomeSummary';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': { goal: { error: { loadFailed: 'Failed to load goal' } } } },
});

async function mountComposable(
  getHomeSummary: ReturnType<typeof vi.fn>,
  runtime: ServerStateRuntime = createTestServerStateRuntime(),
) {
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
        [SERVER_STATE_RUNTIME_KEY as symbol]: runtime,
        [SERVER_STATE_IDENTITY_SCOPE_KEY as symbol]: () => 'identity-1',
      },
    },
  });
  await nextTick();
  return { wrapper, api, runtime };
}

describe('useGoalHomeSummary', () => {
  it('deduplicates pending consumers and expires at the owner stale-window boundary', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const runtime = createTestServerStateRuntime();
    let release!: () => void;
    const getHomeSummary = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve(ok({ activeCount: 0, goals: [] }));
          }),
      )
      .mockResolvedValue(ok({ activeCount: 0, goals: [] }));
    const first = await mountComposable(getHomeSummary, runtime);
    const second = await mountComposable(getHomeSummary, runtime);
    try {
      const reads = [first.api.ensure(), second.api.ensure()];
      expect(getHomeSummary).toHaveBeenCalledTimes(1);
      release();
      await Promise.all(reads);
      clock.mockReturnValue(1_800_000_000_000 + GOAL_HOME_STALE_TIME_MS - 1);
      await second.api.ensure();
      expect(getHomeSummary).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(1_800_000_000_000 + GOAL_HOME_STALE_TIME_MS);
      await second.api.ensure();
      expect(getHomeSummary).toHaveBeenCalledTimes(2);
    } finally {
      first.wrapper.unmount();
      second.wrapper.unmount();
      runtime.dispose();
      clock.mockRestore();
    }
  });

  it('stores the Goal-owned summary without Dashboard state', async () => {
    const getHomeSummary = vi.fn().mockResolvedValue(
      ok({
        activeCount: 2,
        goals: [
          {
            id: 'g1',
            name: 'Goal',
            progress: 30,
            status: 'Planned',
            target: null,
            keyResultCount: 1,
          },
        ],
      }),
    );
    const { wrapper, api } = await mountComposable(getHomeSummary);
    await api.refresh();
    expect(api.activeCount.value).toBe(2);
    expect(api.goals.value).toHaveLength(1);
    expect(api.error.value).toBeNull();
    wrapper.unmount();
  });

  it('degrades to a local error on a failed owner read', async () => {
    const getHomeSummary = vi
      .fn()
      .mockResolvedValue(fail({ code: 'INTERNAL_ERROR', message: 'owner unavailable' }));
    const { wrapper, api } = await mountComposable(getHomeSummary);
    await api.refresh();
    expect(api.error.value).toBeTruthy();
    expect(api.isLoading.value).toBe(false);
    wrapper.unmount();
  });

  it('shares the fresh summary across remounts and only bypasses the cache for refresh', async () => {
    const runtime = createTestServerStateRuntime();
    const getHomeSummary = vi.fn().mockResolvedValue(
      ok({
        activeCount: 1,
        goals: [
          {
            id: 'g1',
            name: 'Cached Goal',
            progress: 20,
            status: 'Planned',
            target: null,
            keyResultCount: 0,
          },
        ],
      }),
    );

    const first = await mountComposable(getHomeSummary, runtime);
    await first.api.ensure();
    expect(getHomeSummary).toHaveBeenCalledTimes(1);
    first.wrapper.unmount();

    const second = await mountComposable(getHomeSummary, runtime);
    expect(second.api.goals.value[0]?.name).toBe('Cached Goal');
    await second.api.ensure();
    expect(getHomeSummary).toHaveBeenCalledTimes(1);

    await second.api.refresh();
    expect(getHomeSummary).toHaveBeenCalledTimes(2);
    second.wrapper.unmount();
    runtime.dispose();
  });
});
