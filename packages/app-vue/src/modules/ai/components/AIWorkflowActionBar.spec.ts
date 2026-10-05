import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import AIWorkflowActionBar from './AIWorkflowActionBar.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: {
      aiAssistant: {
        chatPage: {
          workflow: {
            openSupportingTask: 'Open Task: {title}',
            openSupportingKnowledge: 'Open Note: {title}',
          },
        },
      },
    },
  },
});
function mountBar(overrides = {}) {
  const props = {
    toolMode: 'goal-create' as const,
    workflowStatusText: 'Review',
    automatedGoalId: null,
    createdSupportingTasks: [],
    createdSupportingKnowledge: [],
    goalAgentResuming: false,
    goalOwnerSubmitted: false,
    goalOwnerAttemptPending: false,
    canContinueGoalAgentExecution: true,
    canRetryGoalAgentExecution: false,
    canAcceptGoalPartialExecution: false,
    canCancelRemainingGoalExecution: false,
    goalAgentWaitingForClarification: false,
    goalAgentWaitingForApproval: true,
    goalAgentWaitingForExecution: false,
    knowledgeAnswer: null,
    linkedGoalId: null,
    taskAgentResuming: false,
    taskOwnerAttemptPending: false,
    taskOwnerSubmitted: false,
    taskAgentWaitingForClarification: false,
    taskAgentWaitingForApproval: false,
    canRetryTaskAgentExecution: false,
    canAcceptTaskPartialExecution: false,
    canCancelRemainingTaskExecution: false,
    knowledgeCaptureResuming: false,
    knowledgeCaptureWaitingForClarification: false,
    knowledgeCaptureWaitingForApproval: false,
    canRetryKnowledgeCaptureExecution: false,
    canCancelRemainingKnowledgeCaptureExecution: false,
    confirmGoalAgentRun: vi.fn(),
    cancelGoalAgentRun: vi.fn(),
    continueGoalAgentExecution: vi.fn(),
    retryGoalAgentExecution: vi.fn(),
    acceptPartialGoalExecution: vi.fn(),
    cancelRemainingGoalExecution: vi.fn(),
    openAutomatedGoal: vi.fn(),
    openCreatedSupportingTask: vi.fn(),
    openCreatedSupportingKnowledge: vi.fn(),
    cancelTaskAgentRun: vi.fn(),
    retryTaskAgentExecution: vi.fn(),
    acceptPartialTaskExecution: vi.fn(),
    cancelRemainingTaskExecution: vi.fn(),
    cancelKnowledgeCaptureRun: vi.fn(),
    retryKnowledgeCaptureExecution: vi.fn(),
    cancelRemainingKnowledgeCaptureExecution: vi.fn(),
    exitToolMode: vi.fn(),
    ...overrides,
  };
  return { props, wrapper: mount(AIWorkflowActionBar, { props, global: { plugins: [i18n] } }) };
}
describe('AIWorkflowActionBar native Goal review', () => {
  it('leaves editable confirmation to native Save and retains cancellation', async () => {
    const { wrapper, props } = mountBar();
    expect(wrapper.find('[data-testid=goal-agent-confirm-run]').exists()).toBe(false);
    expect(wrapper.find('[data-testid=goal-agent-toggle-editor]').exists()).toBe(false);
    expect(wrapper.find('[data-testid=goal-agent-retry-approval]').exists()).toBe(false);
    await wrapper.get('[data-testid=goal-agent-cancel-run]').trigger('click');
    expect(props.cancelGoalAgentRun).toHaveBeenCalledOnce();
  });
  it.each([{ goalOwnerSubmitted: true }, { goalOwnerAttemptPending: true }])(
    'keeps owner recovery reachable: %j',
    async (state) => {
      const { wrapper, props } = mountBar(state);
      await wrapper.get('[data-testid=goal-agent-retry-approval]').trigger('click');
      expect(props.confirmGoalAgentRun).toHaveBeenCalledOnce();
      expect(
        wrapper.get('[data-testid=goal-agent-cancel-run]').attributes('disabled'),
      ).toBeDefined();
      await wrapper.setProps({ goalAgentResuming: true });
      expect(
        wrapper.get('[data-testid=goal-agent-retry-approval]').attributes('disabled'),
      ).toBeDefined();
    },
  );
  it('opens created supporting resources through their native owner routes', async () => {
    const { wrapper, props } = mountBar({
      goalAgentWaitingForApproval: false,
      automatedGoalId: 'GoalId_created',
      createdSupportingTasks: [{ id: 'TaskId_created', title: 'Weekly review' }],
      createdSupportingKnowledge: [{ id: 'KnowledgeId_created', title: 'Review guide' }],
    });
    await wrapper.get('[data-testid=goal-workflow-open-supporting-task]').trigger('click');
    await wrapper.get('[data-testid=goal-workflow-open-supporting-knowledge]').trigger('click');
    expect(props.openCreatedSupportingTask).toHaveBeenCalledExactlyOnceWith('TaskId_created');
    expect(props.openCreatedSupportingKnowledge).toHaveBeenCalledExactlyOnceWith(
      'KnowledgeId_created',
    );
    expect(wrapper.text()).toContain('Weekly review');
    expect(wrapper.text()).toContain('Review guide');
    expect(wrapper.text()).not.toContain('TaskId_created');
    expect(wrapper.text()).not.toContain('KnowledgeId_created');
  });

  it('keeps Task recovery settlement reachable from Chat without routing through review cancel', async () => {
    const { wrapper, props } = mountBar({
      toolMode: 'task-create',
      goalAgentWaitingForApproval: false,
      taskAgentWaitingForApproval: false,
      canRetryTaskAgentExecution: true,
      canAcceptTaskPartialExecution: true,
      canCancelRemainingTaskExecution: true,
    });
    await wrapper.get('[data-testid=task-agent-chat-retry-execution]').trigger('click');
    await wrapper.get('[data-testid=task-agent-chat-accept-partial]').trigger('click');
    await wrapper.get('[data-testid=task-agent-chat-cancel-remaining]').trigger('click');
    expect(props.retryTaskAgentExecution).toHaveBeenCalledOnce();
    expect(props.acceptPartialTaskExecution).toHaveBeenCalledOnce();
    expect(props.cancelRemainingTaskExecution).toHaveBeenCalledOnce();
    expect(wrapper.find('[data-testid=task-agent-chat-cancel-run]').exists()).toBe(false);
  });

  it('keeps Knowledge recovery settlement reachable from Chat without routing through review cancel', async () => {
    const { wrapper, props } = mountBar({
      toolMode: 'knowledge-capture',
      goalAgentWaitingForApproval: false,
      knowledgeCaptureWaitingForApproval: false,
      canRetryKnowledgeCaptureExecution: true,
      canCancelRemainingKnowledgeCaptureExecution: true,
    });
    await wrapper.get('[data-testid=knowledge-capture-chat-retry-execution]').trigger('click');
    await wrapper.get('[data-testid=knowledge-capture-chat-cancel-remaining]').trigger('click');
    expect(props.retryKnowledgeCaptureExecution).toHaveBeenCalledOnce();
    expect(props.cancelRemainingKnowledgeCaptureExecution).toHaveBeenCalledOnce();
    expect(wrapper.find('[data-testid=knowledge-capture-chat-cancel-run]').exists()).toBe(false);
  });

  it('offers Goal partial settlement together with native supporting-resource handoff', async () => {
    const { wrapper, props } = mountBar({
      goalAgentWaitingForApproval: false,
      goalAgentWaitingForExecution: true,
      canContinueGoalAgentExecution: false,
      canAcceptGoalPartialExecution: true,
      canCancelRemainingGoalExecution: true,
      automatedGoalId: 'GoalId_partial',
      createdSupportingTasks: [{ id: 'TaskId_partial', title: 'Recovered task' }],
      createdSupportingKnowledge: [{ id: 'KnowledgeId_partial', title: 'Recovered note' }],
    });
    await wrapper.get('[data-testid=goal-agent-accept-partial]').trigger('click');
    await wrapper.get('[data-testid=goal-agent-cancel-remaining]').trigger('click');
    await wrapper.get('[data-testid=goal-workflow-open-supporting-task]').trigger('click');
    await wrapper.get('[data-testid=goal-workflow-open-supporting-knowledge]').trigger('click');
    expect(props.acceptPartialGoalExecution).toHaveBeenCalledOnce();
    expect(props.cancelRemainingGoalExecution).toHaveBeenCalledOnce();
    expect(props.openCreatedSupportingTask).toHaveBeenCalledExactlyOnceWith('TaskId_partial');
    expect(props.openCreatedSupportingKnowledge).toHaveBeenCalledExactlyOnceWith(
      'KnowledgeId_partial',
    );
  });

  it('keeps clarification on the main Composer while retaining cancellation and recovery', async () => {
    const { wrapper, props } = mountBar({
      goalAgentWaitingForApproval: false,
      goalAgentWaitingForClarification: true,
    });
    expect(wrapper.find('[data-testid=goal-workflow-submit-clarification]').exists()).toBe(false);
    await wrapper.get('[data-testid=goal-agent-cancel-run]').trigger('click');
    expect(props.cancelGoalAgentRun).toHaveBeenCalledOnce();
    await wrapper.setProps({
      goalAgentWaitingForClarification: false,
      canRetryGoalAgentExecution: true,
      automatedGoalId: 'GoalId_hidden',
    });
    await wrapper.get('[data-testid=goal-agent-retry-execution]').trigger('click');
    await wrapper.get('[data-testid=goal-workflow-open-created-goal]').trigger('click');
    expect(props.retryGoalAgentExecution).toHaveBeenCalledOnce();
    expect(props.openAutomatedGoal).toHaveBeenCalledOnce();
    expect(wrapper.text()).not.toContain('GoalId_hidden');
  });
});
