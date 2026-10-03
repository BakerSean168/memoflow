import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AIContextPanel from './AIContextPanel.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      aiAssistant: {
        chatPage: {
          workbench: { title: 'Workbench', hide: 'Hide workbench' },
        },
      },
    },
  },
});

describe('AIContextPanel', () => {
  it('presents structured workflow artifacts as a workbench rather than generic context', () => {
    const wrapper = mount(AIContextPanel, {
      props: { hasWorkflowContext: true, open: true, toolLabel: 'Goal planning' },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('Workbench');
    expect(wrapper.text()).toContain('Goal planning');
  });
});
