import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DocumentCatalogRow from './DocumentCatalogRow.vue';
import DocumentCatalogSearch from './DocumentCatalogSearch.vue';
import DocumentSourceStatus from './DocumentSourceStatus.vue';
import DocumentWorkspaceState from './DocumentWorkspaceState.vue';
import DocumentWorkspaceToolbar from './DocumentWorkspaceToolbar.vue';

const componentsRoot = resolve(__dirname);

describe('document presentation primitives', () => {
  it('keeps document workspace toolbar slots in a single compact header', () => {
    const wrapper = mount(DocumentWorkspaceToolbar, {
      slots: {
        leading: '<button data-testid="leading">catalog</button>',
        default: '<span data-testid="content">note.md</span>',
        actions: '<button data-testid="action">more</button>',
      },
    });

    expect(wrapper.get('[data-testid="document-workspace-toolbar"]').classes()).toContain(
      'min-h-11',
    );
    expect(wrapper.get('[data-testid="leading"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="content"]').text()).toBe('note.md');
    expect(wrapper.get('[data-testid="action"]').exists()).toBe(true);
  });

  it('normalizes catalog search submit, clear, and model updates', async () => {
    const wrapper = mount(DocumentCatalogSearch, {
      props: {
        modelValue: 'architecture',
        placeholder: 'Search notes',
        clearLabel: 'Clear',
        testId: 'catalog-search',
      },
    });

    const input = wrapper.get('[data-testid="catalog-search"]');
    expect(input.attributes('type')).toBe('text');

    await input.setValue('runtime');
    expect(wrapper.emitted('update:modelValue')).toEqual([['runtime']]);

    await input.trigger('keyup', { key: 'Enter' });
    expect(wrapper.emitted('submit')).toHaveLength(1);

    await wrapper.get('[data-testid="catalog-search-clear"]').trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
  });

  it('exposes selected catalog rows as the same direct-manipulation button grammar', async () => {
    const wrapper = mount(DocumentCatalogRow, {
      props: { selected: true },
      slots: {
        default: 'Architecture',
        meta: 'notes/architecture.md',
      },
    });

    const row = wrapper.get('[data-testid="document-catalog-row"]');
    expect(row.attributes('aria-current')).toBe('true');
    expect(row.text()).toContain('Architecture');
    expect(row.text()).toContain('notes/architecture.md');

    await row.trigger('click');
    expect(wrapper.emitted('activate')).toHaveLength(1);
  });

  it('provides explicit loading, error, and empty workspace semantics', () => {
    const loading = mount(DocumentWorkspaceState, {
      props: { kind: 'loading', title: 'Loading' },
    });
    expect(loading.get('[data-testid="document-workspace-state"]').attributes('aria-busy')).toBe(
      'true',
    );

    const error = mount(DocumentWorkspaceState, {
      props: { kind: 'error', title: 'Unable to load' },
    });
    expect(error.get('[data-testid="document-workspace-state"]').attributes('role')).toBe('alert');

    const empty = mount(DocumentWorkspaceState, {
      props: { kind: 'empty', title: 'No notes' },
    });
    expect(empty.text()).toContain('No notes');
  });

  it('keeps the Knowledge catalog on shared document grammar and the standard selector', () => {
    const catalog = readFileSync(resolve(componentsRoot, 'KnowledgeNoteCatalog.vue'), 'utf8');

    expect(catalog).toContain('<DocumentSourceStatus');
    expect(catalog).toContain('<DocumentCatalogSearch');
    expect(catalog).toContain('<DocumentCatalogRow');
    expect(catalog).toContain('<DocumentWorkspaceState');
    expect(catalog).toContain('<Select');
    expect(catalog).toContain('SelectTrigger');
    expect(catalog).toContain('status-test-id="knowledge-projection-provider-warning"');
    expect(catalog).toContain('syncing-test-id="knowledge-projection-syncing-badge"');
    expect(catalog).not.toContain('<select');
  });

  it('keeps source identity, status, sync state, and actions in one presentation block', () => {
    const wrapper = mount(DocumentSourceStatus, {
      props: {
        title: 'thought-forest',
        subtitle: 'owner/thought-forest · main',
        countLabel: '3,648',
        statusLabel: 'Needs attention',
        statusTone: 'warning',
        syncing: true,
        syncingLabel: 'Syncing repository',
      },
      slots: {
        actions: '<button data-testid="source-action">refresh</button>',
      },
    });

    expect(wrapper.text()).toContain('thought-forest');
    expect(wrapper.text()).toContain('owner/thought-forest · main');
    expect(wrapper.text()).toContain('3,648');
    expect(wrapper.get('[data-testid="document-source-status-label"]').text()).toContain(
      'Needs attention',
    );
    const syncing = wrapper.get('[data-testid="document-source-syncing"]');
    expect(syncing.exists()).toBe(true);
    expect(syncing.attributes('title')).toBe('Syncing repository');
    expect(syncing.attributes('aria-label')).toBe('Syncing repository');
    expect(wrapper.get('[data-testid="source-action"]').exists()).toBe(true);
  });
});
