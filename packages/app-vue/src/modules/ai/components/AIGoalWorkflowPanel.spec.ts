import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import type { AIWorkflowRunView } from '@memoflow/contracts/ai';
import AIGoalDraftEditor from './AIGoalDraftEditor.vue';
import AIGoalWorkflowPanel from './AIGoalWorkflowPanel.vue';

type PanelProps = InstanceType<typeof AIGoalWorkflowPanel>['$props'];
type GoalWorkflowRun = Extract<AIWorkflowRunView, { kind: 'goal.create' }>;

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { untitled: 'Untitled', none: 'None' },
      aiAssistant: {
        errors: { workflowExecutionFailed: 'Execution failed' },
        chatPage: {
          workflow: {
            goalClarificationTitle: 'Goal Clarification',
            goalClarificationHint: 'Needs clarification',
            goalClarificationAnswerPlaceholder: 'Answer here',
            goalDraftTitle: 'Goal Draft',
            noteCreatedTitle: 'Knowledge Note Created',
            openCreatedNote: 'Open Note',
            startAnotherNote: 'New Note Chat',
          },
        },
        dialogs: {
          agent: {
            warnings: 'Warnings',
            events: 'Runtime Events',
            observability: 'Observability',
            tokenUsage: 'Token Usage',
            promptTokens: '{count} prompt',
            completionTokens: '{count} completion',
            totalTokens: '{count} total',
            diagnosticWorkflowStepTiming: 'Workflow step timing',
            toolTiming: 'Tool Timing',
            diagnosticWorkflowStepStarted: 'Workflow step started',
            diagnosticWorkflowStepCompleted: 'Workflow step completed',
            diagnosticToolCompleted: 'Tool completed',
            diagnosticCheckpoint: 'Checkpoint',
            diagnosticVendor: 'Vendor diagnostic',
            diagnosticRuntimeEvent: 'Runtime event',
            durationMs: '{ms} ms',
            durationSec: '{sec} sec',
          },
          automation: {
            executionStatus: 'Execution Status',
            recoveryTitle: 'Recovery',
          },
          knowledge: {
            answer: 'Knowledge Answer',
            grounded: 'Grounded in repository citations',
            insufficientEvidence: 'Current knowledge base evidence is insufficient',
            question: 'Question',
            matchedResources: '{count} note(s) matched in {ms} ms.',
            citations: 'Citations',
            relatedNotes: 'Related Notes',
            openCitation: 'Open Source',
          },
          note: {
            draftTitle: 'Knowledge Note Draft',
            duplicateRisk: 'Duplicate Risk',
            indexStatus: 'Index Status',
            savePath: 'Save Path',
            tags: 'Tags',
            source: 'Source',
            newNoteCreated: 'New note created',
            savedTo: 'Saved To',
            preview: 'Preview',
          },
        },
        goalDraft: {
          keyResults: 'Key Results',
          importance: 'Importance',
          selectImportance: 'Select importance',
          taskPlans: 'Task Templates',
          taskPlanName: 'Task template name',
          taskPlanDescription: 'Describe the task template...',
          addTaskPlan: 'Add Task Template',
          removeTaskPlan: 'Remove',
          noTaskPlans: 'No task templates will be created.',
          reminders: 'Reminders',
          reminderTitle: 'Reminder title',
          reminderDescription: 'Describe the reminder...',
          reminderTime: 'Reminder time',
          addReminder: 'Add Reminder',
          removeReminder: 'Remove',
          noReminders: 'No reminders will be created.',
          cadence: 'Cadence',
          selectCadence: 'Select cadence',
          cadenceDaily: 'Daily',
          cadenceWeekly: 'Weekly',
          cadenceOnce: 'Once',
          importanceLevels: {
            vital: 'Vital',
            important: 'Important',
            moderate: 'Moderate',
            minor: 'Minor',
            trivial: 'Trivial',
          },
        },
      },
    },
  },
});

