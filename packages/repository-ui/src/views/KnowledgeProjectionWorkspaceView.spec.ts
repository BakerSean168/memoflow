import { defineComponent, h, KeepAlive, reactive, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { REPOSITORY_SERVICE_KEY } from '@repository-ui-test-host/di/keys';
import KnowledgeProjectionWorkspaceView from './KnowledgeProjectionWorkspaceView.vue';
import { useGitHubKnowledgeConnection } from '../composables/useGitHubKnowledgeConnection';
const route = reactive({ name: 'repository', query: {} as Record<string, string> });
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({
    resolve: () => ({ href: '/repository' }),
    replace: vi.fn(async () => undefined),
  }),
}));
function options(api: object) {
  return {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en-US',
          missingWarn: false,
          fallbackWarn: false,
          messages: { 'en-US': {} },
        }),
      ],
      provide: { [REPOSITORY_SERVICE_KEY as symbol]: api },
      stubs: { Button: true },
    },
  };
}
const INTENT = 'memoflow:knowledge-repository:web-installation-intent';
beforeEach(() => {
  route.query = {};
  sessionStorage.clear();
  vi.restoreAllMocks();
});
describe('Web read-only knowledge connection', () => {
  it('renders an unconnected source as neutral state with no write or preview surface', async () => {
    const api = { listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [] })) };
    const wrapper = mount(KnowledgeProjectionWorkspaceView, options(api));
    await flushPromises();
    expect(wrapper.find('[data-testid="knowledge-not-connected"]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('input, textarea, article').exists()).toBe(false);
    wrapper.unmount();
  });
  it('shows an unconfigured GitHub App as neutral availability, while real failures remain errors', async () => {
    const api = {
      listKnowledgeRepositoryConnections: vi.fn(async () =>
        fail({
          code: 'SERVICE_UNAVAILABLE',
          message: 'not configured',
          context: { reason: 'github-app-not-configured' },
        }),
      ),
    };
    const wrapper = mount(KnowledgeProjectionWorkspaceView, options(api));
    await flushPromises();
    expect(wrapper.find('[data-testid="knowledge-not-configured"]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('consumes an explicit legacy callback before a remembered unrelated intent', async () => {
    sessionStorage.setItem(INTENT, 'old-intent');
    route.query = { state: 'new-state', installation_id: 'installation-2' };
    const api = {
      listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [] })),
      completeKnowledgeRepositoryInstallation: vi.fn(async () =>
        ok({ installationId: 'installation-2', repositories: [] }),
      ),
      getKnowledgeRepositoryInstallationIntentStatus: vi.fn(),
    };
    const Host = defineComponent({
      setup: () => {
        useGitHubKnowledgeConnection();
        return () => h('div');
      },
    });
    const wrapper = mount(Host, options(api));
    await flushPromises();
    expect(api.completeKnowledgeRepositoryInstallation).toHaveBeenCalledWith({
      state: 'new-state',
      installationId: 'installation-2',
      setupAction: 'install',
    });
    expect(api.getKnowledgeRepositoryInstallationIntentStatus).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('retries a temporary finalize failure and can cancel waiting without mutating notes', async () => {
    sessionStorage.setItem(INTENT, 'intent-1');
    const api = {
      listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [] })),
      getKnowledgeRepositoryInstallationIntentStatus: vi.fn(async () =>
        ok({ status: 'CallbackReceived', expiresAt: Date.now() + 60000 }),
      ),
      finalizeKnowledgeRepositoryInstallationIntent: vi
        .fn()
        .mockResolvedValueOnce(fail({ code: 'SERVICE_UNAVAILABLE', message: 'retry' }))
        .mockResolvedValue(
          ok({ installationId: 'installation-1', repositories: [{ id: 'repo-1' }] }),
        ),
    };
    let connection!: ReturnType<typeof useGitHubKnowledgeConnection>;
    const Host = defineComponent({
      setup: () => {
        connection = useGitHubKnowledgeConnection();
        return () => h('div');
      },
    });
    const wrapper = mount(Host, options(api));
    await flushPromises();
    expect(connection.error.value).not.toBe('');
    await connection.reload();
    await flushPromises();
    expect(connection.repositories.value).toHaveLength(1);
    connection.pending.value = true;
    connection.cancelAuthorization();
    expect(connection.pending.value).toBe(false);
    expect(sessionStorage.getItem(INTENT)).toBeNull();
    wrapper.unmount();
  });
  it('does not expire a pending authorization when a first load completes after deactivation', async () => {
    sessionStorage.setItem(INTENT, 'pending-intent');
    let finish!: (value: unknown) => void;
    const api = {
      listKnowledgeRepositoryConnections: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        )
        .mockResolvedValue(ok({ connections: [] })),
      getKnowledgeRepositoryInstallationIntentStatus: vi.fn(async () =>
        ok({ status: 'Finalized', expiresAt: Date.now() + 60000 }),
      ),
      finalizeKnowledgeRepositoryInstallationIntent: vi.fn(async () =>
        ok({ installationId: 'installation-1', repositories: [] }),
      ),
    };
    const show = ref(true);
    let connection!: ReturnType<typeof useGitHubKnowledgeConnection>;
    const Child = defineComponent({
      setup: () => {
        connection = useGitHubKnowledgeConnection();
        return () => h('div');
      },
    });
    const Host = defineComponent({
      setup: () => () => h(KeepAlive, null, { default: () => (show.value ? h(Child) : null) }),
    });
    const wrapper = mount(Host, options(api));
    await flushPromises();
    show.value = false;
    await flushPromises();
    finish(ok({ connections: [] }));
    await flushPromises();
    expect(api.getKnowledgeRepositoryInstallationIntentStatus).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(INTENT)).toBe('pending-intent');
    expect(connection.error.value).toBe('');
    show.value = true;
    await flushPromises();
    expect(api.finalizeKnowledgeRepositoryInstallationIntent).toHaveBeenCalledTimes(1);
    expect(connection.busy.value).toBe(false);
    wrapper.unmount();
  });
});
