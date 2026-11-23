import type { McpServer } from '@modelcontextprotocol/server';
import { validateGoalPlan } from '../contracts/goal-plan';
import { goalPlanToolDescriptors } from '../goal-plan-tool-descriptors';
import { applyGoalPlan, type GoalPlanApplyOptions } from './apply-goal-plan';

export function registerGoalPlanTools(
  server: McpServer,
  options?: GoalPlanApplyOptions,
  onResult?: (name: 'goal_plan_validate' | 'goal_plan_apply', outcome: string) => void,
): void {
  server.registerTool(
    'goal_plan_validate',
    goalPlanToolDescriptors.goal_plan_validate.definition,
    ({ plan }) => {
      const result = validateGoalPlan(plan);
      onResult?.('goal_plan_validate', result.valid ? 'OK' : 'INVALID_INPUT');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
  if (!options?.authority.scopes.includes('goals:write')) return;
  server.registerTool(
    'goal_plan_apply',
    goalPlanToolDescriptors.goal_plan_apply.definition,
    async (input) => {
      const result = await applyGoalPlan(input, options);
      onResult?.('goal_plan_apply', result.failures[0]?.code ?? 'OK');
      return {
        isError: result.status !== 'success',
        content: [
          ...(result.failures.length
            ? [{ type: 'text' as const, text: result.failures[0]!.code }]
            : []),
          { type: 'text' as const, text: JSON.stringify(result) },
        ],
        structuredContent: result,
      };
    },
  );
}
