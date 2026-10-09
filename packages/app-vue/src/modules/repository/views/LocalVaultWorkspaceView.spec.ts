import { defineComponent, h, reactive, ref, KeepAlive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type {
  LocalVaultBindingSnapshotDTO,
  LocalVaultNoteDTO,
  LocalVaultNoteSummaryDTO,
} from '@memoflow/contracts/repository';
import { REPOSITORY_SERVICE_KEY } from '../../../di/keys';
import type { IRepositoryService } from '../../../di/types';
import KnowledgeCaptureReviewDialog from '../components/KnowledgeCaptureReviewDialog.vue';
import LocalVaultWorkspaceView from './LocalVaultWorkspaceView.vue';
import { listAdapterFor } from '../../../shared/keyboard/list-adapter';

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(async () => undefined),
  route: {
    query: {} as Record<string, string | string[] | undefined>,
  },
}));

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: routerMocks.replace }),
}));

const route = reactive(routerMocks.route);

const messages = {
  common: {
    retry: 'Retry',
    cancel: 'Cancel',
    clear: 'Clear',
  },
  repository: {
    localVault: {
      selectTitle: 'Select a local Obsidian Vault',
      selectDescription: 'Notes remain local.',
      selectAction: 'Select Vault folder',
      rescan: 'Rescan',
      openRoot: 'Open Vault in Obsidian',
      openNote: 'Open in Obsidian',
      changeVault: 'Change Vault',
      detach: 'Disconnect',
      detachTitle: 'Disconnect local Vault',
      detachDescription: 'Files remain unchanged.',
      searchPlaceholder: 'Search titles, paths, and content',
      noSearchResults: 'No matching notes',
      noNotes: 'No Markdown notes in this Vault',
      selectNote: 'Select a note',
      selectNoteDescription: 'Preview notes here and continue editing them in Obsidian.',
    },
  },
};

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': messages },
});

const ButtonStub = defineComponent({
  props: ['disabled'],
  setup(props, { attrs, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          disabled: props.disabled,
        },
        slots.default?.(),
      );
  },
});

const InputStub = defineComponent({
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue ?? '',
        placeholder: props.placeholder,
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});

const PassthroughStub = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.());
  },
});

const MarkdownPreviewStub = defineComponent({
  props: ['markdown', 'title'],
  emits: ['vault-link'],
  setup(props, { attrs }) {
    return () => h('article', attrs, String(props.markdown ?? ''));
  },
});

function snapshot(): LocalVaultBindingSnapshotDTO {
  const bindingId = 'LocalVaultBindingId_550e8400-e29b-41d4-a716-446655440000' as never;
  return {
    binding: {
      id: bindingId,
      knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440001' as never,
      localProfileId: 'profile-1',
      rootPath: '/vault',
      displayName: 'Thought Forest',
      boundAt: 1,
      detachedAt: null,
    },
    health: {
      bindingId,
      state: 'Available',
      observedAt: 1,
      detail: null,
    },
  };
}

function noteSummary(overrides: Partial<LocalVaultNoteSummaryDTO> = {}): LocalVaultNoteSummaryDTO {
  return {
    relativePath: 'notes/architecture.md',
    knowledgeDocumentId: null,
    title: 'Architecture',
    excerpt: 'Architecture overview',
    tags: ['architecture', 'product'],
    outgoingLinks: [],
    size: 128,
    updatedAt: 1,
    ...overrides,
  };
}

function noteDetail(overrides: Partial<LocalVaultNoteDTO> = {}): LocalVaultNoteDTO {
  return {
    ...noteSummary(),
    contentMarkdown: '# Architecture',
    frontmatter: {},
    ...overrides,
  };
}

