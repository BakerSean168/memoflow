import { z } from 'zod';
import {
  GatewayGoalPlanApplySchema,
  GatewayGoalPlanResultSchema,
  GatewayGoalPlanValidationSchema,
} from './contracts/goal-plan';

export const goalPlanToolDescriptors = {
  goal_plan_validate: {
    requiredScope: undefined,
    definition: {
      description:
        'Validate a complete Goal/KR/Task plan without writing or calling a model. Returns input issues and completeness warnings. The goal_plan_apply schema defines the plan; read workflow_guide_get for the planning procedure.',
      inputSchema: z.object({ plan: z.unknown() }).strict(),
      outputSchema: GatewayGoalPlanValidationSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  },
  goal_plan_apply: {
    requiredScope: 'goals:write',
    definition: {
      description:
        'Apply your own Goal/KR/linked-Task plan with per-operation authorization and durable per-item idempotency; no model or Agent session. Use existing target to enrich a Goal. Tasks also require tasks:write. Retry the unchanged plan with the same idempotencyKey. May return partial success; inspect receipts before further work. Follow any native-form policy.',
      inputSchema: GatewayGoalPlanApplySchema,
      outputSchema: GatewayGoalPlanResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  },
} as const;
export type GatewayGoalPlanToolName = keyof typeof goalPlanToolDescriptors;
