import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type {
  AdoptKnowledgeDocumentReq,
  KnowledgeNoteProjectionClientDTO,
  KnowledgeNoteProjectionSummaryDTO,
  KnowledgeRemoteBindingClientDTO,
} from '@memoflow/contracts/repository';
import { REPOSITORY_SERVICE_KEY } from '../../../di/keys';
import type { IRepositoryService } from '../../../di/types';
import { providePanelWidth } from '../../../layouts/shell/usePanelWidth';
import KnowledgeNoteCatalog from '../components/KnowledgeNoteCatalog.vue';
import KnowledgeProjectionWorkspaceView from './KnowledgeProjectionWorkspaceView.vue';

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(async () => undefined),
  replace: vi.fn(async () => undefined),
  route: {
    query: {} as Record<string, string | string[] | undefined>,
    params: {} as Record<string, string>,
    path: '/repository',
    name: 'repository',
  },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerMocks.push, replace: routerMocks.replace }),
  useRoute: () => routerMocks.route,
}));

const messages = {
  common: {
    retry: 'Retry',
    cancel: 'Cancel',
    clear: 'Clear',
    close: 'Close',
    more: 'More',
  },
  repository: {
    projection: {
      title: 'Knowledge notes',
      connectTitle: 'Connect a repository',
      connectDescription: 'Connect a private GitHub repository.',
      connectAction: 'Open repository settings',
      connectionLabel: 'Repository connection',
      commit: 'Commit {sha}',
      refresh: 'Refresh',
      syncing: 'Syncing repository',
      syncingDescription: 'Notes will appear automatically.',
      searchPlaceholder: 'Search notes…',
      noSearchResults: 'No search results',
      noNotes: 'No notes',
      loadMore: 'Load more',
      loadedCount: '{loaded} of {total} loaded',
      hiddenDirectories: 'Hidden directories',
      showHiddenDirectories: 'Show hidden directories',
      hiddenNoteCount: '{count} notes hidden',
      documentId: 'Stable reference ID',
      stableReferenceAction: 'Create stable reference',
      stableReferenceReady: 'Stable reference ready',
      stableReferenceDescription: 'Stable across moves and renames.',
      adoptTitle: 'Create stable reference',
      adoptDescription: 'Add a stable metadata identity.',
      adoptPatch: 'Metadata patch',
      adoptImmutable: 'Bound to the current Git blob.',
      adoptConfirmAction: 'Confirm stable reference',
      notePath: 'Path',
      catalogTitle: 'Notes',
      openCatalog: 'Open note list',
      hideCatalog: 'Hide note list',
      contextTitle: 'Context',
      outlineTitle: 'Outline',
      noOutline: 'No outline',
      linksTitle: 'Links',
      metadataTitle: 'Info',
      commitLabel: 'Commit',
      updatedLabel: 'Updated',
      stableReferenceLabel: 'Stable reference',
      stableReferenceMissing: 'Not created',
      copyPath: 'Copy path',
      pathCopied: 'Path copied',
      selectNote: 'Select a note',
      selectNoteDescription: 'Choose a projected note.',
      providerStatus: {
        Ready: 'GitHub connected',
        Blocked: 'GitHub needs attention',
        Unchecked: 'GitHub not checked',
      },
    },
  },
};

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': messages },
});

const PassthroughStub = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.());
  },
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
  props: ['modelValue', 'id', 'placeholder', 'disabled'],
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        id: props.id,
        value: props.modelValue ?? '',
        placeholder: props.placeholder,
        disabled: props.disabled,
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});

const DialogStub = defineComponent({
  props: ['open'],
  setup(props, { attrs, slots }) {
    return () => (props.open ? h('section', attrs, slots.default?.()) : null);
  },
});

const SheetStub = defineComponent({
  props: ['open'],
  emits: ['update:open'],
  setup(props, { attrs, slots }) {
    return () => (props.open ? h('section', attrs, slots.default?.()) : null);
  },
});

