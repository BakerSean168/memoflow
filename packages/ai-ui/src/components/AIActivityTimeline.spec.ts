import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AIActivityTimeline from './AIActivityTimeline.vue';
import MemoFlowAiIcon from './MemoFlowAiIcon.vue';
import enAI from '@ai-ui-test-host/locales/en-US/aiAssistant';
import zhAI from '@ai-ui-test-host/locales/zh-CN/aiAssistant';
import type { ChatItem } from '../composables/types';

const item: ChatItem = {
  id: 'a',
  role: 'assistant',
  content: '',
  status: 'generating',
  activityUpdatedAt: 1000,
};
function render(timelineItem = item, locale = 'en-US') {
  return mount(AIActivityTimeline, {
    props: { item: timelineItem },
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale,
          messages: {
            'en-US': { aiAssistant: enAI },
            'zh-CN': { aiAssistant: zhAI },
          },
        }),
      ],
    },
  });
}
afterEach(() => vi.useRealTimers());

describe('AIActivityTimeline', () => {
  it('shows honest processing, silence thresholds and stops its clock after interruption', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const wrapper = render();
    expect(wrapper.get('[role="status"]').text()).toBe('Processing');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(wrapper.text()).toContain('No new events for 30 seconds');
    await vi.advanceTimersByTimeAsync(90_000);
    expect(wrapper.text()).toContain('You can stop this run');
    await wrapper.setProps({ item: { ...item, status: 'interrupted' } });
    expect(wrapper.text()).toContain('Interrupted');
    expect(wrapper.text()).not.toContain('No new events');
    expect(vi.getTimerCount()).toBe(0);
    wrapper.unmount();
  });

  it('shows concurrent tools, opens failures for inspection and retains actual results on replay', async () => {
    const wrapper = render({
      ...item,
      nativeActivities: [
        { toolCallId: '1', label: 'commandExecution', state: 'running' },
        { toolCallId: '2', label: 'search', state: 'failed' },
      ],
    });
    expect(wrapper.get('[data-testid="ai-tool-activity"]').text()).toContain(
      'commandExecution · Running',
    );
    const history = wrapper.get('details');
    expect(history.attributes()).toHaveProperty('open');
    expect(history.get('summary').classes().join(' ')).toContain('focus-visible:');
    expect(history.text()).toContain('search · Failed');
    expect(wrapper.get('[data-testid="ai-agent-recovery"]').text()).toContain('send a new message');
    await wrapper.setProps({
      item: { ...wrapper.props('item'), status: 'success' },
    });
    expect(wrapper.find('[data-testid="ai-tool-activity"]').exists()).toBe(false);
    expect(history.text()).toContain('commandExecution · Interrupted');
    expect(history.text()).toContain('search · Failed');
    wrapper.unmount();
  });

  it('renders localized paused instructions and an accessible bounded history', () => {
    const wrapper = render(
      {
        ...item,
        askUserRequests: [
          {
            toolCallId: 'q',
            question: 'Choose',
            conversationId: 'c',
            runId: 'r',
            status: 'pending',
          },
        ],
      },
      'zh-CN',
    );
    expect(wrapper.get('[role="status"]').text()).toBe('等待你的操作');
    expect(wrapper.text()).toContain('请使用下方的回答或授权控件继续');
    wrapper.unmount();
  });

  it('uses the optional SVG beam animation only while active and hides decoration from screen readers', async () => {
    const wrapper = mount(MemoFlowAiIcon, { props: { active: true } });
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.find('.memoflow-ai-incoming').exists()).toBe(true);
    expect(wrapper.find('.memoflow-ai-outgoing').attributes('d')).toBe('M12 12H24');
    await wrapper.setProps({ active: false });
    expect(wrapper.find('.memoflow-ai-beams').exists()).toBe(false);
  });
});
