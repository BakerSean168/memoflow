import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import AIMessagePanel from './AIMessagePanel.vue';
import { semanticElevationClass } from '@ai-ui-test-host/shared/constants/semantic-elevation';
import enAI from '@ai-ui-test-host/locales/en-US/aiAssistant';
import zhAI from '@ai-ui-test-host/locales/zh-CN/aiAssistant';
import { setItemRunTiming } from '../composables/agentActivity';
import type { ChatItem } from '../composables/types';
import { resolveDisclosureRevealScrollDelta } from '../composables/useTimelineScrollAnchoring';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      aiAssistant: {
        activity: enAI.activity,
        local: {
          pending: 'Waiting',
          sending: 'Sending',
          answered: 'Answered',
          expired: 'Expired',
          answer: 'Send answer',
          chooseAnswer: 'Choose answer',
          otherAnswer: 'Other answer',
          selectAllThatApply: 'Select all that apply',
          question: 'Additional information requested',
          answerRequired: 'Choose an answer before sending.',
          cancel: 'Cancel',
        },
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
          message: {
            copy: 'Copy',
            copied: 'Copied',
            edit: 'Edit message',
            yesterdayAt: 'yesterday at {time}',
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
            chat: {
              title: 'Just chat',
              description: 'Chat desc',
              prefill: 'chat prefill',
            },
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
            knowledgeQa: {
              title: 'Ask KB',
              description: 'QA shortcut',
              prefill: 'qa prefill',
            },
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
            toolActivities: [
              {
                toolCallId: 'call',
                toolName: 'routine_create',
                state: 'failed',
              },
            ],
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
      slots: {
        'workflow-context': '<button data-testid="recover-workflow">Retry</button>',
      },
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
  it.each([false, true])(
    'renders workflow shortcuts with knowledge capture capability %s',
    (canCaptureKnowledge) => {
      const wrapper = mount(AIMessagePanel, {
        props: {
          timeline: [],
          toolMode: 'chat',
          canCaptureKnowledge,
        },
        global: { plugins: [i18n] },
      });

      expect(wrapper.find('[data-testid="ai-welcome-state"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('What do you want to move forward today?');
      expect(wrapper.find('[data-testid="ai-welcome-entry-chat"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="ai-welcome-entry-goal-create"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="ai-welcome-entry-task-create"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="ai-welcome-entry-knowledge-capture"]').exists()).toBe(
        canCaptureKnowledge,
      );
      expect(wrapper.find('[data-testid="ai-welcome-entry-knowledge-qa"]').exists()).toBe(true);
      expect(
        wrapper.find('[data-testid="ai-welcome-state"] [data-testid="memoflow-ai-icon"]').exists(),
      ).toBe(true);
      expect(wrapper.find('[data-testid="ai-today-overview"]').exists()).toBe(false);
    },
  );

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

  it('renders raised user messages and a heading-only assistant row (T3 header structure)', () => {
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
    // The assistant head is an sr-only author heading, not an avatar or model chip.
    expect(messages[1].find('[data-testid="memoflow-ai-icon"]').exists()).toBe(false);
    expect(messages[1].find('[data-testid="ai-message-native-model"]').exists()).toBe(false);
    expect(messages[1].get('h3').classes()).toContain('sr-only');
    expect(messages[1].get('h3').text()).toBe('Assistant');
    wrapper.unmount();
  });

  it('renders a T3-style Ask User option card where single-select clicks answer immediately', async () => {
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
    const options = wrapper.findAll('[data-testid="ai-ask-user-option"]');
    expect(options).toHaveLength(2);
    expect(options[0]?.attributes('role')).toBe('radio');
    await options[1]!.trigger('click');
    expect(wrapper.emitted('ask-user-answer')?.[0]).toMatchObject([
      { toolCallId: 'ask-1' },
      'Long term',
    ]);
    await wrapper.get('[data-testid="ai-ask-user-cancel"]').trigger('click');
    expect(wrapper.emitted('ask-user-cancel')?.[0]).toMatchObject([{ toolCallId: 'ask-1' }]);
    wrapper.unmount();
  });

  it('lets multi-select cards collect options and blocks an empty submission with a visible alert', async () => {
    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [
          {
            id: 'assistant-ask-empty',
            role: 'assistant',
            content: '',
            status: 'generating',
            askUserRequests: [
              {
                toolCallId: 'ask-empty',
                runId: 'run-1',
                conversationId: 'conversation-1',
                question: 'Choose a target',
                options: [{ label: 'Near term' }, { label: 'Long term' }],
                selectionMode: 'multi_select',
                status: 'pending',
              },
            ],
          },
        ],
        toolMode: 'chat',
      },
      global: { plugins: [i18n] },
    });

    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('ask-user-answer')).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toBe('Choose an answer before sending.');

    const options = wrapper.findAll('[data-testid="ai-ask-user-option"]');
    expect(options[0]?.attributes('role')).toBe('checkbox');
    await options[0]!.trigger('click');
    await options[1]!.trigger('click');
    expect(options[0]?.attributes('aria-checked')).toBe('true');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('ask-user-answer')?.[0]).toMatchObject([
      { toolCallId: 'ask-empty' },
      ['Near term', 'Long term'],
    ]);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('accepts a free-text answer and collapses an answered question into a summary', async () => {
    const request = {
      toolCallId: 'ask-free',
      runId: 'run-2',
      conversationId: 'conversation-1',
      question: 'Which workspace should I update?',
      options: [{ label: 'Work' }, { label: 'Personal' }],
      selectionMode: 'single_select' as const,
    };
    const timelineFor = (status: 'pending' | 'answered') => [
      {
        id: 'assistant-ask-free',
        role: 'assistant' as const,
        content: '',
        status: 'generating' as const,
        askUserRequests: [{ ...request, status }],
      },
    ];
    const wrapper = mount(AIMessagePanel, {
      props: { timeline: timelineFor('pending'), toolMode: 'chat' },
      global: { plugins: [i18n] },
    });

    // Typing overrides option selection, mirroring T3's composer custom answer.
    await wrapper.get('[data-testid="ai-ask-user-free-text"]').setValue('Use the archive vault');
    expect(
      wrapper.findAll('[data-testid="ai-ask-user-option"]')[0]?.attributes('aria-checked'),
    ).toBe('false');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('ask-user-answer')?.[0]).toMatchObject([
      { toolCallId: 'ask-free' },
      'Use the archive vault',
    ]);

    await wrapper.setProps({ timeline: timelineFor('answered') });
    const summary = wrapper.get('[data-testid="ai-ask-user-summary-toggle"]');
    expect(summary.text()).toContain('Which workspace should I update?');
    expect(summary.text()).toContain('Use the archive vault');
    expect(wrapper.find('[data-testid="ai-ask-user-history"]').exists()).toBe(false);
    await summary.trigger('click');
    expect(wrapper.get('[data-testid="ai-ask-user-history"]').text()).toContain(
      'Use the archive vault',
    );
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

  it('renders live image attachments as media and reveals time, edit and copy on hover', async () => {
    const createdAt = Date.now();
    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [
          {
            id: 'm-image',
            role: 'user',
            content: 'What is in this screenshot?',
            status: 'success',
            createdAt,
            attachments: [
              {
                mediaType: 'image/png',
                filename: 'shot.png',
                previewDataUrl: 'data:image/png;base64,AAAA',
              },
            ],
          },
          { id: 'a-image', role: 'assistant', content: 'A chart.', status: 'success', createdAt },
        ],
        toolMode: 'chat',
      },
      global: { plugins: [i18n] },
    });

    // T3 Code renders the image itself; the metadata chip must not replace it.
    const image = wrapper.get('[data-testid="ai-message-image"]');
    expect(image.attributes('src')).toBe('data:image/png;base64,AAAA');
    expect(wrapper.find('[data-testid="ai-message-attachment"]').exists()).toBe(false);
    expect(
      wrapper.get('[data-testid="ai-user-message-time"]').text().trim().length,
    ).toBeGreaterThan(0);
    await wrapper.get('[data-testid="ai-user-message-edit"]').trigger('click');
    expect(wrapper.emitted('edit-message')?.[0]).toEqual(['What is in this screenshot?']);
    expect(wrapper.get('[data-testid="ai-user-message-copy"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="ai-message-time"]').text().trim().length).toBeGreaterThan(0);
    expect(wrapper.get('[data-testid="ai-message-actions"]').classes()).toContain('min-h-6');
    wrapper.unmount();
  });

  it('renders a persisted image attachment as a metadata chip when no preview payload exists', () => {
    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [
          {
            id: 'm-image-history',
            role: 'user',
            content: '',
            status: 'success',
            attachments: [{ mediaType: 'image/png', filename: 'shot.png' }],
          },
        ],
        toolMode: 'chat',
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-testid="ai-message-image"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="ai-message-attachment"]').text()).toContain('shot.png');
    wrapper.unmount();
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
    expect(copy.classes()).toContain('h-6');
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
    expect(wrapper.get('[data-testid="ai-agent-phase"]').attributes('role')).toBe('status');
    expect(wrapper.get('[data-testid="ai-agent-phase"]').text()).toContain('Waiting');
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

  it('aggregates same-run receipts and replies without a settled Worked for log, keeping user hover copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const receipt: ChatItem = {
      id: 'receipt-1',
      role: 'assistant',
      content: '',
      status: 'success',
      approvals: [
        {
          toolCallId: 'write-1',
          toolName: 'routine_create',
          category: 'edit',
          risk: 'high',
          conversationId: 'c',
          runId: 'run-9',
          status: 'approved',
        },
      ],
      toolActivities: [{ toolCallId: 'read-1', toolName: 'knowledge_search', state: 'completed' }],
    };
    const reply: ChatItem = {
      id: 'reply-9',
      role: 'assistant',
      content: 'All set.',
      status: 'success',
      toolActivities: [{ toolCallId: 'write-1', toolName: 'routine_create', state: 'completed' }],
    };
    setItemRunTiming(reply, {
      runId: 'run-9',
      startedAt: 1_000,
      completedAt: 4_500,
      pausedDurationMs: 0,
      terminalObserved: true,
    });

    const wrapper = mount(AIMessagePanel, {
      props: {
        timeline: [
          { id: 'u1', role: 'user', content: 'First prompt', status: 'success' },
          { id: 'u2', role: 'user', content: 'Second prompt', status: 'success' },
          receipt,
          reply,
        ],
        toolMode: 'chat',
      },
      global: { plugins: [i18n] },
    });

    // 2 grouped user messages + 1 aggregated assistant turn = 3 articles
    expect(wrapper.findAll('article')).toHaveLength(3);
    expect(wrapper.get('[data-testid="ai-tool-approval"]').text()).toContain('Create a routine');
    // A clean completion drops the working row and its duration fold entirely.
    expect(wrapper.find('[data-testid="ai-agent-phase"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-agent-history"]').exists()).toBe(false);

    // User message hover/focus copy action works
    const userCopies = wrapper.findAll('[data-testid="ai-user-message-copy"]');
    expect(userCopies).toHaveLength(2);
    await userCopies[0]!.trigger('click');
    expect(writeText).toHaveBeenCalledWith('First prompt');
    wrapper.unmount();
  });
});

// Geometry regression cases from T3's disclosure reveal contract.
describe('disclosure reading anchor', () => {
  it('reveals only the hidden portion while keeping the disclosure header visible', () => {
    expect(resolveDisclosureRevealScrollDelta(80, 580, 0, 500)).toBe(56);
    expect(resolveDisclosureRevealScrollDelta(200, 530, 0, 500)).toBe(30);
    expect(resolveDisclosureRevealScrollDelta(10, 800, 0, 500)).toBe(0);
    expect(resolveDisclosureRevealScrollDelta(80, 450, 0, 500)).toBe(0);
  });
});
