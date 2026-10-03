import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AIMessagePanel from './AIMessagePanel.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      aiAssistant: {
        dialogs: {
          chat: {
            you: 'You',
            assistant: 'Assistant',
          },
        },
        chatPage: {
          welcomeTitle: 'What do you want to move forward today?',
          welcomeDescription: 'Pick a shortcut card.',
          noModel: {
            title: 'Start without AI',
            description: 'Create a goal or task now, or configure AI.',
            configure: 'Configure AI',
            createGoal: 'Create goal',
            quickTask: 'Quick task',
          },
          emptyTitle: 'Start',
          emptyDescription: 'Describe',
          context: { todayOverview: 'Today' },
          message: { copy: 'Copy', copied: 'Copied' },
          toolIntro: {
            goalCreate: { title: 'Goal mode', description: 'Goal desc' },
            taskCreate: { title: 'Task mode', description: 'Task desc' },
            knowledgeQa: { title: 'QA mode', description: 'QA desc' },
            knowledgeCapture: { title: 'Note mode', description: 'Note desc' },
          },
          shortcuts: {
            chat: { title: 'Just chat', description: 'Chat desc', prefill: 'chat prefill' },
            goalCreate: {
              title: 'Plan a goal',
              description: 'Goal shortcut',
              prefill: 'goal prefill',
            },
            taskCreate: {
              title: 'Create a task',
              description: 'Task shortcut',
              prefill: 'task prefill',
            },
            knowledgeCapture: {
              title: 'Write a note',
              description: 'Note shortcut',
              prefill: 'note prefill',
            },
            knowledgeQa: { title: 'Ask KB', description: 'QA shortcut', prefill: 'qa prefill' },
          },
        },
      },
    },
  },
});

describe('AIMessagePanel (V2 §6.0 welcome)', () => {
  it('renders compact workflow shortcuts without owning the shell today overview', () => {
    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [],
        toolMode: 'chat',
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-testid="ai-welcome-state"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('What do you want to move forward today?');
    expect(wrapper.find('[data-testid="ai-welcome-entry-chat"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-welcome-entry-goal-create"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-welcome-entry-task-create"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-welcome-entry-knowledge-capture"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-welcome-entry-knowledge-qa"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-today-overview"]').exists()).toBe(false);
  });

  it('hides today overview once messages exist and emits select-shortcut', async () => {
    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [{ id: 'm1', role: 'user', content: 'hello' }],
        toolMode: 'chat',
        showWorkflowSurface: false,
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-testid="ai-welcome-state"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-today-overview"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('hello');
  });

  it('renders attachment-only user turns without synthetic placeholder text', () => {
    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [
          {
            id: 'm-file',
            role: 'user',
            content: '',
            status: 'success',
            attachments: [{ mediaType: 'image/png', filename: 'screen.png' }],
          },
        ],
        toolMode: 'chat',
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-testid="ai-message-attachment"]').text()).toContain('screen.png');
    expect(wrapper.text()).not.toContain('undefined');
    expect(wrapper.find('[data-testid="ai-welcome-state"]').exists()).toBe(false);
  });

  it('emits select-shortcut from welcome cards', async () => {
    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [],
        toolMode: 'chat',
      },
      global: { plugins: [i18n] },
    });

    await wrapper.get('[data-testid="ai-welcome-entry-goal-create"]').trigger('click');
    expect(wrapper.emitted('select-shortcut')?.[0]).toEqual(['goal-create']);
  });

  it('offers configure AI and direct product actions when no model is available', async () => {
    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [],
        toolMode: 'chat',
        hasModels: false,
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-testid="ai-welcome-entry-chat"]').exists()).toBe(false);
    await wrapper.get('[data-testid="ai-welcome-configure-ai"]').trigger('click');
    await wrapper.get('[data-testid="ai-welcome-create-goal"]').trigger('click');
    await wrapper.get('[data-testid="ai-welcome-quick-task"]').trigger('click');

    expect(wrapper.emitted('configure-ai')).toHaveLength(1);
    expect(wrapper.emitted('create-goal')).toHaveLength(1);
    expect(wrapper.emitted('quick-task')).toHaveLength(1);
  });

  it('renders assistant Markdown and exposes a quiet copy action', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [
          {
            id: 'm-assistant',
            role: 'assistant',
            content: '## Result\n\n- one\n- two',
            status: 'success',
          },
        ],
        toolMode: 'chat',
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.get('[data-testid="ai-message-markdown"] h2').text()).toBe('Result');
    expect(wrapper.findAll('[data-testid="ai-message-markdown"] li')).toHaveLength(2);
    await wrapper.get('[data-testid="ai-message-copy"]').trigger('click');
    expect(writeText).toHaveBeenCalledWith('## Result\n\n- one\n- two');
  });

  it('shows workflow surface slot when requested', () => {
    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [{ id: 'm1', role: 'user', content: 'plan a goal' }],
        toolMode: 'goal-create',
        showWorkflowSurface: true,
      },
      slots: {
        'workflow-surface': '<div data-testid="wf-slot">status</div>',
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-testid="ai-workflow-message-surface"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="wf-slot"]').exists()).toBe(true);
  });
});