const ProductDialogShellStub = defineComponent({
  props: ['open'],
  setup(props, { attrs, slots }) {
    return () =>
      props.open
        ? h('section', attrs, [
            slots.title?.(),
            slots.description?.(),
            slots.default?.(),
            slots.footer?.(),
          ])
        : null;
  },
});

const ContextPanelStub = defineComponent({
  props: ['note'],
  emits: ['select', 'close'],
  setup(props, { emit }) {
    return () =>
      h('div', { 'data-testid': 'knowledge-context-stub' }, [
        h('span', String((props.note as { id?: string } | undefined)?.id ?? '')),
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'knowledge-context-select-related',
            onClick: () => emit('select', 'projection-related'),
          },
          'related',
        ),
        h(
          'button',
          {
            type: 'button',
            'data-testid': 'knowledge-context-close-stub',
            onClick: () => emit('close'),
          },
          'close',
        ),
      ]);
  },
});

const BINDING_ID = 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440401' as never;
const SPACE_ID = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440402' as never;
const SECOND_BINDING_ID = 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440403' as never;

function connection(
  overrides: Partial<KnowledgeRemoteBindingClientDTO> = {},
): KnowledgeRemoteBindingClientDTO {
  const base: KnowledgeRemoteBindingClientDTO = {
    id: BINDING_ID,
    knowledgeSpaceId: SPACE_ID,
    identityId: 'IdentityId_11111111-1111-4111-8111-111111111111' as never,
    provider: 'GitHub',
    installationId: 'installation-1',
    repositoryId: 'repository-1',
    repositoryFullNameSnapshot: 'owner/knowledge',
    connectedAt: 1,
    disconnectedAt: null,
    observation: {
      bindingId: BINDING_ID,
      observedAt: 1,
      accountId: '42',
      repositoryFullName: 'owner/knowledge',
      defaultBranch: 'main',
      private: true,
      archived: false,
      disabled: false,
      contentsPermission: 'write',
      installationSuspended: false,
      eligibility: { state: 'Ready' },
    },
    historyFence: {
      bindingId: BINDING_ID,
      defaultBranch: 'main',
      lastConfirmedRemoteHeadSha: 'a'.repeat(40),
      confirmedAt: 1,
    },
    projectionCheckpoint: {
      bindingId: BINDING_ID,
      branch: 'main',
      projectedCommitSha: 'b'.repeat(40),
      state: 'Ready',
      failure: null,
      lastAttemptAt: 1,
      projectedAt: 1,
    },
  };
  return { ...base, ...overrides };
}

