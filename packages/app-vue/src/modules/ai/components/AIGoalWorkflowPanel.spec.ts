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
    draftRef: 'goal' as const,
    name: 'Ship durable goal workflow',
    summary: 'Make Mastra Workflow the only goal.create owner.',
    status: 'InProgress' as const,
    startDate: '2026-09-01' as const,
    target: { kind: 'quarter' as const, year: 2026, quarter: 4 },
    labels: ['ai-vnext'],
  },
  keyResults: [
    {
      draftRef: 'kr:reference-journey',
      title: 'Pass the reference journey',
      description: null,
      aggregationMethod: 'Sum' as const,
      initialValue: 0,
      currentValue: 0,
      targetValue: 1,
      target: null,
      unit: 'journey',
      weight: 5,
    },
  ],
  tasks: [
    {
      draftRef: 'task:regression-gate',
      title: 'Run the regression gate',
      description: 'Run canonical regression checks.',
      importance: 'Important' as const,
      schedule: {
        kind: 'Recurring' as const,
        startDate: '2026-09-01' as const,
        timing: { kind: 'At' as const, time: '09:00' as const },
        recurrence: {
          frequency: 'Daily' as const,
          interval: 1,
          byWeekday: [],
          end: { kind: 'Never' as const },
        },
      },
      reminderConfig: null,
      labels: [],
      goalRef: 'goal' as const,
      keyResultRef: 'kr:reference-journey',
      contribution: { value: 1, trigger: 'EachCompletion' as const },
    },
  ],
  knowledge: [
    {
      draftRef: 'note:goal-brief',
      mode: 'create' as const,
      title: 'Goal Brief',
      markdown: '# Goal Brief\n\nWhy this goal matters.',
      targetSubpath: 'goals/ship-durable.md',
      sourceRefs: ['notes/adr-099.md'],
    },
    {
      draftRef: 'note:existing-architecture',
      mode: 'linkExisting' as const,
      title: 'Existing Architecture',
      knowledgeDocument: {
        knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440010',
        documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440011',
      },
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
      summary: draft.goal.summary,
      status: draft.goal.status,
      startDate: draft.goal.startDate,
      target: draft.goal.target,
    },
    editableKeyResults: draft.keyResults.map((item) => ({
      draftRef: item.draftRef,
      title: item.title,
      description: item.description ?? '',
      aggregationMethod: item.aggregationMethod,
      initialValue: item.initialValue,
      currentValue: item.currentValue,
      targetValue: item.targetValue,
      target: item.target,
      unit: item.unit ?? '',
      weight: item.weight,
    })),
    editableTasks: structuredClone(draft.tasks),
    editableKnowledge: structuredClone(draft.knowledge),
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

  it('renders canonical Task schedule and both Knowledge create/linkExisting review entries', () => {
    const wrapper = mountPanel({ showGoalDraftEditor: true });
    const editor = wrapper.findComponent(AIGoalDraftEditor);

    expect(wrapper.find('[data-testid="goal-workflow-draft-editor"]').exists()).toBe(true);
    expect(editor.exists()).toBe(true);
    expect(editor.props('showConfirmAction')).toBe(false);
    expect(wrapper.find('[data-testid="goal-workflow-supporting-drafts-editor"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="goal-workflow-task-editor"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="goal-workflow-knowledge-editor"]')).toHaveLength(2);
    expect(wrapper.text()).toContain('task:regression-gate');
    expect(wrapper.text()).toContain('Daily ×1');
    expect(wrapper.text()).toContain('note:goal-brief');
    expect(wrapper.text()).toContain('notes/adr-099.md');
    expect(wrapper.text()).toContain('note:existing-architecture');
    expect(wrapper.text()).toContain('kdoc_550e8400-e29b-41d4-a716-446655440011');
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
            operation: 'knowledge_link',
            draftRef: 'note:goal-brief',
            code: 'SERVICE_UNAVAILABLE',
            message: 'Knowledge relation unavailable',
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
    expect(wrapper.text()).not.toContain('Knowledge relation unavailable');
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
        referenceMap: {
          goal: 'IGoalId_550e8400-e29b-41d4-a716-446655440000',
          'kr:reference-journey': 'IKeyResultId_550e8400-e29b-41d4-a716-446655440001',
          'task:regression-gate': 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440002',
          'note:goal-brief': 'kdoc_550e8400-e29b-41d4-a716-446655440003',
        },
        relationIds: { 'note:goal-brief': 'relation-1' },
        goalVersion: 2,
        appliedGoalStatus: 'InProgress',
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