function createService() {
  const binding = snapshot();
  const summary = noteSummary();
  const getLocalVaultBinding = vi.fn(async () => ok<LocalVaultBindingSnapshotDTO | null>(binding));
  const scanLocalVault = vi.fn(async () =>
    ok({
      binding: binding.binding,
      health: binding.health,
      notes: [summary],
      scannedAt: 2,
    }),
  );
  const readLocalVaultNote = vi.fn(async ({ relativePath }: { relativePath: string }) =>
    ok(noteDetail({ relativePath })),
  );
  const searchLocalVault = vi.fn(async (request: { query: string }) =>
    ok({
      query: request.query,
      results: [
        {
          note: summary,
          matches: [
            {
              lineNumber: 2,
              lineContent: 'matched line from local vault',
              startIndex: 0,
              endIndex: 7,
            },
          ],
        },
      ],
    }),
  );
  const openLocalVaultInObsidian = vi.fn(async () => ok(undefined));

  const service = {
    getLocalVaultBinding,
    scanLocalVault,
    readLocalVaultNote,
    searchLocalVault,
    openLocalVaultInObsidian,
  } as unknown as IRepositoryService;

  return {
    service,
    getLocalVaultBinding,
    scanLocalVault,
    readLocalVaultNote,
    searchLocalVault,
    openLocalVaultInObsidian,
  };
}

function mountWorkspace(
  service: IRepositoryService,
  attachTo?: HTMLElement,
  shown?: ReturnType<typeof ref<boolean>>,
) {
  const component = shown
    ? defineComponent({
        setup: () => () =>
          h(KeepAlive, null, () => (shown.value ? h(LocalVaultWorkspaceView) : null)),
      })
    : LocalVaultWorkspaceView;
  return mount(component, {
    attachTo,
    global: {
      plugins: [i18n],
      provide: {
        [REPOSITORY_SERVICE_KEY as symbol]: service,
      },
      stubs: {
        KnowledgeCaptureReviewDialog: true,
        Badge: PassthroughStub,
        Button: ButtonStub,
        Input: InputStub,
        KnowledgeMarkdownPreview: MarkdownPreviewStub,
      },
    },
  });
}

beforeEach(() => {
  route.query = {};
});

