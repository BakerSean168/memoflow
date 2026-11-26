import { defineComponent, h, KeepAlive, reactive, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { REPOSITORY_SERVICE_KEY } from '@repository-ui-test-host/di/keys';
import repository from '@repository-ui-test-host/locales/en-US/repository';
import { repositoryUiHost } from '../repository-ui-host';
import LocalVaultWorkspaceView from './LocalVaultWorkspaceView.vue';
const routerMocks = vi.hoisted(() => ({ replace: vi.fn(async () => undefined) }));
const route = reactive({ name: 'repository', query: {} as Record<string, string> });
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => routerMocks }));
const Button = defineComponent({
  props: ['disabled'],
  setup:
    (props, { slots, attrs }) =>
    () =>
      h('button', { ...attrs, disabled: props.disabled }, slots.default?.()),
});
const binding = {
  id: 'vault-1',
  knowledgeSpaceId: 'space-1',
  localProfileId: 'profile-1',
  rootPath: '/vault',
  displayName: 'Thought Forest',
  boundAt: 1,
  detachedAt: null,
};
const note = {
  knowledgeDocumentId: 'document-1',
  relativePath: 'notes/saved.md',
  title: 'Saved note',
  excerpt: '',
  contentHash: 'hash',
  aliases: [],
  tags: [],
  outgoingLinks: [],
  size: 10,
  updatedAt: 1,
};
const Filter = defineComponent({
  props: ['modelValue', 'options'],
  emits: ['update:modelValue'],
  setup:
    (props, { emit, attrs }) =>
    () =>
      h(
        'select',
        {
          'data-testid': attrs['test-id'],
          value: props.modelValue,
          onChange: (event: Event) =>
            emit('update:modelValue', (event.target as HTMLSelectElement).value),
        },
        props.options.map((option: { value: string; label: string }) =>
          h('option', { value: option.value }, option.label),
        ),
      ),
});
function service(state = 'Available') {
  return {
    getLocalVaultBinding: vi.fn(async () =>
      ok({ binding, health: { bindingId: binding.id, state, observedAt: 1, detail: null } }),
    ),
    listLocalVaultWrites: vi.fn(async () =>
      ok([
        {
          documentId: 'document-1',
          title: 'Saved note',
          relativePath: 'notes/saved.md',
          createdAt: 1000,
        },
      ]),
    ),
    scanLocalVault: vi.fn(async () => ok({ binding, health: { state }, notes: [note] })),
    getLocalVaultGitChanges: vi.fn(async () =>
      ok({
        bindingId: binding.id,
        state: 'ready',
        observedAt: 1,
        changes: [
          { relativePath: 'notes/saved.md', status: 'modified' },
          { relativePath: 'notes/new.md', status: 'added' },
          { relativePath: 'notes/deleted.md', status: 'deleted' },
        ],
      }),
    ),
    openLocalVaultInObsidian: vi.fn(async () => ok(undefined)),
  };
}
function options(api: ReturnType<typeof service>) {
  return {
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en-US',
          missingWarn: false,
          fallbackWarn: false,
          messages: { 'en-US': { repository } },
        }),
      ],
      provide: { [REPOSITORY_SERVICE_KEY as symbol]: api },
      stubs: { Button, ProductSingleSelectFilter: Filter, KnowledgeCaptureReviewDialog: true },
    },
  };
}
beforeEach(() => {
  route.name = 'repository';
  route.query = {};
  vi.clearAllMocks();
  vi.spyOn(repositoryUiHost, 'useKnowledgeBusinessLinks').mockReturnValue(async () => [
    {
      documentId: 'document-1',
      subjectType: 'goal',
      subjectId: 'goal-1',
      title: 'Build a calmer workspace',
    },
  ]);
});
afterEach(() => vi.restoreAllMocks());
describe('Local Vault connection workspace', () => {
  it('shows linked and changed notes and opens the original note in Obsidian', async () => {
    const api = service();
    const wrapper = mount(LocalVaultWorkspaceView, options(api));
    await flushPromises();
    expect(wrapper.text()).toContain('Thought Forest');
    expect(wrapper.text()).toContain('Saved note');
    expect(wrapper.find('input').exists()).toBe(false);
    await wrapper
      .get('[data-note-path="notes/saved.md"] [data-testid="knowledge-note-open"]')
      .trigger('click');
    await flushPromises();
    expect(api.openLocalVaultInObsidian).toHaveBeenCalledWith({ relativePath: 'notes/saved.md' });
    expect(api.scanLocalVault).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('filters linked notes and keeps deleted entries visible without an open action', async () => {
    const api = service();
    const wrapper = mount(LocalVaultWorkspaceView, options(api));
    await flushPromises();
    expect(wrapper.findAll('[data-note-path]')).toHaveLength(3);
    expect(
      wrapper.get('[data-note-path="notes/deleted.md"] button').attributes('disabled'),
    ).toBeDefined();
    await wrapper.get('select').setValue('linked');
    expect(wrapper.findAll('[data-note-path]')).toHaveLength(1);
    expect(wrapper.text()).toContain('Build a calmer workspace');
    await wrapper.get('select').setValue('changes');
    expect(wrapper.findAll('[data-note-path]')).toHaveLength(3);
    wrapper.unmount();
  });
  it('retains linked notes when the Git read fails instead of claiming a clean workspace', async () => {
    const api = service();
    api.getLocalVaultGitChanges.mockResolvedValueOnce(
      fail({ code: 'INTERNAL_ERROR', message: 'Unavailable' }) as never,
    );
    const wrapper = mount(LocalVaultWorkspaceView, options(api));
    await flushPromises();
    expect(wrapper.text()).toContain('Saved note');
    expect(wrapper.text()).toContain(repository.workspace.gitUnavailable);
    expect(wrapper.find('[data-testid="knowledge-notes-empty"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('keeps an unavailable binding visible for repair', async () => {
    const api = service('Missing');
    const wrapper = mount(LocalVaultWorkspaceView, options(api));
    await flushPromises();
    expect(wrapper.get('[data-testid="local-vault-menu"]').attributes('title')).toBe('/vault');
    expect(
      wrapper.get('[data-testid="local-vault-open-obsidian"]').attributes('disabled'),
    ).toBeDefined();
    expect(api.listLocalVaultWrites).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('does not reinterpret a historic source link in a different Vault', async () => {
    route.query = { notePath: 'notes/saved.md', sourceBindingId: 'old-vault' };
    const api = service();
    const wrapper = mount(LocalVaultWorkspaceView, options(api));
    await flushPromises();
    expect(api.openLocalVaultInObsidian).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('only the active KeepAlive page consumes a note link and refreshes on return', async () => {
    const show = ref(true);
    const api = service();
    const Host = defineComponent({
      setup: () => () =>
        h(KeepAlive, null, { default: () => (show.value ? h(LocalVaultWorkspaceView) : null) }),
    });
    const wrapper = mount(Host, options(api));
    await flushPromises();
    show.value = false;
    await flushPromises();
    route.query = { note: 'document-1' };
    await flushPromises();
    expect(api.openLocalVaultInObsidian).not.toHaveBeenCalled();
    show.value = true;
    await flushPromises();
    expect(api.getLocalVaultBinding).toHaveBeenCalledTimes(2);
    expect(api.openLocalVaultInObsidian).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('restarts an interrupted first load when the cached page becomes active again', async () => {
    let finish!: (value: unknown) => void;
    const api = service();
    api.getLocalVaultBinding.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }) as never,
    );
    const show = ref(true);
    const Host = defineComponent({
      setup: () => () =>
        h(KeepAlive, null, { default: () => (show.value ? h(LocalVaultWorkspaceView) : null) }),
    });
    const wrapper = mount(Host, options(api));
    await flushPromises();
    show.value = false;
    await flushPromises();
    finish(ok({ binding, health: { bindingId: binding.id, state: 'Available' } }));
    await flushPromises();
    show.value = true;
    await flushPromises();
    expect(api.getLocalVaultBinding).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Thought Forest');
    wrapper.unmount();
  });
  it('does not let a delayed first note navigation consume a newer link', async () => {
    route.query = { note: 'first' };
    let finish!: (value: unknown) => void;
    const api = service();
    api.scanLocalVault.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }) as never,
    );
    const wrapper = mount(LocalVaultWorkspaceView, options(api));
    await flushPromises();
    route.query = { note: 'document-1' };
    await flushPromises();
    finish(
      ok({ binding, notes: [{ ...note, knowledgeDocumentId: 'first', relativePath: 'first.md' }] }),
    );
    await flushPromises();
    expect(api.openLocalVaultInObsidian).toHaveBeenCalledTimes(1);
    expect(api.openLocalVaultInObsidian).toHaveBeenCalledWith({ relativePath: 'notes/saved.md' });
    wrapper.unmount();
  });
});
