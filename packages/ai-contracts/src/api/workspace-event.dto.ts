import { z } from 'zod';
import { AIWorkflowRunViewSchema } from './workflow-runtime.dto';
import { GoalWorkflowLiveActionRecordSchema } from './ai-goal-create-workflow.dto';
import {
  AssistantAttentionViewSchema,
  AssistantAttentionRuntimeKindSchema,
} from './assistant-attention.dto';
import { AIConversationClientDTOSchema } from './response-schemas';

export const WorkspaceCursorSchema = z.string().min(1).max(2048);
export const WorkspaceStreamRequestSchema = z
  .object({
    streamId: z.string().min(1).max(128),
    cursor: WorkspaceCursorSchema.optional(),
  })
  .strict();
export const WorkspaceStreamAckSchema = z
  .object({
    streamId: z.string().min(1).max(128),
    cursor: WorkspaceCursorSchema,
  })
  .strict();
export const WorkspaceStreamStopSchema = z
  .object({ streamId: z.string().min(1).max(128) })
  .strict();
export const WorkspaceEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('conversation.updated'),
      eventId: z.string().min(1).max(256),
      cursor: WorkspaceCursorSchema,
      resourceVersion: z.number().int().positive(),
      data: z
        .object({
          conversationId: z.string().min(1),
          runtimeKind: z.literal('builtin'),
          conversation: AIConversationClientDTOSchema.extend({
            resourceVersion: z.number().int().positive(),
          })
            .strict()
            .nullable(),
        })
        .strict(),
    })
    .strict()
    .superRefine((event, ctx) => {
      const view = event.data.conversation;
      if (
        view &&
        (String(view.id) !== event.data.conversationId ||
          view.resourceVersion !== event.resourceVersion)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['data'],
          message: 'Conversation event identity or version mismatch',
        });
      }
    }),
  z
    .object({
      type: z.literal('attention.changed'),
      eventId: z.string().min(1).max(256),
      cursor: WorkspaceCursorSchema,
      resourceVersion: z.number().int().positive(),
      data: z
        .object({
          conversationId: z.string().min(1),
          runtimeKind: AssistantAttentionRuntimeKindSchema,
          attention: AssistantAttentionViewSchema.nullable(),
        })
        .strict(),
    })
    .strict()
    .superRefine((event, ctx) => {
      const view = event.data.attention;
      if (
        view &&
        (view.conversationId !== event.data.conversationId ||
          view.runtimeKind !== event.data.runtimeKind ||
          view.resourceVersion !== event.resourceVersion)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['data'],
          message: 'Attention event identity or version mismatch',
        });
      }
    }),
  z
    .object({
      type: z.literal('workflow.updated'),
      eventId: z.string().min(1).max(256),
      cursor: WorkspaceCursorSchema,
      resourceVersion: z.number().int().positive(),
      data: AIWorkflowRunViewSchema,
      actions: z.array(GoalWorkflowLiveActionRecordSchema).max(64).default([]),
      baseActionSequence: z.number().int().nonnegative(),
      lastActionSequence: z.number().int().nonnegative(),
    })
    .strict()
    .superRefine((event, ctx) => {
      if (event.data.resourceVersion !== event.resourceVersion) {
        ctx.addIssue({
          code: 'custom',
          path: ['resourceVersion'],
          message: 'Workflow resource version mismatch',
        });
      }
      if (
        event.lastActionSequence !== event.baseActionSequence + event.actions.length ||
        event.actions.some(
          (action, index) => action.sequence !== event.baseActionSequence + index + 1,
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['actions'],
          message: 'Workflow action delta must be contiguous',
        });
      }
    }),
  z.object({ type: z.literal('stream.ready'), cursor: WorkspaceCursorSchema }).strict(),
  z
    .object({
      type: z.literal('stream.reset_required'),
      cursor: WorkspaceCursorSchema,
      reason: z.enum(['invalid', 'expired', 'overflow', 'projection_failed']),
    })
    .strict(),
]);
export type WorkspaceEvent = z.infer<typeof WorkspaceEventSchema>;
