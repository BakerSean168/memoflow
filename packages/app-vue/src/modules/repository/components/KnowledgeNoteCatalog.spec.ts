import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import type { KnowledgeRemoteBindingClientDTO } from '@memoflow/contracts/repository';
import KnowledgeNoteCatalog from './KnowledgeNoteCatalog.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { clear: 'Clear', close: 'Close' },
      repository: {
        projection: {
          refresh: 'Refresh repository',
          syncing: 'Syncing repository',
          syncingDescription: 'Syncing',
          connectionLabel: 'Repository connection',
          searchPlaceholder: 'Search notes…',
          noSearchResults: 'No search results',
          noNotes: 'No notes',
          loadMore: 'Load more',
          hiddenDirectories: 'Hidden directories',
          showHiddenDirectories: 'Show hidden directories',
          hiddenNoteCount: '{count} notes hidden',
        },
      },
    },
  },
});

const connection = {
  id: 'connection-1',
  repositoryFullNameSnapshot: 'BakerSean168/thought-forest',
  observation: {
    repositoryFullName: 'BakerSean168/thought-forest',
  },
} as KnowledgeRemoteBindingClientDTO;

describe('KnowledgeNoteCatalog', () => {
  it('keeps repository context above search and renders only one explicit search clear control', async () => {
    const wrapper = mount(KnowledgeNoteCatalog, {
      props: {
        notes: [],
        treeChildren: {},
        expandedDirectories: [],
        loadingDirectories: [],
        selectedNoteId: '',
        searchQuery: '测',
        loadedCountLabel: '0 of 0 loaded',
        nextCursor: null,
        loading: false,
        loadingMore: false,
        treeLoading: false,
        syncing: false,
        refreshing: false,
        repositoryName: 'thought-forest',
        repositoryDisplayName: 'BakerSean168/thought-forest',
        defaultBranch: 'main',
        noteCountLabel: '3,648',
        providerNeedsAttention: false,
        providerWarningLabel: '',
        connections: [connection],
        selectedConnectionId: 'connection-1',
        hiddenDirectories: ['.*', 'node_modules', 'generated'],
        hiddenNoteCount: 171,
        includeHidden: false,
        closable: true,
      },
      global: {
        plugins: [i18n],
        stubs: {
          DropdownMenu: { template: '<div><slot /></div>' },
          DropdownMenuTrigger: { template: '<div><slot /></div>' },
          DropdownMenuContent: { template: '<div><slot /></div>' },
          DropdownMenuCheckboxItem: { template: '<button><slot /></button>' },
          DropdownMenuLabel: { template: '<div><slot /></div>' },
          DropdownMenuSeparator: true,
        },
      },
    });

    const repositoryHeader = wrapper.get('[data-testid="knowledge-catalog-repository"]');
    expect(repositoryHeader.text()).toContain('thought-forest');
    expect(repositoryHeader.text()).toContain('BakerSean168/thought-forest');
    expect(repositoryHeader.text()).toContain('main');
    expect(repositoryHeader.text()).toContain('3,648');

    const search = wrapper.get('[data-testid="knowledge-projection-search"]');
    expect(search.attributes('type')).toBe('text');
    expect(wrapper.findAll('[data-testid="knowledge-projection-search-clear"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="knowledge-catalog-close"]')).toHaveLength(1);

    await wrapper.get('[data-testid="knowledge-projection-search-clear"]').trigger('click');
    expect(wrapper.emitted('clear-search')).toHaveLength(1);
  });

  it('renders an Obsidian-style folder tree and keeps full paths out of normal browse rows', async () => {
    const wrapper = mount(KnowledgeNoteCatalog, {
      props: {
        notes: [],
        treeChildren: {
          '': [
            {
              kind: 'directory',
              name: 'assets',
              relativePath: 'assets',
              noteCount: 92,
              hasChildren: true,
            },
            {
              kind: 'note',
              name: 'AGENTS',
              title: 'AGENTS',
              relativePath: 'AGENTS.md',
              projectionId: 'projection-root',
              knowledgeDocumentId: null,
              contentHash: 'a'.repeat(64),
              updatedAt: 1,
            },
          ],
        },
        expandedDirectories: [],
        loadingDirectories: [],
        selectedNoteId: 'projection-root',
        searchQuery: '',
        loadedCountLabel: '',
        nextCursor: null,
        loading: false,
        loadingMore: false,
        treeLoading: false,
        syncing: false,
        refreshing: false,
        repositoryName: 'thought-forest',
        repositoryDisplayName: 'BakerSean168/thought-forest',
        defaultBranch: 'main',
        noteCountLabel: '3,648',
        providerNeedsAttention: false,
        providerWarningLabel: '',
        connections: [connection],
        selectedConnectionId: 'connection-1',
        hiddenDirectories: ['.git', '.obsidian', 'node_modules', 'generated'],
        hiddenNoteCount: 171,
        includeHidden: false,
      },
      global: {
        plugins: [i18n],
        stubs: {
          DropdownMenu: { template: '<div><slot /></div>' },
          DropdownMenuTrigger: { template: '<div><slot /></div>' },
          DropdownMenuContent: { template: '<div><slot /></div>' },
          DropdownMenuCheckboxItem: { template: '<button><slot /></button>' },
          DropdownMenuLabel: { template: '<div><slot /></div>' },
          DropdownMenuSeparator: true,
        },
      },
    });

    expect(wrapper.get('[data-testid="knowledge-file-tree"]').text()).toContain('assets');
    expect(wrapper.get('[data-testid="knowledge-file-tree"]').text()).toContain('92');
    expect(wrapper.get('[data-testid="knowledge-tree-note-projection-root"]').text()).toBe('AGENTS');
    expect(wrapper.get('[data-testid="knowledge-file-tree"]').text()).not.toContain('AGENTS.md');
    expect(wrapper.get('[data-testid="knowledge-tree-hidden-menu"]')).toBeDefined();

    await wrapper.get('[data-testid="knowledge-tree-directory-assets"]').trigger('click');
    expect(wrapper.emitted('toggle-directory')).toEqual([['assets']]);
  });
});
