import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import AIWorkflowActionBar from './AIWorkflowActionBar.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: {} },
});
function mountBar(overrides = {}) {
  const props = {
    toolMode: 'goal-create' as const,
    workflowStatusText: 'Review',
    goalClarification: null,
    automatedGoalId: null,
    goalAgentResuming: false,
    goalOwnerSubmitted: false,
    goalOwnerAttemptPending: false,
    canResumeGoalAgentClarification: true,
    canContinueGoalAgentExecution: true,
    canRetryGoalAgentExecution: false,
    goalAgentWaitingForClarification: false,
    goalAgentWaitingForApproval: true,
    goalAgentWaitingForExecution: false,
    knowledgeAnswer: null,
    linkedGoalId: null,
    submitGoalAgentClarification: vi.fn(),
    confirmGoalAgentRun: vi.fn(),
    cancelGoalAgentRun: vi.fn(),
    continueGoalAgentExecution: vi.fn(),
    retryGoalAgentExecution: vi.fn(),
    openAutomatedGoal: vi.fn(),
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
  it('retains clarification, execution recovery and completed Goal navigation', async () => {
    const { wrapper, props } = mountBar({
      goalAgentWaitingForApproval: false,
      goalAgentWaitingForClarification: true,
      goalClarification: { questions: [], rationale: '' },
    });
    await wrapper.get('[data-testid=goal-workflow-submit-clarification]').trigger('click');
    expect(props.submitGoalAgentClarification).toHaveBeenCalledOnce();
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