function projection(
  overrides: Partial<KnowledgeNoteProjectionClientDTO> = {},
): KnowledgeNoteProjectionClientDTO {
  return {
    id: 'projection-1',
    connectionId: BINDING_ID,
    knowledgeDocumentId: null,
    relativePath: 'notes/architecture.md',
    title: 'Architecture',
    commitSha: 'b'.repeat(40),
    blobSha: 'c'.repeat(40),
    contentHash: 'd'.repeat(64),
    frontmatter: { title: 'Architecture' },
    markdownContent:
      '---\ntitle: Architecture\n---\n\n# Safe\n\n<script>alert(1)</script> **content**',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

function summary(
  overrides: Partial<KnowledgeNoteProjectionSummaryDTO> = {},
): KnowledgeNoteProjectionSummaryDTO {
  const detail = projection(overrides as Partial<KnowledgeNoteProjectionClientDTO>);
  return {
    id: detail.id,
    connectionId: detail.connectionId,
    knowledgeDocumentId: detail.knowledgeDocumentId,
    relativePath: detail.relativePath,
    title: detail.title,
    contentHash: detail.contentHash,
    updatedAt: detail.updatedAt,
  };
}

function treeNote(overrides: Partial<KnowledgeNoteProjectionSummaryDTO> = {}) {
  const item = summary(overrides);
  return {
    kind: 'note' as const,
    name: item.relativePath.split('/').pop()?.replace(/\.md$/i, '') ?? item.title,
    title: item.title,
    relativePath: item.relativePath,
    projectionId: item.id,
    knowledgeDocumentId: item.knowledgeDocumentId,
    contentHash: item.contentHash,
    updatedAt: item.updatedAt,
  };
}

function createService(overrides: Partial<IRepositoryService> = {}): IRepositoryService {
  return {
    listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [connection()] })),
    listKnowledgeNoteProjections: vi.fn(async () =>
      ok({ notes: [summary()], total: 1, nextCursor: null }),
    ),
    listKnowledgeNoteTree: vi.fn(async (request?: { parent?: string }) =>
      ok({
        parent: request?.parent ?? '',
        nodes: request?.parent ? [] : [treeNote()],
        metadata: request?.parent
          ? null
          : {
              total: 3648,
              visibleTotal: 3477,
              hiddenNoteCount: 171,
              hiddenDirectories: ['.*', 'node_modules', 'generated'],
            },
      }),
    ),
    resolveKnowledgeNoteReference: vi.fn(async (request: { reference: string }) =>
      ok(projection({ id: request.reference })),
    ),
    getKnowledgeNoteProjection: vi.fn(async (projectionId: string) =>
      ok(projection({ id: projectionId })),
    ),
    createConfirmedKnowledgeNote: vi.fn(),
    adoptKnowledgeDocument: vi.fn(),
    ...overrides,
  } as unknown as IRepositoryService;
}

function mountWorkspace(service: IRepositoryService, options: { narrow?: boolean } = {}) {
  const component = options.narrow
    ? defineComponent({
        name: 'NarrowKnowledgeProjectionWorkspaceHost',
        setup() {
          const { width } = providePanelWidth();
          width.value = 600;
          return () => h(KnowledgeProjectionWorkspaceView);
        },
      })
    : KnowledgeProjectionWorkspaceView;

  return mount(component, {
    global: {
      plugins: [i18n],
      provide: {
        [REPOSITORY_SERVICE_KEY as symbol]: service,
      },
      stubs: {
        Badge: PassthroughStub,
        Button: ButtonStub,
        Dialog: DialogStub,
        Sheet: SheetStub,
        SheetContent: PassthroughStub,
        SheetHeader: PassthroughStub,
        SheetTitle: PassthroughStub,
        DropdownMenu: PassthroughStub,
        DropdownMenuTrigger: PassthroughStub,
        DropdownMenuContent: PassthroughStub,
        DropdownMenuItem: ButtonStub,
        DropdownMenuCheckboxItem: ButtonStub,
        DropdownMenuLabel: PassthroughStub,
        DropdownMenuSeparator: true,
        Input: InputStub,
        ProductDialogShell: ProductDialogShellStub,
        BookOpen: true,
        Check: true,
        CloudOff: true,
        Copy: true,
        Ellipsis: true,
        GitCommitHorizontal: true,
        Link2: true,
        Loader2: true,
        PanelLeftClose: true,
        PanelLeftOpen: true,
        PanelRight: true,
        RefreshCw: true,
        Search: true,
        X: true,
        KnowledgeNoteContextPanel: ContextPanelStub,
      },
    },
  });
}