const draft = {
  revision: 2,
  goal: {
    name: 'Ship durable goal workflow',
    description: 'Make Mastra Workflow the only goal.create owner.',
    importance: 'Important' as const,
    tags: ['ai-vnext'],
    startDate: 1_777_000_000_000,
    targetDate: 1_780_000_000_000,
  },
  keyResults: [
    {
      title: 'Pass the reference journey',
      valueType: 'Incremental' as const,
      calculationMethod: 'Sum' as const,
      startValue: 0,
      currentValue: 0,
      targetValue: 1,
      unit: 'journey',
      weight: 5,
    },
  ],
  taskPlans: [
    {
      name: 'Run the regression gate',
      importance: 'Important' as const,
      cadence: 'daily' as const,
      timeOfDay: '09:00',
      daysOfWeek: [],
      occurrences: null,
      contributionValue: 1,
      tags: [],
    },
  ],
  reminders: [
    {
      title: 'Check the gate',
      importance: 'Moderate' as const,
      cadence: 'daily' as const,
      timeOfDay: '08:55',
      timezone: 'Asia/Shanghai',
      channels: ['InApp' as const],
      tags: [],
    },
  ],
  rationale: 'A single durable owner prevents duplicate domain mutation.',
  warnings: ['Review the generated schedule before approval.'],
};

function reviewRun(): GoalWorkflowRun {
  return {
    runId: 'workflow-1',
    kind: 'goal.create',
    conversationId: 'conversation-1',
    status: 'suspended',
    suspension: {
      type: 'goal_draft_review',
      draft,
      warnings: draft.warnings,
      revision: draft.revision,
    },
    createdAt: 1,
    updatedAt: 2,
  };
}

function createPanelProps(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    toolMode: 'goal-create',
    goalClarification: null,
    goalWorkflowRun: reviewRun(),
    clarificationAnswers: [],
    editableGoal: {
      name: draft.goal.name,
      description: draft.goal.description,
      category: '',
      importance: draft.goal.importance,
      motivation: '',
      feasibilityAnalysis: '',
      tags: [...draft.goal.tags],
      startDate: draft.goal.startDate,
      targetDate: draft.goal.targetDate,
    },
    editableKeyResults: draft.keyResults.map((item) => ({ ...item, description: '' })),
    editableTaskPlans: draft.taskPlans.map((item) => ({
      name: item.name,
      description: '',
      importance: item.importance,
      cadence: item.cadence,
      timeOfDay: item.timeOfDay,
    })),
    editableReminders: draft.reminders.map((item) => ({
      title: item.title,
      description: '',
      importance: item.importance,
      cadence: item.cadence,
      timeOfDay: item.timeOfDay,
    })),
    showGoalDraftEditor: false,
    knowledgeAnswer: null,
    formatExecutionOutcome: (status: string) => status,
    ...overrides,
  };
}

function mountPanel(overrides: Partial<PanelProps> = {}) {
  return mount(AIGoalWorkflowPanel, {
    props: createPanelProps(overrides),
    global: { plugins: [i18n] },
  });
}

