import { describe, expect, it } from 'vitest';
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

  it('does not execute or preserve raw html from assistant output', () => {
    const wrapper = mount(AIMessageContent, {
      props: { content: '<script>alert(1)</script> **safe** [bad](javascript:alert(1))' },
    });

    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.get('[data-testid="ai-message-markdown"] strong').text()).toBe('safe');
    expect(wrapper.find('a').exists()).toBe(false);
  });
});
