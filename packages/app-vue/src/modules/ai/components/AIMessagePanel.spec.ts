import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AIMessagePanel from './AIMessagePanel.vue';
import { semanticElevationClass } from '../../../shared/constants/semantic-elevation';
import enAI from '../../../locales/en-US/aiAssistant';
import zhAI from '../../../locales/zh-CN/aiAssistant';

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
          local: {
            pending: 'Waiting',
            sending: 'Sending',
            answered: 'Answered',
            expired: 'Expired',
            answer: 'Send answer',
            chooseAnswer: 'Choose answer',
            cancel: 'Cancel',
          },
          tools: {
            approvalTitle: 'Tool approval',
            pending: 'Waiting for your decision',
            sending: 'Sending decision…',
            impact: 'This action can change workspace data.',
            approve: 'Approve',
            decline: 'Decline',
            capabilities: {
              knowledge_search: 'Searching knowledge',
              routine_create: 'Create a routine',
            },
          },
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
  it('renders failed tool history and omits empty internal assistant bubbles', () => {
    const wrapper = mount(AIMessagePanel, {
      props: {
        toolMode: 'chat',
        timeline: [
          { id: 'empty', role: 'assistant', status: 'success', content: '' },
          {
            id: 'tool',
            role: 'assistant',
            status: 'error',
            content: '',
            toolActivities: [{ toolCallId: 'call', toolName: 'routine_create', state: 'failed' }],
          },
        ],
      },
      global: { plugins: [i18n] },
    });
    expect(wrapper.findAll('article')).toHaveLength(1);
    expect(wrapper.get('[data-testid="ai-tool-history"]').text()).toContain('Create a routine');
  });
  it('keeps workflow recovery reachable inside the conversation', () => {
    const wrapper = mount(AIMessagePanel, {
      props: { toolMode: 'knowledge-qa', timeline: [] },
      slots: { 'workflow-context': '<button data-testid="recover-workflow">Retry</button>' },
      global: { plugins: [i18n] },
    });
    expect(
      wrapper.get('[data-testid="ai-message-panel"] button[data-testid="recover-workflow"]').text(),
    ).toBe('Retry');
  });
  it('renders a localized interruption once with muted status and no send-failure alert', async () => {
    const locale = createI18n({
      legacy: false,
      locale: 'en-US',
      messages: {
        'en-US': { aiAssistant: enAI },
        'zh-CN': { aiAssistant: zhAI },
      },
    });
    const wrapper = mount(AIMessagePanel, {
      props: {
        toolMode: 'goal-create',
        timeline: [
          {
            id: 'run-status',
            role: 'assistant',
            status: 'interrupted',
            content: 'An interrupted request',
            workflowInterruption: {
              draftPreserved: true,
              failure: {
                code: 'RATE_LIMITED',
                message: 'PRIVATE_BODY',
                details: { limitKind: 'quota_exhausted' },
                retryHint: { kind: 'after', afterMs: 30000 },
              },
            },
          },
        ],
      },
      global: { plugins: [locale] },
    });
    expect(wrapper.findAll('[data-testid="ai-workflow-interruption"]')).toHaveLength(1);
    const status = wrapper.get('[data-testid="ai-workflow-interruption"]');
    expect(status.attributes('role')).toBe('status');
    expect(status.classes()).toContain('text-muted-foreground');
    expect(status.text()).toContain('insufficient quota');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('PRIVATE_BODY');
    locale.global.locale.value = 'zh-CN';
    await wrapper.vm.$nextTick();
    expect(status.text()).toContain('配额不足');
    expect(status.text()).toContain('草稿已保留');
    wrapper.unmount();
  });
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
    expect(
      wrapper.find('[data-testid="ai-welcome-state"] [data-testid="memoflow-ai-icon"]').exists(),
    ).toBe(true);
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

  it('uses raised user messages and inset assistant avatars', () => {
    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [
          { id: 'user-1', role: 'user', content: 'Hello' },
          { id: 'assistant-1', role: 'assistant', content: 'Hi' },
        ],
        toolMode: 'chat',
      },
      global: { plugins: [i18n] },
    });
    const messages = wrapper.findAll('article');
    expect(messages[0].get('div').classes()).toContain(semanticElevationClass('raised'));
    expect(messages[1].get('[aria-hidden="true"]').classes()).toContain(
      semanticElevationClass('inset'),
    );
    expect(messages[1].find('[data-testid="memoflow-ai-icon"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders an Ask User prompt with selection and answer/cancel actions', async () => {
    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [
          {
            id: 'assistant-ask',
            role: 'assistant',
            content: '',
            status: 'generating',
            askUserRequests: [
              {
                toolCallId: 'ask-1',
                runId: 'run-1',
                conversationId: 'conversation-1',
                question: 'Choose a target',
                options: [{ label: 'Near term' }, { label: 'Long term' }],
                selectionMode: 'single_select',
                status: 'pending',
              },
            ],
          },
        ],
        toolMode: 'chat',
      },
      global: { plugins: [i18n] },
    });
    expect(wrapper.get('[data-testid="ai-ask-user-request"]').text()).toContain('Choose a target');
    await wrapper.get('select').setValue('Long term');
    await wrapper.get('[data-testid="ai-ask-user-submit"]').trigger('submit');
    expect(wrapper.emitted('ask-user-answer')?.[0]).toMatchObject([
      { toolCallId: 'ask-1' },
      'Long term',
    ]);
    await wrapper.get('[data-testid="ai-ask-user-cancel"]').trigger('click');
    expect(wrapper.emitted('ask-user-cancel')?.[0]).toMatchObject([{ toolCallId: 'ask-1' }]);
    wrapper.unmount();
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
    const copy = wrapper.get('[data-testid="ai-message-copy"]');
    expect(copy.classes()).toContain('h-8');
    await copy.trigger('click');
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

describe('Assistant inline tool decisions', () => {
  it('renders quiet static read activity and native accessible approval buttons with retry error', async () => {
    const approval = {
      toolCallId: 'w',
      toolName: 'routine_create' as const,
      category: 'edit' as const,
      risk: 'high' as const,
      conversationId: 'c',
      runId: 'r',
      status: 'pending' as const,
      errorMessage: 'Try again',
    };
    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [
          {
            id: 'a',
            role: 'assistant',
            content: '',
            status: 'generating',
            toolActivity: {
              activityType: 'tool',
              toolCallId: 'read',
              toolName: 'knowledge_search',
              category: 'read',
              risk: 'low',
              state: 'running',
            },
            approvals: [approval],
          },
        ],
        toolMode: 'chat',
      },
      global: { plugins: [i18n] },
    });
    expect(wrapper.get('[data-testid="ai-tool-activity"]').attributes('role')).toBe('status');
    const approve = wrapper.get('[data-testid="ai-tool-approve"]');
    expect(approve.element.tagName).toBe('BUTTON');
    expect(approve.classes().join(' ')).toContain('focus-visible:');
    expect(wrapper.get('[role="alert"]').text()).toBe('Try again');
    await approve.trigger('click');
    expect(wrapper.emitted('tool-decision')?.[0]).toEqual([approval, 'approve']);
    await wrapper.setProps({
      timeline: [
        {
          id: 'a',
          role: 'assistant',
          content: '',
          status: 'generating',
          approvals: [{ ...approval, status: 'sending', errorMessage: undefined }],
        },
      ],
    });
    expect(
      (wrapper.get('[data-testid="ai-tool-approve"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (wrapper.get('[data-testid="ai-tool-decline"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    wrapper.unmount();
  });
});
