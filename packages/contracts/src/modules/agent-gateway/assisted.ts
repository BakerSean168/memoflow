import { z } from 'zod';
import { TaskCreateClientInputSchema, AIWorkflowRunViewSchema } from '../ai';
import { GatewayTaskReceiptSchema } from './writes';

/** Consent pins an existing user-owned model setting; never accepts provider credentials. */
export const AssistedConsentSchema = z.strictObject({
  providerId: z.string().min(1),
  providerVersion: z.number().int().positive(),
  modelId: z.string().min(1),
  acceptFees: z.literal(true),
});
export const AssistedStartSchema = z.strictObject({
  idempotencyKey: z.string().trim().min(1).max(200),
  kind: z.literal('task.create'),
  input: TaskCreateClientInputSchema,
  consent: AssistedConsentSchema,
});
export const AssistedHandleSchema = z.strictObject({
  handle: z.uuid(),
  expectedRevision: z.number().int().positive(),
});
export const AssistedResumeSchema = AssistedHandleSchema.extend({
  reviewToken: z.string().length(64),
  command: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('answer'), answers: z.array(z.string().trim().min(1)).min(1).max(3) }),
    z.strictObject({ type: z.literal('approve') }),
    z.strictObject({ type: z.literal('retry') }),
    z.strictObject({ type: z.literal('cancel_remaining') }),
  ]),
});
export const AssistedViewSchema = z.strictObject({
  handle: z.uuid(),
  revision: z.number().int().positive(),
  run: AIWorkflowRunViewSchema,
  reviewToken: z.string().length(64).optional(),
  /** Committed owner facts survive cancellation and workflow projection failures. */
  steps: z.array(GatewayTaskReceiptSchema),
});
export type AssistedStart = z.infer<typeof AssistedStartSchema>;
export type AssistedHandle = z.infer<typeof AssistedHandleSchema>;
export type AssistedResume = z.infer<typeof AssistedResumeSchema>;
export type AssistedView = z.infer<typeof AssistedViewSchema>;
