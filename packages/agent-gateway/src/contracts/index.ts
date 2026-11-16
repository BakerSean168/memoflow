import { z } from 'zod';
import type { Result } from '@memoflow/transport-contracts/result';
import {
  TaskReadInstantSchema,
  TaskReadPlanSchema,
  TaskReadOccurrenceSchema,
  TaskPlanReadIdSchema,
  TaskOccurrenceReadIdSchema,
} from '@memoflow/task-contracts';
import { GoalClientDTOSchema, KeyResultClientDTOSchema } from '@memoflow/goal-contracts';
import { LabelClientDTOSchema } from '@memoflow/label-contracts';

/** External Goal reads deliberately omit review bodies and private cross-owner context. */
export const ExternalGoalSchema = GoalClientDTOSchema.pick({
  id: true,
  name: true,
  summary: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  overallProgress: true,
})
  .extend({
    keyResults: z
      .array(
        KeyResultClientDTOSchema.pick({
          id: true,
          title: true,
          progress: true,
          progressPercentage: true,
          isCompleted: true,
        }),
      )
      .max(100),
  })
  .strict();
export const GoalGetInputSchema = z.strictObject({
  id: GoalClientDTOSchema.shape.id,
});
export const GoalGetOutputSchema = z.strictObject({ goal: ExternalGoalSchema });
export const GoalSearchInputSchema = z.strictObject({
  query: z.string().trim().max(200).default(''),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().max(2048).optional(),
});
export const GoalSearchOutputSchema = z.strictObject({
  items: z.array(ExternalGoalSchema).max(100),
  hasMore: z.boolean(),
  nextCursor: z.string().max(2048).nullable(),
  truncated: z.literal('response-budget').optional(),
});

/** First-party credential management contract; not an MCP authorization grant. */
export const CreateScopedPatSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  expiresInDays: z.number().int().min(1).max(365).default(90),
  scopes: z
    .array(
      z.enum([
        'goals:read',
        'tasks:read',
        'goals:write',
        'tasks:write',
        'routines:write',
        'ai:read',
        'routines:read',
        'notifications:read',
        'notifications:write',
        'labels:read',
      ]),
    )
    .min(1)
    .max(10)
    .refine((scopes) => new Set(scopes).size === scopes.length, 'Duplicate scopes')
    .default(['goals:read']),
});
export type CreateScopedPatInput = z.input<typeof CreateScopedPatSchema>;

const credentialDates = {
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
};
export const ScopedPatSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  prefix: z.string(),
  audience: z.url(),
  scopes: z.array(
    z.enum([
      'goals:read',
      'tasks:read',
      'routines:read',
      'ai:read',
      'goals:write',
      'tasks:write',
      'routines:write',
      'notifications:read',
      'notifications:write',
      'labels:read',
    ]),
  ),
  ...credentialDates,
});
export const OAuthConnectionSchema = z.object({
  id: z.uuid(),
  clientId: z.url(),
  name: z.string(),
  resource: z.url(),
  scopes: z.array(z.string()),
  lastUsedAt: z.iso.datetime().nullable(),
  ...credentialDates,
});
export const ExternalAgentConsentSchema = z.object({
  clientId: z.url(),
  name: z.string(),
  resource: z.url(),
  lifetimeDays: z.literal(90),
  scopes: z.array(z.enum(['goals:read', 'tasks:read', 'offline_access'])),
});
export type ScopedPatSummary = z.infer<typeof ScopedPatSummarySchema>;
export type OAuthConnection = z.infer<typeof OAuthConnectionSchema>;
export type ExternalAgentConsent = z.infer<typeof ExternalAgentConsentSchema>;
export * from './failure';
import type { ExternalAgentFailure } from './failure';
export type ExternalAgentResult<T> = Result<T, ExternalAgentFailure>;
/** First-party account controls; external credentials cannot call these methods. */
export interface ExternalAgentClientPort {
  capabilities(): Promise<ExternalAgentResult<{ oauth: boolean }>>;
  consentRequest(oauthQuery: string): Promise<ExternalAgentResult<ExternalAgentConsent>>;
  decideConsent(oauthQuery: string, accept: boolean): Promise<ExternalAgentResult<{ url: string }>>;
  listConnections(): Promise<ExternalAgentResult<OAuthConnection[]>>;
  revokeConnection(id: string): Promise<ExternalAgentResult<void>>;
  listPats(): Promise<ExternalAgentResult<ScopedPatSummary[]>>;
  createPat(
    input: CreateScopedPatInput,
  ): Promise<ExternalAgentResult<ScopedPatSummary & { secret: string }>>;
  revokePat(id: string): Promise<ExternalAgentResult<void>>;
}
export const GatewayFailureCodeSchema = z.enum([
  'NOT_FOUND',
  'FORBIDDEN',
  'PERMISSION_DENIED',
  'INVALID_CURSOR',
  'TIMEOUT',
  'REQUEST_TOO_LARGE',
  'RESPONSE_TOO_LARGE',
  'INTERNAL_ERROR',
  'RATE_LIMITED',
  'UNAVAILABLE',
  'INVALID_CREDENTIAL',
  'DISABLED',
  'ORIGIN_DENIED',
  'HOST_DENIED',
  'METHOD_NOT_ALLOWED',
  'INSUFFICIENT_SCOPE',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'VALIDATION_ERROR',
  'OPERATION_IN_PROGRESS',
]);
export type GatewayFailureCode = z.infer<typeof GatewayFailureCodeSchema>;

