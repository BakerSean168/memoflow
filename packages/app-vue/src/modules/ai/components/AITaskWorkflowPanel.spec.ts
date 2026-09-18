import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
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
    expect(wrapper.find('[data-testid="task-workflow-draft-editor"]').exists()).toBe(true);
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
});
