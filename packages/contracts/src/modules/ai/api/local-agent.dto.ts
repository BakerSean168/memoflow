import { z } from 'zod';

const id = z.string().trim().min(1).max(512);
export const AssistantRuntimeKindSchema = z.enum(['builtin', 'local_agent']);
export type AssistantRuntimeKind = z.infer<typeof AssistantRuntimeKindSchema>;
export const AssistantConversationRefSchema = z
  .object({ runtimeKind: AssistantRuntimeKindSchema, id })
  .strict();
export type AssistantConversationRef = z.infer<typeof AssistantConversationRefSchema>;

export const AssistantRuntimeChoiceSchema = z.discriminatedUnion('runtimeKind', [
  z
    .object({
      runtimeKind: z.literal('builtin'),
      providerId: id.optional(),
      modelId: id.optional(),
    })
    .strict(),
  z.object({ runtimeKind: z.literal('local_agent'), connectionId: id, modelId: id }).strict(),
]);
export type AssistantRuntimeChoice = z.infer<typeof AssistantRuntimeChoiceSchema>;

export const LocalAgentDriverSchema = z.enum(['codex', 'claude', 'pi', 'dsh']);
export type LocalAgentDriver = z.infer<typeof LocalAgentDriverSchema>;
export const LocalAgentActivitySchema = z
  .object({
    toolCallId: id,
    label: z.string().min(1).max(240),
    state: z.enum(['running', 'completed', 'failed', 'denied']),
  })
  .strict();
export type LocalAgentActivity = z.infer<typeof LocalAgentActivitySchema>;
export const LocalAgentWriteScopeSchema = z.enum(['goals:write', 'tasks:write']);
const nativePath = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .refine((value) => !/[\0\r\n]/u.test(value), 'Invalid native path');
export const AgentInstanceSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
/** Trusted settings input; never accepts secrets, arbitrary argv or environment. */
export const LocalAgentConnectionInputSchema = z
  .object({
    driver: LocalAgentDriverSchema,
    instanceSlug: AgentInstanceSlugSchema.optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/u)
      .optional(),
    name: z.string().trim().min(1).max(120),
    executablePath: nativePath,
    homePath: nativePath.optional(),
    enabled: z.boolean(),
    writeScopes: z.array(LocalAgentWriteScopeSchema).max(3).default([]),
  })
  .strict();
export type LocalAgentConnectionInput = z.infer<typeof LocalAgentConnectionInputSchema>;
export const LocalAgentConnectionSchema = LocalAgentConnectionInputSchema.extend({
  id,
  revision: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  defaultModelId: id.optional(),
});
export type LocalAgentConnection = z.infer<typeof LocalAgentConnectionSchema>;

export const LocalAgentConversationCreateSchema = z
  .object({
    connectionId: id,
    modelId: id,
    name: z.string().trim().min(1).max(240),
  })
  .strict();
export type LocalAgentConversationCreate = z.infer<typeof LocalAgentConversationCreateSchema>;
export const LocalAgentConversationSchema = LocalAgentConversationCreateSchema.extend({
  id,
  runtimeKind: z.literal('local_agent'),
  driver: LocalAgentDriverSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type LocalAgentConversation = z.infer<typeof LocalAgentConversationSchema>;

export const LocalAgentModelSchema = z
  .object({
    id,
    name: z.string().min(1).max(240),
    provider: z.string().max(240).optional(),
  })
  .strict();
export type LocalAgentModel = z.infer<typeof LocalAgentModelSchema>;
export const LocalAgentStatusSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('ready'),
      models: z.array(LocalAgentModelSchema).max(2000),
      version: z.string().max(240).optional(),
    })
    .strict(),
  z
    .object({
      status: z.enum(['not_installed', 'login_required', 'unavailable']),
      message: z.string().max(500),
    })
    .strict(),
]);
export type LocalAgentStatus = z.infer<typeof LocalAgentStatusSchema>;

export const LocalAgentRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('permission'), requestId: id, title: z.string().max(500) }).strict(),
  z
    .object({
      type: z.literal('user_input'),
      requestId: id,
      questions: z
        .array(
          z
            .object({
              id,
              prompt: z.string().min(1).max(4000),
              options: z.array(z.string().min(1).max(1000)).max(30),
            })
            .strict(),
        )
        .min(1)
        .max(10),
    })
    .strict(),
]);
export type LocalAgentRequest = z.infer<typeof LocalAgentRequestSchema>;
export const LocalAgentRequestResponseSchema = z
  .object({
    conversationId: id,
    runId: id,
    requestId: id,
    response: z.discriminatedUnion('type', [
      z
        .object({ type: z.literal('permission'), decision: z.enum(['approve_once', 'decline']) })
        .strict(),
      z
        .object({
          type: z.literal('user_input'),
          answers: z
            .array(
              z
                .object({
                  questionId: id,
                  values: z.array(z.string().max(8000)).max(30),
                })
                .strict(),
            )
            .max(10),
        })
        .strict(),
    ]),
  })
  .strict();
export type LocalAgentRequestResponse = z.infer<typeof LocalAgentRequestResponseSchema>;

export const LocalAgentClientCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('get_default') }).strict(),
  z.object({ action: z.literal('set_default'), choice: AssistantRuntimeChoiceSchema }).strict(),
  z.object({ action: z.literal('list_connections') }).strict(),
  z
    .object({
      action: z.literal('save_connection'),
      id: id.optional(),
      expectedRevision: z.number().int().positive().optional(),
      connection: LocalAgentConnectionInputSchema,
    })
    .strict(),
  z.object({ action: z.literal('delete_connection'), id }).strict(),
  z.object({ action: z.literal('probe_connection'), id }).strict(),
  /** Desktop-only implicit driver probe. No connection ID or untrusted executable arguments. */
  z.object({ action: z.literal('probe_default'), driver: LocalAgentDriverSchema }).strict(),
  z.object({ action: z.literal('list_conversations') }).strict(),
  z
    .object({
      action: z.literal('create_conversation'),
      conversation: LocalAgentConversationCreateSchema,
    })
    .strict(),
  z.object({ action: z.literal('respond'), response: LocalAgentRequestResponseSchema }).strict(),
]);
export type LocalAgentClientCommand = z.infer<typeof LocalAgentClientCommandSchema>;
