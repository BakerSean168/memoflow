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
        chatPage: { workflow: { taskAwaitingApprovalHint: 'Review task' } },
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
        showTaskDraftEditor: true,
        editableTask: {
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
  it('redacts raw task execution failure messages', () => {
    const wrapper = mount(AITaskWorkflowPanel, {
      global: { plugins: [i18n] },
      props: {
        toolMode: 'task-create',
        showTaskDraftEditor: false,
        editableTask: null,
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
  });
  it('preserves clarification inputs and disables submission while busy', async () => {
    const wrapper = mount(AITaskWorkflowPanel, {
      global: { plugins: [i18n] },
      props: {
        toolMode: 'task-create',
        showTaskDraftEditor: false,
        editableTask: null,
        taskWorkflowRun: AIWorkflowRunViewSchema.parse({
          runId: 'r',
          conversationId: 'c',
          kind: 'task.create',
          status: 'suspended',
          createdAt: 1,
          updatedAt: 1,
          suspension: { type: 'clarification_required', questions: ['When?'] },
        }),
        clarificationAnswers: ['Tomorrow'],
        canSubmitClarification: true,
      },
    });
    await wrapper.get('textarea').setValue('Today');
    expect(wrapper.emitted('update-clarification-answer')).toEqual([[0, 'Today']]);
    await wrapper.get('[data-testid=task-submit-clarification]').trigger('click');
    expect(wrapper.emitted('submit-clarification')).toHaveLength(1);
    await wrapper.setProps({ busy: true });
    expect(wrapper.get('textarea').attributes('disabled')).toBeDefined();
    expect(
      wrapper.get('[data-testid=task-submit-clarification]').attributes('disabled'),
    ).toBeDefined();
  });
  it('never renders raw canonical result IDs', () => {
    const id = 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001';
    const wrapper = mount(AITaskWorkflowPanel, {
      global: { plugins: [i18n] },
      props: {
        toolMode: 'task-create',
        showTaskDraftEditor: false,
        editableTask: null,
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
