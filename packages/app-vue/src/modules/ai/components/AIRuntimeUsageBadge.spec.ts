import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AIRuntimeUsageBadge from './AIRuntimeUsageBadge.vue';

describe('AIRuntimeUsageBadge', () => {
  it('renders cumulative token and cost usage compactly', () => {
    const wrapper = mount(AIRuntimeUsageBadge, {
      props: {
        usage: {
          promptTokens: 1200,
          completionTokens: 300,
          totalTokens: 1500,
          estimatedCost: 0.00045,
        },
      },
    });
    expect(wrapper.get('[data-testid="ai-runtime-usage"]').text()).toContain('1,500 tok');
    expect(wrapper.text()).toContain('$0.000450');
    expect(wrapper.attributes('title')).toContain('input 1200');
    expect(wrapper.attributes('title')).toContain('output 300');
  });

  it('stays hidden when no usage is available', () => {
    expect(mount(AIRuntimeUsageBadge).find('[data-testid="ai-runtime-usage"]').exists()).toBe(
      false,
    );
  });
});
