import { z } from 'zod';
import { AssistantToolNameSchema } from './assistant-runtime.dto';
import { RuntimeEventBaseShape } from './runtime-event-base';
import { AIRuntimeUsageSchema } from './runtime-usage.dto';
const AssistantToolShape = {
  toolCallId: z.string().min(1).max(512),
  toolName: AssistantToolNameSchema,
  category: z.enum(['read', 'edit', 'execute']),
  risk: z.enum(['low', 'high']),
};

export const AssistantRuntimeEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.run.started'),
    data: z.object({
      modelId: z.string().min(1).optional(),
      providerId: z.string().min(1).optional(),
    }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.message.delta'),
    data: z.object({ content: z.string() }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.activity'),
    data: z.union([
      z
        .object({
          activityType: z.literal('tool'),
          ...AssistantToolShape,
          state: z.enum(['running', 'completed', 'failed', 'denied']),
        })
        .strict(),
      z
        .object({ activityType: z.literal('generating'), message: z.string().max(240).optional() })
        .strict(),
    ]),
  }),
  z
    .object({
      ...RuntimeEventBaseShape,
      type: z.literal('assistant.approval.required'),
      data: z.object({ ...AssistantToolShape }).strict(),
    })
    .strict(),
  z
    .object({
      ...RuntimeEventBaseShape,
      type: z.literal('assistant.approval.resolved'),
      data: z
        .object({
          toolCallId: AssistantToolShape.toolCallId,
          resolution: z.enum(['approved', 'declined', 'cancelled', 'failed']),
        })
        .strict(),
    })
    .strict(),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.usage.updated'),
    data: AIRuntimeUsageSchema,
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.workflow.linked'),
    data: z.object({
      workflowRunId: z.string().min(1),
      kind: z.string().min(1),
    }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.run.completed'),
    data: z.object({
      content: z.string(),
      assistantMessageId: z.string().min(1).optional(),
    }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.run.failed'),
    data: z.object({
      code: z.string().min(1),
      message: z.string(),
    }),
  }),
  z.object({
    ...RuntimeEventBaseShape,
    type: z.literal('assistant.run.cancelled'),
    data: z.object({ reason: z.string().optional() }),
  }),
]);
export type AssistantRuntimeEvent = z.infer<typeof AssistantRuntimeEventSchema>;
