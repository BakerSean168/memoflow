import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import KnowledgeMarkdownPreview from './KnowledgeMarkdownPreview.vue';

describe('KnowledgeMarkdownPreview', () => {
  it('suppresses a duplicate leading H1 when the document header already owns the title', () => {
    const wrapper = mount(KnowledgeMarkdownPreview, {
      props: {
        title: 'Zyte Scrapy Cloud',
        markdown:
          '---\ntitle: Zyte Scrapy Cloud\n---\n\n# Zyte Scrapy Cloud\n\n## Summary\n\nBody',
      },
    });

    const preview = wrapper.get('[data-testid="knowledge-markdown-preview"]');
    expect(preview.find('h1').exists()).toBe(false);
    expect(preview.find('h2').text()).toBe('Summary');
    expect(preview.text()).toContain('Body');
  });

  it('keeps a distinct leading H1', () => {
    const wrapper = mount(KnowledgeMarkdownPreview, {
      props: {
        title: 'File title',
        markdown: '# Editorial heading\n\nBody',
      },
    });

    expect(wrapper.get('h1').text()).toBe('Editorial heading');
  });
});
