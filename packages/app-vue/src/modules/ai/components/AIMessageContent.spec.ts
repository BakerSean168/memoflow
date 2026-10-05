import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import AIMessageContent from './AIMessageContent.vue';

describe('AIMessageContent', () => {
  it('renders assistant markdown as readable structured content', () => {
    const wrapper = mount(AIMessageContent, {
      props: { content: '## Plan\n\n- First\n- Second\n\n`pnpm test`' },
    });

    expect(wrapper.get('[data-testid="ai-message-markdown"] h2').text()).toBe('Plan');
    expect(wrapper.findAll('[data-testid="ai-message-markdown"] li')).toHaveLength(2);
    expect(wrapper.get('[data-testid="ai-message-markdown"] code').text()).toBe('pnpm test');
  });

  it('throttles Markdown work while generating and flushes terminal content immediately', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mount(AIMessageContent, {
        props: { content: '# Start', generating: true },
      });

      await wrapper.setProps({ content: '## Streaming', generating: true });
      expect(wrapper.find('h1').text()).toBe('Start');
      expect(wrapper.find('h2').exists()).toBe(false);

      await vi.advanceTimersByTimeAsync(120);
      expect(wrapper.get('h2').text()).toBe('Streaming');

      await wrapper.setProps({ content: '## Final\n\n**done**', generating: false });
      expect(wrapper.get('h2').text()).toBe('Final');
      expect(wrapper.get('strong').text()).toBe('done');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not execute or preserve raw html from assistant output', () => {
    const wrapper = mount(AIMessageContent, {
      props: { content: '<script>alert(1)</script> **safe** [bad](javascript:alert(1))' },
    });

    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.get('[data-testid="ai-message-markdown"] strong').text()).toBe('safe');
    expect(wrapper.find('a').exists()).toBe(false);
  });
});
