import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import type { KnowledgeNoteProjectionClientDTO } from '@memoflow/contracts/repository';
import KnowledgeNoteContextPanel from './KnowledgeNoteContextPanel.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { close: 'Close' },
      repository: {
        projection: {
          contextTitle: 'Context',
          outlineTitle: 'Outline',
          noOutline: 'No outline',
          linksTitle: 'Links',
          metadataTitle: 'Info',
          notePath: 'Path',
          commitLabel: 'Commit',
          updatedLabel: 'Updated',
          stableReferenceLabel: 'Stable reference',
          stableReferenceReady: 'Stable reference ready',
          stableReferenceMissing: 'Not created',
        },
      },
    },
  },
});

const RelationsStub = defineComponent({
  props: {
    projectionId: { type: String, required: true },
    compact: { type: Boolean, default: false },
  },
  emits: ['select'],
  setup(props) {
    return () =>
      h(
        'div',
        { 'data-testid': 'relations-stub' },
        String(props.projectionId) + ':' + String(props.compact),
      );
  },
});

function note(): KnowledgeNoteProjectionClientDTO {
  return {
    id: 'projection-1',
    connectionId: 'connection-1' as never,
    knowledgeDocumentId: null,
    relativePath: 'z/zyte.md',
    title: 'Zyte Scrapy Cloud',
    commitSha: 'a'.repeat(40),
    blobSha: 'b'.repeat(40),
    contentHash: 'c'.repeat(64),
    frontmatter: {},
    markdownContent:
      '---\ntitle: Zyte Scrapy Cloud\n---\n\n# Zyte Scrapy Cloud\n\n## Summary\n\n### Details\n\nBody',
    createdAt: 1,
    updatedAt: Date.UTC(2026, 8, 28),
    deletedAt: null,
  };
}

describe('KnowledgeNoteContextPanel', () => {
  it('shows outline, links, and metadata without repeating the document H1', () => {
    const wrapper = mount(KnowledgeNoteContextPanel, {
      props: { note: note() },
      global: {
        plugins: [i18n],
        stubs: {
          Badge: defineComponent({
            setup(_, { slots }) {
              return () => h('span', slots.default?.());
            },
          }),
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h('button', attrs, slots.default?.());
            },
          }),
          Info: true,
          Link2: true,
          ListTree: true,
          PanelRight: true,
          X: true,
          KnowledgeProjectionRelationsView: RelationsStub,
        },
      },
    });

    expect(wrapper.text()).toContain('Summary');
    expect(wrapper.text()).toContain('Details');
    expect(wrapper.text()).not.toContain('Zyte Scrapy CloudZyte Scrapy Cloud');
    expect(wrapper.get('[data-testid="relations-stub"]').text()).toBe('projection-1:true');
    expect(wrapper.text()).toContain('z/zyte.md');
    expect(wrapper.text()).toContain('Not created');
  });
});
