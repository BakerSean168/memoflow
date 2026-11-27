import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AIActivityTimeline from './AIActivityTimeline.vue';
import MemoFlowAiIcon from './MemoFlowAiIcon.vue';
import enAI from '@ai-ui-test-host/locales/en-US/aiAssistant';
import zhAI from '@ai-ui-test-host/locales/zh-CN/aiAssistant';
import { setItemRunTiming } from '../composables/agentActivity';
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

  it('shows live Working timer via shared secondTick and transitions to Worked for without leaking timers', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const timedItem: ChatItem = {
      id: 'timed-live',
      role: 'assistant',
      content: '',
      status: 'generating',
    };
    setItemRunTiming(timedItem, {
      runId: 'run-live',
      startedAt: 10_000,
      completedAt: null,
      pausedDurationMs: 0,
    });
    const wrapper = render(timedItem);
    expect(wrapper.get('[data-testid="ai-agent-phase"]').text()).toBe('Working for 0s');
    await vi.advanceTimersByTimeAsync(3_000);
    expect(wrapper.get('[data-testid="ai-agent-phase"]').text()).toBe('Working for 3s');
    expect(vi.getTimerCount()).toBe(1);

    const settled: ChatItem = { ...timedItem, status: 'success' };
    setItemRunTiming(settled, {
      runId: 'run-live',
      startedAt: 10_000,
      completedAt: 14_200,
      pausedDurationMs: 0,
      terminalObserved: true,
    });
    await wrapper.setProps({ item: settled });
    expect(wrapper.get('[data-testid="ai-agent-phase"]').text()).toBe('Worked for 4.2s');
    expect(vi.getTimerCount()).toBe(0);
    wrapper.unmount();
  });

  it('shares a single timer across multiple mounted working timelines', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    const first: ChatItem = { id: 'w1', role: 'assistant', content: '', status: 'generating' };
    const second: ChatItem = { id: 'w2', role: 'assistant', content: '', status: 'generating' };
    setItemRunTiming(first, {
      runId: 'r1',
      startedAt: 5_000,
      completedAt: null,
      pausedDurationMs: 0,
    });
    setItemRunTiming(second, {
      runId: 'r2',
      startedAt: 2_000,
      completedAt: null,
      pausedDurationMs: 0,
    });

    const w1 = render(first, 'zh-CN');
    const w2 = render(second, 'zh-CN');
    expect(w1.get('[data-testid="ai-agent-phase"]').text()).toBe('已工作 0 秒');
    expect(w2.get('[data-testid="ai-agent-phase"]').text()).toBe('已工作 3 秒');
    expect(vi.getTimerCount()).toBe(1);
    w1.unmount();
    expect(vi.getTimerCount()).toBe(1);
    w2.unmount();
    expect(vi.getTimerCount()).toBe(0);
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
    const toggle = wrapper.get('[data-testid="ai-tool-activity"]');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(toggle.classes().join(' ')).toContain('focus-visible:');
    const history = wrapper.get('[data-testid="ai-agent-history"]');
    expect(history.text()).toContain('search · Failed');
    expect(wrapper.get('[data-testid="ai-agent-recovery"]').text()).toContain('send a new message');

    await wrapper.setProps({
      item: { ...wrapper.props('item'), status: 'success' },
    });
    expect(wrapper.find('[data-testid="ai-tool-activity"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="ai-agent-history"]').text()).toContain(
      'commandExecution · Interrupted',
    );
    expect(wrapper.get('[data-testid="ai-agent-history"]').text()).toContain('search · Failed');
    wrapper.unmount();
  });

  it('renders localized stopped/worked labels and degrades cleanly without fabricated numbers on legacy history', async () => {
    const stoppedItem: ChatItem = {
      id: 'stopped-1',
      role: 'assistant',
      content: '',
      status: 'aborted',
    };
    setItemRunTiming(stoppedItem, {
      runId: 'run-stop',
      startedAt: 1_000,
      completedAt: 4_100,
      pausedDurationMs: 0,
      terminalObserved: true,
    });
    const stopped = render(stoppedItem, 'en-US');
    expect(stopped.get('[data-testid="ai-agent-phase"]').text()).toBe('You stopped after 3.1s');
    stopped.unmount();

    const legacyItem: ChatItem = {
      id: 'legacy-1',
      role: 'assistant',
      content: 'Done',
      status: 'success',
      toolActivities: [{ toolCallId: 't1', toolName: 'knowledge_search', state: 'completed' }],
    };
    const legacy = render(legacyItem, 'en-US');
    expect(legacy.get('[data-testid="ai-agent-phase"]').text()).toBe('Worked');
    expect(legacy.text()).not.toMatch(/\d+(ms|s|m|h)/);
    legacy.unmount();
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
