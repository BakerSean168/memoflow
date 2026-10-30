import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
/** @vitest-environment jsdom */
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { productionLocaleMessages } from '@ai-ui-test-host/locales/production-messages';
import AILocalRequestCard from './AILocalRequestCard.vue';
import type { ChatNativeRequest } from '../composables/types';

function mountCard(request: ChatNativeRequest['request']) {
  return mount(AILocalRequestCard, {
    props: {
      request: { request, conversationId: 'c', runId: 'r', status: 'pending' },
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'zh-CN', messages: productionLocaleMessages })],
    },
  });
}

describe('AILocalRequestCard', () => {
  it('labels native permission prompts and shows the Provider reason and scope', async () => {
    const wrapper = mountCard({
      type: 'permission',
      requestId: 'p1',
      title: 'npm test',
      reason: 'Run the unit tests',
      scope: 'execute · /repo',
    });
    expect(wrapper.get('[data-testid="ai-native-permission-kind"]').text()).toContain(
      '原生 Agent 权限',
    );
    expect(wrapper.get('[data-testid="ai-native-permission-reason"]').text()).toContain(
      'Run the unit tests',
    );
    expect(wrapper.get('[data-testid="ai-native-permission-scope"]').text()).toContain(
      'execute · /repo',
    );
    await wrapper.findAll('button')[1]!.trigger('click');
    expect(wrapper.emitted('respond')?.[0]).toEqual([{ type: 'permission', decision: 'decline' }]);
  });

  it('omits reason and scope when the Provider does not report them, and never labels questions as permissions', () => {
    const permission = mountCard({ type: 'permission', requestId: 'p2', title: 'Edit file' });
    expect(permission.find('[data-testid="ai-native-permission-reason"]').exists()).toBe(false);
    expect(permission.find('[data-testid="ai-native-permission-scope"]').exists()).toBe(false);
    const question = mountCard({
      type: 'user_input',
      requestId: 'q1',
      questions: [{ id: 'q', prompt: 'Which branch?', options: ['main'] }],
    });
    expect(question.find('[data-testid="ai-native-permission-kind"]').exists()).toBe(false);
  });
});
