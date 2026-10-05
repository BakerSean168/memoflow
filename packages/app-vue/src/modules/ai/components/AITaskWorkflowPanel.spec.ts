import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { AIWorkflowRunViewSchema } from '@memoflow/contracts/ai';
import AITaskWorkflowPanel from './AITaskWorkflowPanel.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { cancel: 'Cancel', edit: 'Edit' },
      aiAssistant: {
        errors: { workflowExecutionFailed: 'Execution failed' },
        chatPage: {
          workflow: {
            taskAwaitingApprovalHint: 'Review task',
            keepCompletedChanges: 'Keep completed changes',
            cancelRemaining: 'Cancel remaining',
          },
        },
        goalDraft: {
          allDay: 'All day',
          importance: 'Importance',
          importanceLevels: {
            important: 'Important',
            minor: 'Minor',
            moderate: 'Moderate',
            trivial: 'Trivial',
            vital: 'Vital',
          },
          schedule: 'Schedule',
          taskDescription: 'Description',
          taskName: 'Task name',
        },
        dialogs: {
          agent: { warnings: 'Warnings', retry: 'Retry' },
          automation: { confirm: 'Confirm', recoveryRetryReady: 'Fix the issue and retry.' },
        },
      },
    },
  },
});
describe('AITaskWorkflowPanel', () => {
  it('renders task draft title, status, and revision', () => {
    const wrapper = mount(AITaskWorkflowPanel, {
      global: { plugins: [i18n] },
      props: {
        toolMode: 'task-create',
        taskWorkflowRun: {
          runId: 'run-1',
          conversationId: 'conv-1',
          kind: 'task.create',
          status: 'suspended',
          createdAt: 1,
          updatedAt: 1,
          suspension: {
            type: 'task_draft_review',
            ownerCreate: {
              taskId: 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001',
              draftRef: 'task:ship-it',
            },
            draft: {
              revision: 2,
              task: {
                draftRef: 'task:ship-it',
                title: 'Ship it',
                description: '',
                importance: 'Moderate',
                schedule: {
                  kind: 'OneTime',
                  date: '2026-09-18',
                  timing: { kind: 'At', time: '09:00' },
                },
                reminderConfig: null,
                goalBinding: null,
                labels: [],
              },
              rationale: 'Do it',
              warnings: [],
            },
            warnings: [],
            revision: 2,
          },
        },
      },
    });
    expect(wrapper.find('[data-testid="task-workflow-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Ship it');
    expect(wrapper.find('[data-testid="task-workflow-revision"]').text()).toContain('2');
    expect(wrapper.find('[data-testid="task-workflow-draft-editor"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('ITaskPlanId_550e8400-e29b-41d4-a716-446655440001');
    expect(wrapper.find('[data-testid=task-open-native-review]').exists()).toBe(true);
  });
  it('redacts raw task execution failure messages and retains recovery actions', async () => {
    const wrapper = mount(AITaskWorkflowPanel, {
      global: { plugins: [i18n] },
      props: {
        toolMode: 'task-create',
        canRetryExecution: true,
        canAcceptPartialExecution: true,
        canCancelRemainingExecution: true,
        taskWorkflowRun: {
          runId: 'run-recovery',
          conversationId: 'conv-1',
          kind: 'task.create',
          status: 'suspended',
          createdAt: 1,
          updatedAt: 2,
          suspension: {
            type: 'recovery_required',
            message: 'postgres://secret-internal-host failed',
            retryable: true,
            failures: [
              {
                operation: 'task_plan',
                draftRef: 'task:ship-it',
                code: 'SERVICE_UNAVAILABLE',
                message: 'postgres://secret-internal-host failed',
                retryable: true,
              },
            ],
          },
        },
      },
    });

    expect(wrapper.text()).toContain('Fix the issue and retry.');
    expect(wrapper.text()).toContain('Execution failed (SERVICE_UNAVAILABLE)');
    expect(wrapper.text()).not.toContain('secret-internal-host');
    await wrapper.get('[data-testid="task-agent-retry-execution"]').trigger('click');
    await wrapper.get('[data-testid="task-agent-accept-partial"]').trigger('click');
    await wrapper.get('[data-testid="task-agent-cancel-remaining"]').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
    expect(wrapper.emitted('accept-partial')).toHaveLength(1);
    expect(wrapper.emitted('cancel-remaining')).toHaveLength(1);
  });
  it('keeps clarification display-only because the main Composer owns the answer', () => {
    const wrapper = mount(AITaskWorkflowPanel, {
      global: { plugins: [i18n] },
      props: {
        toolMode: 'task-create',
        taskWorkflowRun: AIWorkflowRunViewSchema.parse({
          runId: 'r',
          conversationId: 'c',
          kind: 'task.create',
          status: 'suspended',
          createdAt: 1,
          updatedAt: 1,
          suspension: { type: 'clarification_required', questions: ['When?'] },
        }),
      },
    });
    expect(wrapper.get('[data-testid=task-workflow-clarification]').text()).toContain('When?');
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.find('[data-testid=task-submit-clarification]').exists()).toBe(false);
    expect(wrapper.emitted('update-clarification-answer')).toBeUndefined();
    expect(wrapper.emitted('submit-clarification')).toBeUndefined();
  });
  it('never renders raw canonical result IDs', () => {
    const id = 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001';
    const wrapper = mount(AITaskWorkflowPanel, {
      global: { plugins: [i18n] },
      props: {
        toolMode: 'task-create',
        taskWorkflowRun: AIWorkflowRunViewSchema.parse({
          runId: 'r',
          conversationId: 'c',
          kind: 'task.create',
          status: 'completed',
          createdAt: 1,
          updatedAt: 1,
          result: {
            workflowRunId: 'r',
            revision: 1,
            status: 'success',
            referenceMap: { 'task:one': id },
            failures: [],
            retryable: false,
          },
        }),
      },
    });
    expect(wrapper.text()).not.toContain(id);
    expect(wrapper.get('[data-testid=task-workflow-result]').text()).toContain('1 task');
  });
});
