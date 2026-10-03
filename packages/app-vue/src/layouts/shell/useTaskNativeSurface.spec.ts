import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import { provideTaskNativeSurface } from './useTaskNativeSurface';
import { useAppShellStore } from './useAppShellStore';
import type { TaskNativeEditSession } from '../../modules/task/composables/taskNativeEditSession';

async function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ name: 'task-list', path: '/tasks', component: { render: () => h('div') } }],
  });
  await router.push('/tasks?dialog=task-plan');
  const store = useAppShellStore();
  store.openTab({
    module: 'task',
    route: router.currentRoute.value.fullPath,
    title: 'Tasks',
    intent: 'deeplink',
  });
  let host!: ReturnType<typeof provideTaskNativeSurface>;
  const wrapper = mount(
    defineComponent({
      setup() {
        host = provideTaskNativeSurface();
        return () => h('div');
      },
    }),
    {
      global: {
        plugins: [pinia, router, createI18n({ legacy: false, locale: 'en-US', messages: {} })],
      },
    },
  );
  const session: TaskNativeEditSession = {
    patch: vi.fn(),
    focus: vi.fn(),
    readDraftState: vi.fn(),
    requestSubmit: vi.fn(),
    requestCancel: vi.fn(),
    coordinateSubmit: vi.fn(),
    setEditingBlocked: vi.fn(),
  };
  return { host, wrapper, store, router, session };
}
describe('Task native surface host', () => {
  it('locates and reuses only full-create owner registration on its active route', async () => {
    const { host, wrapper, session, store } = await setup();
    const unregister = host.register('/tasks?dialog=task-plan', session);
    expect(await host.openCreate()).toBe(session);
    expect(host.locate()).toBe(session);
    store.panelSurface = 'workflow';
    expect(host.locate()).toBeNull();
    expect(await host.openCreate()).toBe(session);
    unregister();
    expect(host.locate()).toBeNull();
    wrapper.unmount();
  });
  it('waits for owner readiness and rejects when its route exits', async () => {
    const { host, wrapper, router, store } = await setup();
    const opening = host.openCreate();
    await nextTick();
    await nextTick();
    await router.replace('/tasks?dialog=quick-task');
    store.openTab({
      module: 'task',
      route: router.currentRoute.value.fullPath,
      title: 'Quick',
      intent: 'deeplink',
    });
    await expect(opening).rejects.toThrow('closed before becoming ready');
    wrapper.unmount();
  });
  it('retires registrations and pending opens on shell disposal', async () => {
    const { host, wrapper } = await setup();
    const opening = host.openCreate();
    await nextTick();
    await nextTick();
    wrapper.unmount();
    await expect(opening).rejects.toThrow('closed before becoming ready');
    expect(host.locate()).toBeNull();
    await expect(host.openCreate()).rejects.toThrow('closed');
  });
});
