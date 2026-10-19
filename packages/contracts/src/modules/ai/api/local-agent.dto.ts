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

export const LocalAgentDriverSchema = z.enum(['codex', 'claude', 'pi', 'dsh', 'antigravity']);
export type LocalAgentDriver = z.infer<typeof LocalAgentDriverSchema>;
/** Native executables, not model services. The AGY CLI is distinct from its official ACP server. */
export const LOCAL_AGENT_DEFAULT_EXECUTABLES: Readonly<Record<LocalAgentDriver, string>> = {
  codex: 'codex',
  claude: 'claude',
  pi: 'pi',
  dsh: 'dsh',
  antigravity: 'agy_acp_server',
};
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

/** Discovered native model parameters; values are reported by the installed Agent. */
export const LocalAgentModelOptionValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9-]*$/);
export const LocalAgentModelOptionsSchema = z
  .object({
    reasoningEffort: LocalAgentModelOptionValueSchema.optional(),
    serviceTier: LocalAgentModelOptionValueSchema.optional(),
  })
  .strict();
export type LocalAgentModelOptions = z.infer<typeof LocalAgentModelOptionsSchema>;

export const LocalAgentModelSchema = z
  .object({
    id,
    name: z.string().min(1).max(240),
    provider: z.string().max(240).optional(),
    reasoningEfforts: z.array(LocalAgentModelOptionValueSchema).max(20).optional(),
    defaultReasoningEffort: LocalAgentModelOptionValueSchema.optional(),
    serviceTiers: z
      .array(z.object({ id: LocalAgentModelOptionValueSchema, name: z.string().max(100) }).strict())
      .max(20)
      .optional(),
    defaultServiceTier: LocalAgentModelOptionValueSchema.optional(),
  })
  .strict();
export type LocalAgentModel = z.infer<typeof LocalAgentModelSchema>;
/** Ephemeral Desktop probe metadata, never a persisted connection or a credential. */
export const LocalAgentAccountSummarySchema = z
  .object({
    type: z.enum(['chatgpt', 'api_key', 'other']),
    email: z.email().max(254).optional(),
    planType: z.enum(['free', 'plus', 'pro', 'team', 'business', 'enterprise']).optional(),
  })
  .strict();
export type LocalAgentAccountSummary = z.infer<typeof LocalAgentAccountSummarySchema>;

/** Server-produced, domain-separated digest of a verified native account/configuration snapshot.
 * Display preference partition only; never an authorization or execution capability.
 */
export const LocalAgentModelVisibilityContextSchema = z.string().regex(/^mvc1:[0-9a-f]{64}$/u);

/** Last observed request limit; independent of catalog discovery and never a quota balance. */
export const LocalAgentExecutionFailureSchema = z
  .object({
    code: z.enum(['LOCAL_AGENT_RATE_LIMITED', 'LOCAL_AGENT_QUOTA_EXHAUSTED']),
    modelId: id,
    occurredAt: z.number().int().nonnegative(),
  })
  .strict();
export type LocalAgentExecutionFailure = z.infer<typeof LocalAgentExecutionFailureSchema>;

export const LocalAgentStatusSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('ready'),
      models: z.array(LocalAgentModelSchema).max(2000),
      version: z.string().max(240).optional(),
      account: LocalAgentAccountSummarySchema.optional(),
      modelVisibilityContext: LocalAgentModelVisibilityContextSchema.optional(),
      lastExecutionFailure: LocalAgentExecutionFailureSchema.optional(),
    })
    .strict()
    .refine((value) => !value.lastExecutionFailure || Boolean(value.modelVisibilityContext), {
      message: 'Execution failure requires a verified native context',
    }),
  z
    .object({
      status: z.enum(['not_installed', 'login_required', 'unavailable']),
      message: z.string().max(500),
    })
    .strict(),
]);
export type LocalAgentStatus = z.infer<typeof LocalAgentStatusSchema>;

/** Explicit Antigravity Google sign-in lifecycle. One flow per Provider instance.
 * `authorizationUrl` is only published while `waiting` so the renderer can open or
 * copy it through the existing external-link surface; it is cleared afterwards and
 * is never part of an error message, a failure state or a persisted record.
 */
export const LocalAgentAuthPhaseSchema = z.enum([
  'idle',
  'starting',
  'waiting',
  'verifying',
  'succeeded',
  'failed',
  'cancelled',
]);
export type LocalAgentAuthPhase = z.infer<typeof LocalAgentAuthPhaseSchema>;
/** Stable, renderer-translatable outcomes; never raw native diagnostics. */
export const LocalAgentAuthFailureSchema = z.enum([
  'login_already_active',
  'executable_missing',
  'login_failed',
  'login_denied',
  'login_timeout',
  'callback_invalid',
  'callback_duplicate',
  'model_unavailable',
  'not_supported',
  'unavailable',
]);
export type LocalAgentAuthFailure = z.infer<typeof LocalAgentAuthFailureSchema>;
export const LocalAgentAuthStateSchema = z
  .object({
    phase: LocalAgentAuthPhaseSchema,
    flowId: id.nullable(),
    authorizationUrl: z.string().max(16_384).nullable(),
    expiresAt: z.number().int().nonnegative().nullable(),
    failure: LocalAgentAuthFailureSchema.nullable(),
    /** Present once the official ACP probe verified the signed-in account and models. */
    status: LocalAgentStatusSchema.optional(),
  })
  .strict()
  .refine((value) => value.authorizationUrl === null || value.phase === 'waiting', {
    message: 'The authorization URL is only visible while waiting for Google',
  });
export type LocalAgentAuthState = z.infer<typeof LocalAgentAuthStateSchema>;

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
  /** Explicit, user-initiated Google OAuth for one saved Antigravity instance. */
  z.object({ action: z.literal('auth_start'), connectionId: id }).strict(),
  z.object({ action: z.literal('auth_status'), connectionId: id }).strict(),
  z.object({ action: z.literal('auth_cancel'), connectionId: id, flowId: id }).strict(),
  z
    .object({
      action: z.literal('auth_complete'),
      connectionId: id,
      flowId: id,
      /** Full loopback redirect URL pasted by a user whose browser runs elsewhere. */
      callbackUrl: z.string().min(1).max(16_384),
    })
    .strict(),
  z.object({ action: z.literal('auth_sign_out'), connectionId: id }).strict(),
]);
export type LocalAgentClientCommand = z.infer<typeof LocalAgentClientCommandSchema>;