export const ExternalTaskPlanSchema = TaskReadPlanSchema.strict();
export const ExternalTaskOccurrenceSchema = TaskReadOccurrenceSchema.strict();
export const TaskPlanGetInputSchema = z.strictObject({
  id: TaskPlanReadIdSchema,
});
export const TaskPlanGetOutputSchema = z.strictObject({
  plan: ExternalTaskPlanSchema,
});
export const TaskPlanSearchInputSchema = GoalSearchInputSchema;
export const TaskPlanSearchOutputSchema = z.strictObject({
  items: z.array(ExternalTaskPlanSchema).max(100),
  hasMore: z.boolean(),
  nextCursor: z.string().max(2048).nullable(),
  truncated: z.literal('response-budget').optional(),
});
export const TaskOccurrenceGetInputSchema = z.strictObject({
  id: TaskOccurrenceReadIdSchema,
});
export const TaskOccurrenceGetOutputSchema = z.strictObject({
  occurrence: ExternalTaskOccurrenceSchema,
});
export const TaskOccurrenceListInputSchema = z
  .strictObject({
    startDate: TaskReadInstantSchema,
    endDate: TaskReadInstantSchema,
    includeOverdueOpen: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z.string().max(2048).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.endDate < input.startDate || input.endDate - input.startDate > 31 * 86400000)
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'Expected an ordered range of at most 31 days',
      });
  });
export const TaskOccurrenceListOutputSchema = z.strictObject({
  items: z.array(ExternalTaskOccurrenceSchema).max(100),
  hasMore: z.boolean(),
  nextCursor: z.string().max(2048).nullable(),
  truncated: z.literal('response-budget').optional(),
  timeZone: z.string(),
  asOf: TaskReadInstantSchema,
});

export const ExternalLabelColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Label color must be a 6-digit RGB hex value.');

export const ExternalLabelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    color: ExternalLabelColorSchema.nullable(),
    createdAt: z.number().finite(),
    updatedAt: z.number().finite(),
  })
  .strict();
export type ExternalLabel = z.infer<typeof ExternalLabelSchema>;

export const LabelListInputSchema = z.strictObject({
  search: z.string().max(50).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type LabelListInput = z.infer<typeof LabelListInputSchema>;

export const LabelListOutputSchema = z.strictObject({
  items: z.array(ExternalLabelSchema).max(100),
});
export type LabelListOutput = z.infer<typeof LabelListOutputSchema>;

export const LabelResolveNamesInputSchema = z.strictObject({
  names: z.array(z.string().min(1).max(50)).max(50).default([]),
});
export type LabelResolveNamesInput = z.infer<typeof LabelResolveNamesInputSchema>;

export const LabelResolveNamesOutputSchema = z.strictObject({
  items: z.array(ExternalLabelSchema).max(50),
});
export type LabelResolveNamesOutput = z.infer<typeof LabelResolveNamesOutputSchema>;

export * from './writes';
export * from './routine-reads';

export * from './assisted';

export * from './notifications';
export * from './ai';
