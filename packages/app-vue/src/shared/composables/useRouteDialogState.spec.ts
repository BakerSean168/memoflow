import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import { useRouteDialogState } from './useRouteDialogState';

const Probe = defineComponent({
  setup() {
    const dialog = useRouteDialogState({
      dialogValue: 'goal',
      identityQueryKeys: ['goalId'],
    });
    return () =>
      h('div', [
        h('button', { 'data-testid': 'open', onClick: () => dialog.open({ name: 'goals' }) }),
        h('button', { 'data-testid': 'close', onClick: () => dialog.close() }),
      ]);
  },
});

describe('useRouteDialogState', () => {
  it('preserves unrelated query and removes modal identity with replace on close', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/goals', name: 'goals', component: Probe }],
    });
    await router.push('/goals?status=active&dialog=goal&goalId=g1');
    await router.isReady();

    const wrapper = mount(Probe, { global: { plugins: [router] } });
    await wrapper.get('[data-testid="close"]').trigger('click');
    await vi.waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/goals?status=active');
    });
  });

  it('can reopen after close because the route no longer retains dialog=goal', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/goals', name: 'goals', component: Probe }],
    });
    await router.push('/goals');
    await router.isReady();

    const wrapper = mount(Probe, { global: { plugins: [router] } });
    await wrapper.get('[data-testid="open"]').trigger('click');
    await vi.waitFor(() => expect(router.currentRoute.value.query.dialog).toBe('goal'));
    await wrapper.get('[data-testid="close"]').trigger('click');
    await vi.waitFor(() => expect(router.currentRoute.value.query.dialog).toBeUndefined());

    router.back();
    await vi.waitFor(() => expect(router.currentRoute.value.query.dialog).toBeUndefined());

    await wrapper.get('[data-testid="open"]').trigger('click');
    await vi.waitFor(() => expect(router.currentRoute.value.query.dialog).toBe('goal'));
  });
});
