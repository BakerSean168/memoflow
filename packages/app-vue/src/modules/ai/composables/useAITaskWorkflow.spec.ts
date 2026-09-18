import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import { TaskPlanDraftSchema, type AIWorkflowRunView } from '@memoflow/contracts/ai';
import { useAITaskWorkflow } from './useAITaskWorkflow';
import type { UseAITaskWorkflowOptions } from './types';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': { aiAssistant: { errors: { workflowExecutionFailed: 'Failed' } } } },
});

const model = {
  value: { providerId: 'p', modelId: 'm' },
} as UseAITaskWorkflowOptions['selectedModel'];

const draft = TaskPlanDraftSchema.parse({
  revision: 1,
  task: {
    draftRef: 'task:write-it',
    title: 'Write it',
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
  rationale: 'Because',
  warnings: [],
});

type TaskRun = Extract<AIWorkflowRunView, { kind: 'task.create' }>;

const run = (overrides: Partial<TaskRun> = {}): TaskRun => ({
  runId: 'run-1',
  conversationId: 'conv-1',
  kind: 'task.create',
  status: 'running',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

function setup(start = run()) {
  const runtime = {
    start: vi.fn().mockResolvedValue(start),
    resume: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    cancel: vi.fn(),
  };
  const options = {
    workflowRuntime: runtime,
    selectedModel: model,
    chatConversationId: { value: 'conv-1' },
    chatLoading: { value: false },
    hasWorkflowUserMessages: { value: true },
    buildConversationTranscript: () => 'make task',
    scrollMessagesToBottom: vi.fn(),
    maybeRenameCurrentConversation: vi.fn(),
    openCreatedTask: vi.fn(),
  } as unknown as UseAITaskWorkflowOptions;
  const Host = defineComponent({
    setup: () => useAITaskWorkflow(options),
    render: () => h('div'),
  });
  return {
    vm: mount(Host, { global: { plugins: [i18n] } }).vm as unknown as ReturnType<
      typeof useAITaskWorkflow
    >,
    runtime,
    options,
  };
}

describe('useAITaskWorkflow', () => {
  it('starts with client-safe task input and no identityId', async () => {
    const { vm, runtime } = setup();
    await vm.startTaskAgentRun();
    expect(runtime.start).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'task.create', input: { idea: 'make task' } }),
    );
    expect(runtime.start.mock.calls[0][0]).not.toHaveProperty('identityId');
  });

  it('projects canonical Goal binding and recovery without leaking raw failure messages', async () => {
    const { vm } = setup(
      run({
        status: 'suspended',
        suspension: { type: 'clarification_required', questions: ['When?'] },
      }),
    );
    await vm.startTaskAgentRun();
    expect(vm.taskWorkflowStage).toBe('clarification');
    vm.projectRun(
      run({
        status: 'suspended',
        suspension: { type: 'task_draft_review', draft, warnings: [], revision: 1 },
      }),
    );
    expect(vm.taskWorkflowStage).toBe('confirm');
    vm.projectRun(
      run({
        status: 'suspended',
        suspension: {
          type: 'recovery_required',
          message: 'raw recovery',
          retryable: true,
          failures: [
            {
              operation: 'task_plan',
              draftRef: 'task:write-it',
              code: 'CREATE_FAILED',
              message: 'database detail',
              retryable: true,
            },
          ],
        },
      }),
    );
    expect(vm.taskWorkflowStage).toBe('execute');
    expect(vm.taskExecutionRecovery?.suggestions).toEqual(['Failed (CREATE_FAILED)']);
    expect(vm.taskExecutionRecovery?.suggestions.join(' ')).not.toContain('database detail');
  });

  it('maps clarification, approval, retry, and cancel to typed commands', async () => {
    const { vm, runtime } = setup(
      run({
        status: 'suspended',
        suspension: { type: 'clarification_required', questions: ['When?'] },
      }),
    );
    await vm.startTaskAgentRun();
    vm.clarificationAnswers = ['tomorrow'];
    runtime.resume.mockResolvedValue(
      run({
        status: 'suspended',
        suspension: { type: 'task_draft_review', draft, warnings: [], revision: 1 },
      }),
    );
    await vm.submitTaskClarification();
    expect(runtime.resume).toHaveBeenCalledWith({
      runId: 'run-1',
      command: { type: 'answer', answers: ['tomorrow'] },
    });
    await vm.confirmTaskAgentRun();
    expect(runtime.resume).toHaveBeenLastCalledWith({
      runId: 'run-1',
      command: { type: 'approve' },
    });
  });

  it('flushes local structured edits before approval without starting another planner run', async () => {
    const { vm, runtime } = setup(
      run({
        status: 'suspended',
        suspension: { type: 'task_draft_review', draft, warnings: [], revision: 1 },
      }),
    );
    await vm.startTaskAgentRun();
    vm.showTaskDraftEditor = true;
    vm.updateTaskDraft({ ...draft.task, title: 'Write it today' });

    const revisedDraft = TaskPlanDraftSchema.parse({
      ...draft,
      revision: 2,
      task: { ...draft.task, title: 'Write it today' },
    });
    runtime.resume
      .mockResolvedValueOnce(
        run({
          status: 'suspended',
          suspension: {
            type: 'task_draft_review',
            draft: revisedDraft,
            warnings: [],
            revision: 2,
          },
        }),
      )
      .mockResolvedValueOnce(
        run({
          status: 'completed',
          result: {
            workflowRunId: 'run-1',
            revision: 2,
            status: 'success',
            referenceMap: { 'task:write-it': 'task-plan-1' },
            failures: [],
            retryable: false,
          },
        }),
      );

    await vm.confirmTaskAgentRun();

    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(runtime.resume).toHaveBeenNthCalledWith(1, {
      runId: 'run-1',
      command: {
        type: 'edit_structured',
        patch: expect.objectContaining({
          task: expect.objectContaining({ title: 'Write it today' }),
        }),
      },
    });
    expect(runtime.resume).toHaveBeenNthCalledWith(2, {
      runId: 'run-1',
      command: { type: 'approve' },
    });
  });

  it('deep-links only the canonical draftRef result after completion', async () => {
    const { vm, runtime, options } = setup(
      run({
        status: 'suspended',
        suspension: { type: 'task_draft_review', draft, warnings: [], revision: 1 },
      }),
    );
    await vm.startTaskAgentRun();
    runtime.resume.mockResolvedValue(
      run({
        status: 'completed',
        result: {
          workflowRunId: 'run-1',
          revision: 1,
          status: 'success',
          referenceMap: { 'task:write-it': 'task-plan-1' },
          failures: [],
          retryable: false,
        },
      }),
    );
    await vm.confirmTaskAgentRun();
    expect(options.openCreatedTask).toHaveBeenCalledWith('task-plan-1');
  });

  it('restores the authoritative session through workflowRuntime.get', async () => {
    const { vm, runtime } = setup();
    runtime.get.mockResolvedValue(
      run({
        status: 'suspended',
        suspension: { type: 'task_draft_review', draft, warnings: [], revision: 1 },
      }),
    );
    await vm.syncTaskWorkflowRun('run-1');
    expect(runtime.get).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(vm.taskWorkflowStage).toBe('confirm');
  });
});
