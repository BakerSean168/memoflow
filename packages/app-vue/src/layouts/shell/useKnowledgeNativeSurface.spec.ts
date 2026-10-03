import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import { provideKnowledgeNativeSurface } from './useKnowledgeNativeSurface';
import { useAppShellStore } from './useAppShellStore';
import type { KnowledgeCaptureNativeEditSession } from '../../modules/repository/composables/knowledgeCaptureNativeEditSession';

async function setup(initialPath = '/repository?dialog=knowledge-capture') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'repository', path: '/repository', component: { render: () => h('div') } },
      { name: 'home', path: '/', component: { render: () => h('div') } },
    ],
  });
  await router.push(initialPath);
  const store = useAppShellStore();
  store.openTab({
    module: 'repository',
    route: router.currentRoute.value.fullPath,
    title: 'Knowledge',
    intent: 'deeplink',
  });
  let host!: ReturnType<typeof provideKnowledgeNativeSurface>;
  const wrapper = mount(
    defineComponent({
      setup() {
        host = provideKnowledgeNativeSurface();
        return () => h('div');
      },
    }),
    {
      global: {
        plugins: [pinia, router, createI18n({ legacy: false, locale: 'en-US', messages: {} })],
      },
    },
  );
  const session: KnowledgeCaptureNativeEditSession = {
    patch: vi.fn(),
    focus: vi.fn(),
    readDraftState: vi.fn(),
    requestSubmit: vi.fn(),
    requestCancel: vi.fn(),
    projectDraft: vi.fn(),
    coordinateSubmit: vi.fn(),
    setEditingBlocked: vi.fn(),
  };
  return { host, wrapper, store, router, session };
}
describe('Knowledge native surface host', () => {
  it('locates and reuses only full-create owner registration on its active route', async () => {
    const { host, wrapper, session, store } = await setup();
    const unregister = host.register('/repository?dialog=knowledge-capture', session);
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
    await router.replace('/repository?dialog=other');
    store.openTab({
      module: 'repository',
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
  it('navigates to the Repository capture dialog without copying another module query', async () => {
    const { host, wrapper, session, router, store } = await setup('/?note=unrelated');
    router.afterEach((to) => {
      store.openTab({
        module: 'repository',
        route: to.fullPath,
        title: 'Knowledge',
        intent: 'deeplink',
      });
      host.register(to.fullPath, session);
    });
    expect(await host.openCreate()).toBe(session);
    expect(router.currentRoute.value.fullPath).toBe('/repository?dialog=knowledge-capture');
    wrapper.unmount();
  });

  it('does not let an old unregister retire a replacement owner session', async () => {
    const { host, wrapper, session } = await setup();
    const unregisterOld = host.register('/repository?dialog=knowledge-capture', { ...session });
    host.register('/repository?dialog=knowledge-capture', session);
    unregisterOld();
    expect(host.locate()).toBe(session);
    wrapper.unmount();
  });
});