describe('KnowledgeProjectionWorkspaceView', () => {
  beforeEach(() => {
    routerMocks.push.mockClear();
    routerMocks.replace.mockClear();
    routerMocks.route.query = {};
  });

  it('shows an unconnected state and routes to repository settings', async () => {
    const service = createService({
      listKnowledgeRepositoryConnections: vi.fn(async () => ok({ connections: [] })),
    });
    const wrapper = mountWorkspace(service);
    await flushPromises();

    expect(wrapper.get('[data-testid="knowledge-projection-empty"]').text()).toContain(
      'Connect a repository',
    );
    await wrapper.get('[data-testid="knowledge-projection-connect"]').trigger('click');

    expect(routerMocks.push).toHaveBeenCalledWith({
      path: '/settings',
      query: { tab: 'repository' },
    });
  });

  it('loads the lightweight file tree, shows the real total, and fetches only selected note detail', async () => {
    const listKnowledgeNoteTree = vi.fn(async () =>
      ok({
        parent: '',
        nodes: [
          treeNote(),
          treeNote({ id: 'projection-2', title: 'Second', relativePath: 'second.md' }),
        ],
        metadata: {
          total: 3648,
          visibleTotal: 3477,
          hiddenNoteCount: 171,
          hiddenDirectories: ['.git', '.obsidian', 'node_modules', 'generated'],
        },
      }),
    );
    const getKnowledgeNoteProjection = vi.fn(async (id: string) =>
      ok(projection({ id, title: id === 'projection-2' ? 'Second' : 'Architecture' })),
    );
    const wrapper = mountWorkspace(
      createService({ listKnowledgeNoteTree, getKnowledgeNoteProjection }),
    );
    await flushPromises();

    expect(wrapper.text()).toContain('3,648');
    expect(wrapper.get('[data-testid="knowledge-file-tree"]')).toBeDefined();

    const toolbar = wrapper.get('[data-testid="knowledge-projection-document-toolbar"]');
    expect(toolbar.text()).toContain('Architecture');
    expect(toolbar.text()).toContain('notes/architecture.md');
    expect(toolbar.text()).not.toContain('owner/knowledge');
    expect(toolbar.text()).not.toContain('3,648');

    const catalogRepository = wrapper.get('[data-testid="knowledge-catalog-repository"]');
    expect(catalogRepository.text()).toContain('knowledge');
    expect(catalogRepository.text()).toContain('owner/knowledge');
    expect(catalogRepository.text()).toContain('main');
    expect(catalogRepository.text()).toContain('3,648');

    expect(getKnowledgeNoteProjection).toHaveBeenCalledTimes(1);
    expect(getKnowledgeNoteProjection).toHaveBeenCalledWith(
      'projection-1',
      expect.objectContaining({ signal: expect.anything() }),
    );

    await wrapper.get('[data-testid="knowledge-tree-note-projection-2"]').trigger('click');
    await flushPromises();
    expect(getKnowledgeNoteProjection).toHaveBeenCalledWith(
      'projection-2',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('resolves stable document-id deep links even when the note is outside the loaded tree', async () => {
    const stableId = 'KnowledgeDocumentId_11111111-1111-4111-8111-111111111111';
    routerMocks.route.query = { note: stableId };
    const resolved = projection({
      id: 'projection-stable',
      knowledgeDocumentId: stableId as never,
      relativePath: 'z/stable.md',
      title: 'Stable linked note',
    });
    const resolveKnowledgeNoteReference = vi.fn(async () => ok(resolved));
    const getKnowledgeNoteProjection = vi.fn(async (id: string) => ok(projection({ id })));

    const wrapper = mountWorkspace(
      createService({ resolveKnowledgeNoteReference, getKnowledgeNoteProjection }),
    );
    await flushPromises();

    expect(resolveKnowledgeNoteReference).toHaveBeenCalledWith(
      {
        connectionId: BINDING_ID,
        reference: stableId,
      },
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(getKnowledgeNoteProjection).not.toHaveBeenCalledWith(stableId, expect.anything());
    expect(wrapper.text()).toContain('Stable linked note');
    expect(wrapper.text()).toContain('z/stable.md');
  });

  it('keeps cursor pagination for search results while tree browsing stays lazy', async () => {
    const listKnowledgeNoteProjections = vi
      .fn()
      .mockResolvedValueOnce(
        ok({
          notes: [summary({ id: 'projection-1', title: 'First match' })],
          total: 2,
          nextCursor: 'q~100~1~projection-1',
        }),
      )
      .mockResolvedValueOnce(
        ok({
          notes: [summary({ id: 'projection-2', title: 'Second match' })],
          total: 2,
          nextCursor: null,
        }),
      );
    const wrapper = mountWorkspace(createService({ listKnowledgeNoteProjections }));
    await flushPromises();

    await wrapper.get('[data-testid="knowledge-projection-search"]').setValue('match');
    await new Promise((resolve) => setTimeout(resolve, 240));
    await flushPromises();
    await wrapper.get('[data-testid="knowledge-projection-load-more"]').trigger('click');
    await flushPromises();

    expect(listKnowledgeNoteProjections).toHaveBeenLastCalledWith(
      {
        connectionId: BINDING_ID,
        query: 'match',
        cursor: 'q~100~1~projection-1',
        limit: 50,
      },
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(wrapper.text()).toContain('Second match');
    expect(wrapper.find('[data-testid="knowledge-projection-load-more"]').exists()).toBe(false);
  });

  it('shows projection progress instead of a false empty state and auto-refreshes', async () => {
    vi.useFakeTimers();
    try {
      const lagging = connection({
        projectionCheckpoint: {
          ...connection().projectionCheckpoint!,
          projectedCommitSha: null,
          state: 'Lagging',
          lastAttemptAt: null,
          projectedAt: null,
        },
      });
      const ready = connection();
      const listKnowledgeRepositoryConnections = vi
        .fn()
        .mockResolvedValueOnce(ok({ connections: [lagging] }))
        .mockResolvedValue(ok({ connections: [ready] }));
      const listKnowledgeNoteTree = vi
        .fn()
        .mockResolvedValueOnce(
          ok({
            parent: '',
            nodes: [],
            metadata: {
              total: 0,
              visibleTotal: 0,
              hiddenNoteCount: 0,
              hiddenDirectories: ['.git', '.obsidian', 'node_modules', 'generated'],
            },
          }),
        )
        .mockResolvedValue(
          ok({
            parent: '',
            nodes: [treeNote()],
            metadata: {
              total: 1,
              visibleTotal: 1,
              hiddenNoteCount: 0,
              hiddenDirectories: ['.git', '.obsidian', 'node_modules', 'generated'],
            },
          }),
        );

      const wrapper = mountWorkspace(
        createService({ listKnowledgeRepositoryConnections, listKnowledgeNoteTree }),
      );
      await flushPromises();

      expect(wrapper.get('[data-testid="knowledge-projection-syncing-empty"]').text()).toContain(
        'Syncing repository',
      );

      await vi.advanceTimersByTimeAsync(1_500);
      await flushPromises();

      expect(listKnowledgeRepositoryConnections).toHaveBeenCalledTimes(2);
      expect(wrapper.text()).toContain('Architecture');
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('debounces server search and fetches the selected search result detail', async () => {
    vi.useFakeTimers();
    try {
      const searched = summary({
        id: 'projection-2',
        title: 'Search result',
        contentHash: 'e'.repeat(64),
      });
      const listKnowledgeNoteProjections = vi.fn(async (request?: { query?: string }) =>
        ok({
          notes: request?.query ? [searched] : [summary()],
          total: request?.query ? 1 : 3648,
          nextCursor: null,
        }),
      );
      const getKnowledgeNoteProjection = vi.fn(async (id: string) =>
        ok(
          id === 'projection-2'
            ? projection({
                id,
                title: 'Search result',
                contentHash: 'e'.repeat(64),
                markdownContent: '---\ntitle: Search result\n---\n\n**matched**',
              })
            : projection(),
        ),
      );
      const wrapper = mountWorkspace(
        createService({
          listKnowledgeNoteProjections: listKnowledgeNoteProjections as never,
          getKnowledgeNoteProjection,
        }),
      );
      await flushPromises();

      const preview = wrapper.get('[data-testid="knowledge-projection-preview"]');
      expect(preview.html()).toContain('<strong>content</strong>');
      expect(preview.html()).not.toContain('title: Architecture');
      expect(preview.html()).not.toContain('<script>');

      await wrapper.get('[data-testid="knowledge-projection-search"]').setValue('search result');
      await vi.advanceTimersByTimeAsync(220);
      await flushPromises();

      expect(listKnowledgeNoteProjections).toHaveBeenLastCalledWith(
        {
          connectionId: BINDING_ID,
          query: 'search result',
          cursor: undefined,
          limit: 50,
        },
        expect.objectContaining({ signal: expect.anything() }),
      );
      expect(getKnowledgeNoteProjection).toHaveBeenCalledWith(
        'projection-2',
        expect.objectContaining({ signal: expect.anything() }),
      );
      expect(wrapper.text()).toContain('3,648');
      expect(wrapper.text()).toContain('1 of 1 loaded');
      expect(wrapper.text()).toContain('Search result');
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts a stale debounced search request when a newer query starts', async () => {
    vi.useFakeTimers();
    try {
      let slowSignal: AbortSignal | undefined;
      let resolveSlow: ((value: ReturnType<typeof ok>) => void) | undefined;
      const listKnowledgeNoteProjections = vi.fn(
        async (request?: { query?: string }, options?: { signal?: AbortSignal }) => {
          if (!request?.query) {
            return ok({ notes: [summary()], total: 3648, nextCursor: null });
          }
          if (request.query === 'first') {
            slowSignal = options?.signal;
            return await new Promise<ReturnType<typeof ok>>((resolve) => {
              resolveSlow = resolve;
            });
          }
          return ok({
            notes: [summary({ id: 'projection-new', title: 'New result' })],
            total: 1,
            nextCursor: null,
          });
        },
      );
      const wrapper = mountWorkspace(
        createService({ listKnowledgeNoteProjections: listKnowledgeNoteProjections as never }),
      );
      await flushPromises();

      await wrapper.get('[data-testid="knowledge-projection-search"]').setValue('first');
      await vi.advanceTimersByTimeAsync(220);
      await Promise.resolve();
      expect(slowSignal?.aborted).toBe(false);

      await wrapper.get('[data-testid="knowledge-projection-search"]').setValue('second');
      await vi.advanceTimersByTimeAsync(220);
      await flushPromises();

      expect(slowSignal?.aborted).toBe(true);
      expect(wrapper.text()).toContain('New result');

      resolveSlow?.(ok({ notes: [], total: 0, nextCursor: null }));
      await flushPromises();
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps narrow catalog and context interactions in Sheets while preserving selection behavior', async () => {
    const wrapper = mountWorkspace(createService(), { narrow: true });
    await flushPromises();

    expect(wrapper.find('[data-testid="knowledge-note-catalog"]').exists()).toBe(false);

    await wrapper.get('[data-testid="knowledge-projection-toggle-catalog"]').trigger('click');
    expect(wrapper.get('[data-testid="knowledge-note-catalog"]')).toBeDefined();

    await wrapper.get('[data-testid="knowledge-tree-note-projection-1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="knowledge-note-catalog"]').exists()).toBe(false);

    await wrapper.get('[data-testid="knowledge-projection-context-toggle"]').trigger('click');
    expect(wrapper.get('[data-testid="knowledge-context-stub"]')).toBeDefined();

    await wrapper.get('[data-testid="knowledge-context-close-stub"]').trigger('click');
    expect(wrapper.find('[data-testid="knowledge-context-stub"]').exists()).toBe(false);
  });

  it('keeps content primary and opens links/outline in a contextual side panel', async () => {
    const wrapper = mountWorkspace(createService());
    await flushPromises();

    expect(wrapper.get('[data-testid="knowledge-projection-preview"]')).toBeDefined();
    expect(wrapper.find('[data-testid="knowledge-projection-relations-tab"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="knowledge-context-stub"]').exists()).toBe(false);

    await wrapper.get('[data-testid="knowledge-projection-context-toggle"]').trigger('click');

    expect(wrapper.get('[data-testid="knowledge-projection-context-inline"]')).toBeDefined();
    expect(wrapper.get('[data-testid="knowledge-context-stub"]').text()).toContain('projection-1');

    await wrapper.get('[data-testid="knowledge-context-close-stub"]').trigger('click');
    expect(wrapper.find('[data-testid="knowledge-context-stub"]').exists()).toBe(false);
  });

  it('loads a linked projection outside the current branch and reveals its tree path', async () => {
    const related = projection({
      id: 'projection-related',
      relativePath: 'notes/related.md',
      title: 'Related note',
    });
    const listKnowledgeNoteTree = vi.fn(async (request?: { parent?: string }) =>
      ok({
        parent: request?.parent ?? '',
        nodes:
          request?.parent === 'notes'
            ? [
                treeNote({
                  id: 'projection-related',
                  relativePath: 'notes/related.md',
                  title: 'Related note',
                }),
              ]
            : request?.parent
              ? []
              : [
                  {
                    kind: 'directory' as const,
                    name: 'notes',
                    relativePath: 'notes',
                    noteCount: 1,
                    hasChildren: true as const,
                  },
                  treeNote(),
                ],
        metadata: request?.parent
          ? null
          : {
              total: 2,
              visibleTotal: 2,
              hiddenNoteCount: 0,
              hiddenDirectories: [],
            },
      }),
    );
    const getKnowledgeNoteProjection = vi.fn(async (id: string) =>
      ok(id === 'projection-related' ? related : projection({ id })),
    );
    const wrapper = mountWorkspace(
      createService({ listKnowledgeNoteTree, getKnowledgeNoteProjection }),
    );
    await flushPromises();

    await wrapper.get('[data-testid="knowledge-projection-context-toggle"]').trigger('click');
    await wrapper.get('[data-testid="knowledge-context-select-related"]').trigger('click');
    await flushPromises();

    expect(getKnowledgeNoteProjection).toHaveBeenCalledWith(
      'projection-related',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(listKnowledgeNoteTree).toHaveBeenCalledWith(
      expect.objectContaining({ parent: 'notes' }),
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(wrapper.get('[data-testid="knowledge-tree-note-projection-related"]').text()).toContain(
      'Related note',
    );
  });

  it('reloads summaries for the explicitly selected repository connection', async () => {
    const secondConnection = connection({
      id: SECOND_BINDING_ID,
      repositoryId: 'repository-2',
      repositoryFullNameSnapshot: 'owner/second-knowledge',
      observation: {
        ...connection().observation!,
        bindingId: SECOND_BINDING_ID,
        repositoryFullName: 'owner/second-knowledge',
      },
      historyFence: { ...connection().historyFence!, bindingId: SECOND_BINDING_ID },
      projectionCheckpoint: {
        ...connection().projectionCheckpoint!,
        bindingId: SECOND_BINDING_ID,
      },
    });
    const listKnowledgeNoteTree = vi.fn(
      async (request?: { connectionId?: string; parent?: string }) =>
        ok({
          parent: request?.parent ?? '',
          nodes: request?.parent
            ? []
            : [
                treeNote({
                  id: `projection-${request?.connectionId}`,
                  connectionId: request?.connectionId ?? BINDING_ID,
                  title:
                    request?.connectionId === SECOND_BINDING_ID
                      ? 'Second repository note'
                      : 'Architecture',
                }),
              ],
          metadata: request?.parent
            ? null
            : {
                total: 1,
                visibleTotal: 1,
                hiddenNoteCount: 0,
                hiddenDirectories: ['.git', '.obsidian', 'node_modules', 'generated'],
              },
        }),
    );
    const getKnowledgeNoteProjection = vi.fn(async (id: string) =>
      ok(
        projection({
          id,
          connectionId: id.includes(String(SECOND_BINDING_ID)) ? SECOND_BINDING_ID : BINDING_ID,
          title: id.includes(String(SECOND_BINDING_ID)) ? 'Second repository note' : 'Architecture',
        }),
      ),
    );
    const wrapper = mountWorkspace(
      createService({
        listKnowledgeRepositoryConnections: vi.fn(async () =>
          ok({ connections: [connection(), secondConnection] }),
        ),
        listKnowledgeNoteTree: listKnowledgeNoteTree as never,
        getKnowledgeNoteProjection,
      }),
    );
    await flushPromises();

    wrapper
      .getComponent(KnowledgeNoteCatalog)
      .vm.$emit('connection-change', String(SECOND_BINDING_ID));
    await flushPromises();

    expect(listKnowledgeNoteTree).toHaveBeenCalledWith(
      {
        connectionId: SECOND_BINDING_ID,
        parent: '',
        includeHidden: false,
      },
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(wrapper.text()).toContain('Second repository note');
  });

  it('does not expose a manual Web create-note control', async () => {
    const wrapper = mountWorkspace(createService());
    await flushPromises();

    expect(wrapper.find('[data-testid="knowledge-projection-create"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="knowledge-projection-create-dialog"]').exists()).toBe(false);
  });

  it('confirms an explicit metadata-only stable reference for an unmanaged note', async () => {
    let adoptedRequest: AdoptKnowledgeDocumentReq | undefined;
    const adoptKnowledgeDocument = vi.fn(async (request: AdoptKnowledgeDocumentReq) => {
      adoptedRequest = request;
      return ok({
        requestId: request.requestId,
        knowledgeDocumentId: request.knowledgeDocumentId,
        relativePath: 'notes/architecture.md',
        commitSha: 'e'.repeat(40),
        status: 'Committed' as const,
      });
    });
    const wrapper = mountWorkspace(createService({ adoptKnowledgeDocument }));
    await flushPromises();

    expect(wrapper.get('[data-testid="knowledge-projection-adopt"]').text()).toContain(
      'Create stable reference',
    );
    await wrapper.get('[data-testid="knowledge-projection-adopt"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="knowledge-projection-adopt-document-id"]').text()).toMatch(
      /^memoflow_id: kdoc_[0-9a-f-]{36}$/i,
    );

    await wrapper.get('[data-testid="knowledge-projection-adopt-confirm"]').trigger('click');
    await flushPromises();

    expect(adoptKnowledgeDocument).toHaveBeenCalledOnce();
    expect(adoptedRequest).toMatchObject({
      projectionId: 'projection-1',
      expectedBlobSha: 'c'.repeat(40),
      knowledgeDocumentId: expect.stringMatching(/^kdoc_[0-9a-f-]{36}$/i),
      requestId: expect.stringMatching(/^adopt-/),
    });
  });

  it('shows a concise managed state instead of the raw stable id', async () => {
    const managedId = 'kdoc_550e8400-e29b-41d4-a716-446655440095' as never;
    const managed = projection({ knowledgeDocumentId: managedId });
    const wrapper = mountWorkspace(
      createService({
        listKnowledgeNoteProjections: vi.fn(async () =>
          ok({ notes: [summary({ knowledgeDocumentId: managedId })], total: 1, nextCursor: null }),
        ),
        getKnowledgeNoteProjection: vi.fn(async () => ok(managed)),
      }),
    );
    await flushPromises();

    expect(wrapper.find('[data-testid="knowledge-projection-adopt"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="knowledge-projection-document-id"]').text()).toContain(
      'Stable reference ready',
    );
    expect(wrapper.get('[data-testid="knowledge-projection-document-id"]').text()).not.toContain(
      managedId,
    );
  });
});