describe('LocalVaultWorkspaceView', () => {
  it('loads a Vault bound in settings while an initially unbound workspace was hidden', async () => {
    const mocks = createService();
    mocks.getLocalVaultBinding.mockResolvedValueOnce(ok(null));
    const shown = ref(true);
    const wrapper = mountWorkspace(mocks.service, undefined, shown);
    await flushPromises();
    expect(wrapper.find('[data-testid="local-vault-empty"]').exists()).toBe(true);
    expect(mocks.scanLocalVault).not.toHaveBeenCalled();
    shown.value = false;
    await flushPromises();
    shown.value = true;
    await flushPromises();
    expect(wrapper.find('[data-testid="local-vault-note-notes/architecture.md"]').exists()).toBe(
      true,
    );
    expect(mocks.scanLocalVault).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it.each(['detached', 'unavailable'] as const)(
    'clears cached content when the hidden Vault becomes %s',
    async (state) => {
      const mocks = createService();
      const shown = ref(true);
      const wrapper = mountWorkspace(mocks.service, undefined, shown);
      await flushPromises();
      await wrapper.get('[data-testid="local-vault-note-notes/architecture.md"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="local-vault-preview"]').exists()).toBe(true);
      shown.value = false;
      await flushPromises();
      const unavailable = snapshot();
      unavailable.health.state = 'Missing';
      mocks.getLocalVaultBinding.mockResolvedValueOnce(
        ok(state === 'detached' ? null : unavailable),
      );
      mocks.scanLocalVault.mockClear();
      shown.value = true;
      await flushPromises();
      expect(wrapper.find('[data-testid="local-vault-empty"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="local-vault-preview"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="document-source-status"]').exists()).toBe(false);
      expect(mocks.scanLocalVault).not.toHaveBeenCalled();
      wrapper.unmount();
    },
  );

  it('clears cached note and search projections when reactivated under a different Vault binding', async () => {
    const mocks = createService();
    const shown = ref(true);
    const wrapper = mountWorkspace(mocks.service, undefined, shown);
    await flushPromises();
    await wrapper.get('[data-testid="local-vault-note-notes/architecture.md"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="local-vault-preview"]').exists()).toBe(true);
    const search = wrapper.get('[data-testid="local-vault-search"]');
    await search.setValue('architecture');
    await search.trigger('keyup', { key: 'Enter' });
    await flushPromises();
    shown.value = false;
    await flushPromises();
    const nextBinding = snapshot();
    nextBinding.binding.id = 'LocalVaultBindingId_550e8400-e29b-41d4-a716-446655440999' as never;
    nextBinding.binding.rootPath = '/other-vault';
    mocks.getLocalVaultBinding.mockResolvedValueOnce(ok(nextBinding));
    mocks.scanLocalVault.mockResolvedValueOnce(
      ok({ ...nextBinding, notes: [noteSummary({ title: 'Other Vault note' })], scannedAt: 3 }),
    );
    shown.value = true;
    await flushPromises();
    expect(wrapper.get('[data-testid="document-source-status"]').text()).toContain('/other-vault');
    expect(wrapper.find('[data-testid="local-vault-preview"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="local-vault-note-notes/architecture.md"]').text()).toContain(
      'Other Vault note',
    );
    wrapper.unmount();
  });
  it('renders a bounded window of 10,000 notes while keyboard navigation reaches the last note', async () => {
    const mocks = createService();
    const notes = Array.from({ length: 10_000 }, (_, index) =>
      noteSummary({ relativePath: `note-${index}.md`, title: `Note ${index}` }),
    );
    mocks.scanLocalVault.mockResolvedValueOnce(ok({ ...snapshot(), notes, scannedAt: 2 }));
    mocks.readLocalVaultNote.mockImplementation(async ({ relativePath }) =>
      ok(noteDetail({ relativePath })),
    );
    const wrapper = mountWorkspace(mocks.service, document.body);
    try {
      await flushPromises();
      const rows = wrapper.findAll('[data-keyboard-item]');
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThan(40);
      const container = wrapper.get('[data-testid="local-vault-catalog-scroll"]')
        .element as HTMLElement;
      Object.defineProperty(container, 'clientHeight', { value: 560, configurable: true });
      container.scrollTo = (options: ScrollToOptions | number, y?: number) => {
        container.scrollTop = typeof options === 'number' ? (y ?? 0) : (options.top ?? 0);
      };
      const adapter = listAdapterFor(wrapper.get('[data-keyboard-list]').element);
      expect(adapter).not.toBeNull();
      adapter!.moveSelection(-1);
      await flushPromises();
      expect(adapter!.activeItemId).toBe('note-9999.md');
      expect(document.activeElement?.getAttribute('data-keyboard-item')).toBe('note-9999.md');
      expect(wrapper.findAll('[data-keyboard-item]').length).toBeLessThan(40);
      expect(adapter!.openItem()).toBe(true);
      await flushPromises();
      expect(mocks.readLocalVaultNote).toHaveBeenCalledWith({ relativePath: 'note-9999.md' });
    } finally {
      wrapper.unmount();
    }
  });
  it('keeps the latest opened note when reads finish in the opposite order', async () => {
    const mocks = createService();
    const second = noteSummary({ relativePath: 'Second.md', title: 'Second' });
    mocks.scanLocalVault.mockResolvedValueOnce(
      ok({ ...snapshot(), notes: [noteSummary(), second], scannedAt: 2 }),
    );
    let resolveFirst!: (value: Awaited<ReturnType<typeof mocks.readLocalVaultNote>>) => void;
    mocks.readLocalVaultNote.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    mocks.readLocalVaultNote.mockResolvedValueOnce(
      ok(noteDetail({ ...second, contentMarkdown: '# Second' })),
    );
    const wrapper = mountWorkspace(mocks.service);
    await flushPromises();
    await wrapper.get('[data-testid="local-vault-note-notes/architecture.md"]').trigger('click');
    await wrapper.get('[data-testid="local-vault-note-Second.md"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="local-vault-preview"]').text()).toContain('# Second');
    resolveFirst(ok(noteDetail()));
    await flushPromises();
    expect(wrapper.get('[data-testid="local-vault-preview"]').text()).toContain('# Second');
    wrapper.unmount();
  });

  it('does not republish a completed search after the query was cleared', async () => {
    const mocks = createService();
    let resolveSearch!: (value: Awaited<ReturnType<typeof mocks.searchLocalVault>>) => void;
    mocks.searchLocalVault.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );
    const wrapper = mountWorkspace(mocks.service);
    await flushPromises();
    const search = wrapper.get('[data-testid="local-vault-search"]');
    await search.setValue('previous');
    await search.trigger('keyup', { key: 'Enter' });
    await flushPromises();
    await wrapper.get('[aria-label="Clear"]').trigger('click');
    resolveSearch(ok({ query: 'previous', results: [] }));
    await flushPromises();
    expect(wrapper.find('[data-testid="local-vault-note-notes/architecture.md"]').exists()).toBe(
      true,
    );
    expect(mocks.searchLocalVault).toHaveBeenCalledWith({ query: '' });
    wrapper.unmount();
  });

  it('uses shared document composition while preserving local-vault and Obsidian actions', async () => {
    const mocks = createService();
    const wrapper = mountWorkspace(mocks.service);
    await flushPromises();

    expect(mocks.getLocalVaultBinding).toHaveBeenCalledTimes(1);
    expect(mocks.scanLocalVault).toHaveBeenCalledTimes(1);

    const source = wrapper.get('[data-testid="document-source-status"]');
    expect(source.text()).toContain('Thought Forest');
    expect(source.text()).toContain('/vault');
    expect(source.text()).toContain('1');

    expect(wrapper.get('[data-testid="local-vault-document-toolbar"]').text()).toContain(
      'Select a note',
    );
    expect(wrapper.get('[data-testid="local-vault-search"]')).toBeDefined();

    await wrapper.get('[data-testid="local-vault-note-notes/architecture.md"]').trigger('click');
    await flushPromises();

    expect(mocks.readLocalVaultNote).toHaveBeenCalledWith({
      relativePath: 'notes/architecture.md',
    });
    const toolbar = wrapper.get('[data-testid="local-vault-document-toolbar"]');
    expect(toolbar.text()).toContain('Architecture');
    expect(toolbar.text()).toContain('notes/architecture.md');
    expect(wrapper.get('[data-testid="local-vault-preview"]').text()).toContain('# Architecture');

    await wrapper.get('[data-testid="local-vault-open-note-obsidian"]').trigger('click');
    await flushPromises();
    expect(mocks.openLocalVaultInObsidian).toHaveBeenCalledWith({
      relativePath: 'notes/architecture.md',
    });

    const search = wrapper.get('[data-testid="local-vault-search"]');
    await search.setValue('runtime');
    await search.trigger('keyup', { key: 'Enter' });
    await flushPromises();

    expect(mocks.searchLocalVault).toHaveBeenCalledWith({ query: 'runtime', limit: 100 });
    expect(wrapper.get('[data-testid="local-vault-catalog"]').text()).toContain(
      'matched line from local vault',
    );

    wrapper.unmount();
  });
  it('exports a host-neutral Local Vault source only while bound', async () => {
    const mocks = createService();
    const wrapper = mountWorkspace(mocks.service);
    const dialog = wrapper.getComponent(KnowledgeCaptureReviewDialog);
    expect(dialog.props('sourceOptions')).toEqual([]);
    await flushPromises();
    expect(dialog.props('sourceOptions')).toEqual([
      { key: 'local_vault', label: 'Thought Forest', source: { kind: 'local_vault' } },
    ]);
    expect(JSON.stringify(dialog.props('sourceOptions'))).not.toContain('/vault');
    wrapper.unmount();
  });
  it('opens the created document by stable identity after the catalog loads', async () => {
    const id = 'kdoc_550e8400-e29b-41d4-a716-446655440701';
    route.query = { note: id };
    const mocks = createService();
    mocks.scanLocalVault.mockResolvedValueOnce(
      ok({
        binding: snapshot().binding,
        health: snapshot().health,
        notes: [noteSummary({ knowledgeDocumentId: id as never })],
        scannedAt: 2,
      }),
    );
    const wrapper = mountWorkspace(mocks.service);
    await flushPromises();
    expect(mocks.readLocalVaultNote).toHaveBeenCalledWith({
      relativePath: 'notes/architecture.md',
    });
    wrapper.unmount();
    route.query = {};
  });
  it('refreshes a cached Vault catalog to locate a newly persisted stable document', async () => {
    const id = 'kdoc_550e8400-e29b-41d4-a716-446655440705';
    const mocks = createService();
    const wrapper = mountWorkspace(mocks.service);
    await flushPromises();
    mocks.scanLocalVault.mockResolvedValueOnce(
      ok({
        binding: snapshot().binding,
        health: snapshot().health,
        notes: [noteSummary({ knowledgeDocumentId: id as never })],
        scannedAt: 3,
      }),
    );
    route.query = { note: id };
    await flushPromises();
    expect(mocks.scanLocalVault).toHaveBeenCalledTimes(2);
    expect(mocks.readLocalVaultNote).toHaveBeenCalledWith({
      relativePath: 'notes/architecture.md',
    });
    wrapper.unmount();
    route.query = {};
  });
});