describe('AIGoalWorkflowPanel — ADR-052 goal.create projection', () => {
  it('renders the typed Workflow review draft and revision without AgentRun artifacts', () => {
    const wrapper = mountPanel();

    expect(wrapper.find('[data-testid="goal-workflow-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="goal-workflow-revision"]').text()).toBe('rev 2');
    expect(wrapper.find('[data-testid="goal-workflow-warnings"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Ship durable goal workflow');
    expect(wrapper.text()).toContain('Pass the reference journey');
    expect(wrapper.text()).toContain('Review the generated schedule before approval.');
    expect(wrapper.find('[data-testid="goal-agent-panel"]').exists()).toBe(false);
  });

  it('reuses the existing draft editor while Workflow suspension remains authoritative', async () => {
    const wrapper = mountPanel({ showGoalDraftEditor: true });
    const editor = wrapper.findComponent(AIGoalDraftEditor);

    expect(wrapper.find('[data-testid="goal-workflow-draft-editor"]').exists()).toBe(true);
    expect(editor.exists()).toBe(true);
    expect(editor.props('showConfirmAction')).toBe(false);
    expect(wrapper.find('[data-testid="goal-workflow-supporting-drafts-editor"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="goal-workflow-task-plan-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="goal-workflow-reminder-editor"]').exists()).toBe(true);

    wrapper
      .findComponent('[data-testid="goal-workflow-reminder-time"]')
      .vm.$emit('update:model-value', '10:30');
    await wrapper.vm.$nextTick();
    const reminderUpdates = wrapper.emitted('update-reminder') ?? [];
    expect(reminderUpdates.at(-1)).toEqual([
      {
        index: 0,
        value: expect.objectContaining({ timeOfDay: '10:30' }),
      },
    ]);
  });

  it('renders recovery directly from the durable Workflow suspension', () => {
    const run: GoalWorkflowRun = {
      runId: 'workflow-recovery',
      kind: 'goal.create',
      conversationId: 'conversation-1',
      status: 'suspended',
      suspension: {
        type: 'recovery_required',
        message: 'Some mutations failed.',
        retryable: true,
        failures: [
          {
            operation: 'reminder',
            index: 0,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Reminder store unavailable',
            retryable: true,
          },
        ],
      },
      createdAt: 1,
      updatedAt: 2,
    };
    const wrapper = mountPanel({ goalWorkflowRun: run });

    expect(wrapper.find('[data-testid="goal-workflow-recovery"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('SERVICE_UNAVAILABLE');
    expect(wrapper.text()).toContain('Execution failed (SERVICE_UNAVAILABLE)');
    expect(wrapper.text()).not.toContain('Reminder store unavailable');
    expect(wrapper.text()).toContain('retryable');
  });

  it('renders the canonical execution receipt after completion', () => {
    const run: GoalWorkflowRun = {
      runId: 'workflow-complete',
      kind: 'goal.create',
      conversationId: 'conversation-1',
      status: 'completed',
      result: {
        workflowRunId: 'workflow-complete',
        revision: 2,
        status: 'success',
        goalId: 'IGoalId_550e8400-e29b-41d4-a716-446655440000',
        keyResultIds: ['IKeyResultId_550e8400-e29b-41d4-a716-446655440001'],
        taskIds: ['ITaskPlanId_550e8400-e29b-41d4-a716-446655440002'],
        reminderIds: ['IReminderTemplateId_550e8400-e29b-41d4-a716-446655440003'],
        failures: [],
        retryable: false,
      },
      createdAt: 1,
      updatedAt: 2,
    };
    const wrapper = mountPanel({ goalWorkflowRun: run });

    expect(wrapper.find('[data-testid="goal-workflow-result"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('IGoalId_550e8400-e29b-41d4-a716-446655440000');
    expect(wrapper.text()).toContain('success');
  });

  it('renders grounded Knowledge Q&A evidence independently of goal workflow state', () => {
    const wrapper = mountPanel({
      toolMode: 'knowledge-qa',
      goalWorkflowRun: null,
      knowledgeAnswer: {
        answer: 'Use grounded repository evidence.',
        citations: [
          {
            resourceId: 'resource-1',
            resourcePath: 'notes/grounded.md',
            title: 'Grounded Note',
            chunkIndex: 0,
            excerpt: 'Repository evidence.',
            score: 0.9,
          },
        ],
        providerId: 'provider-1',
        tokenUsage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
        processingTimeMs: 42,
        matchedResourceCount: 1,
        question: 'How should answers be grounded?',
        evidenceStatus: 'grounded',
      },
    });

    expect(wrapper.find('[data-testid="knowledge-answer-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Grounded Note');
    expect(wrapper.find('[data-testid="goal-workflow-panel"]').exists()).toBe(false);
  });
});
