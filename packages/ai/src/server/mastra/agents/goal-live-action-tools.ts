import { createTool } from '@mastra/core/tools';
import type { RequestContext } from '@mastra/core/request-context';
import {
  GoalPlanGoalSchema,
  GoalPlanKeyResultSchema,
  GoalWorkflowActionIdSchema,
  GoalWorkflowLiveActionSchema,
} from '@memoflow/contracts/ai';
import { z } from 'zod';
import { requireGoalWorkflowLiveActionSink } from '../workflows/goal-business-action-journal';

async function stageAction(requestContext: RequestContext, action: unknown) {
  const sink = requireGoalWorkflowLiveActionSink(requestContext);
  const command = GoalWorkflowLiveActionSchema.parse({
    ...(action as object),
    revision: sink.revision,
  });
  const receipt = await sink.append(command);
  return { actionId: receipt.command.actionId, sequence: receipt.sequence, staged: true };
}

/**
 * These are *draft* tools only, never Goal persistence or save capabilities.
 * They can execute only inside a server-owned goal.create Workflow with an
 * authenticated, version-bound durable action sink.
 */
export function createGoalLiveActionTools() {
  return {
    goal_set_name: createTool({
      id: 'goal_set_name',
      description:
        'Stage the Goal name in the native creation form during planning. Does not save the Goal.',
      inputSchema: z
        .object({
          actionId: GoalWorkflowActionIdSchema,
          value: GoalPlanGoalSchema.shape.name,
        })
        .strict(),
      execute: (input, { requestContext }) =>
        stageAction(requestContext, { ...input, operation: 'goal.setName' }),
    }),
    goal_patch_description: createTool({
      id: 'goal_patch_description',
      description:
        'Stage the Goal description in the native form during planning. Does not save the Goal.',
      inputSchema: z
        .object({
          actionId: GoalWorkflowActionIdSchema,
          value: GoalPlanGoalSchema.shape.description.unwrap(),
        })
        .strict(),
      execute: (input, { requestContext }) =>
        stageAction(requestContext, { ...input, operation: 'goal.patchDescription' }),
    }),
    goal_set_start: createTool({
      id: 'goal_set_start',
      description:
        'Stage a canonical Goal start timeframe; ask the user before assuming an ambiguous date.',
      inputSchema: z
        .object({
          actionId: GoalWorkflowActionIdSchema,
          value: GoalPlanGoalSchema.shape.start.unwrap(),
        })
        .strict(),
      execute: (input, { requestContext }) =>
        stageAction(requestContext, { ...input, operation: 'goal.setStart' }),
    }),
    goal_set_target: createTool({
      id: 'goal_set_target',
      description:
        'Stage a canonical Goal target timeframe; ask the user before assuming an ambiguous deadline.',
      inputSchema: z
        .object({
          actionId: GoalWorkflowActionIdSchema,
          value: GoalPlanGoalSchema.shape.target.unwrap(),
        })
        .strict(),
      execute: (input, { requestContext }) =>
        stageAction(requestContext, { ...input, operation: 'goal.setTarget' }),
    }),
    goal_patch_key_results: createTool({
      id: 'goal_patch_key_results',
      description:
        'Stage a validated set of canonical Key Results in the native Goal form; does not persist them.',
      inputSchema: z
        .object({
          actionId: GoalWorkflowActionIdSchema,
          value: z.array(GoalPlanKeyResultSchema).max(50),
        })
        .strict(),
      execute: (input, { requestContext }) =>
        stageAction(requestContext, { ...input, operation: 'goal.patchKeyResults' }),
    }),
  };
}
