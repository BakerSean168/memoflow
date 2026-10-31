import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
/** @vitest-environment jsdom */
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
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

it.each([
  ['ai-permission-allow-once', 'approve_once'],
  ['ai-permission-allow-conversation', 'approve_conversation'],
  ['ai-permission-allow-always', 'approve_always'],
  ['ai-permission-deny', 'decline'],
] as const)('business card %s sends the scoped decision %s', async (testId, decision) => {
  const wrapper = mountCard({
    type: 'permission',
    requestId: 'business',
    title: 'MemoFlow: goal_panel_submit',
    business: {
      agentId: 'Codex',
      object: 'goal',
      action: 'create',
      expiresAt: Date.now() + 25_000,
    },
  });
  expect(wrapper.get('[data-testid="ai-business-permission-scope"]').text()).toContain(
    'Codex 新增目标',
  );
  expect(wrapper.get('[data-testid="ai-business-permission-scope"]').text()).toContain(
    '设置 → AI 权限 撤销',
  );
  expect(wrapper.get('[data-testid="ai-business-permission-countdown"]').text()).toContain('25');
  await wrapper.get(`[data-testid="${testId}"]`).trigger('click');
  expect(wrapper.emitted('respond')?.[0]).toEqual([{ type: 'permission', decision }]);
  wrapper.unmount();
});

it('mirrors the scope in an open Goal form and disables approvals when its deadline expires', async () => {
  vi.useFakeTimers();
  const target = document.createElement('div');
  target.id = 'goal-ai-permission-notice';
  document.body.append(target);
  const wrapper = mountCard({
    type: 'permission',
    requestId: 'deadline',
    title: 'MemoFlow save',
    business: { agentId: 'Codex', object: 'goal', action: 'create', expiresAt: Date.now() + 1000 },
  });
  try {
    await import('vue').then(({ nextTick }) => nextTick());
    expect(target.textContent).toContain('设置 → AI 权限 撤销');
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.get('[data-testid="ai-business-permission-countdown"]').text()).toContain('0');
    expect(
      wrapper.get('[data-testid="ai-permission-allow-always"]').attributes('disabled'),
    ).toBeDefined();
  } finally {
    wrapper.unmount();
    target.remove();
    vi.useRealTimers();
  }
});
