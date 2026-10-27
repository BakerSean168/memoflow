import { z } from 'zod';

export const CloseAccountSchema = z.object({
  idempotencyKey: z.string().optional(),
  reason: z.string().min(1, '请填写注销原因'),
  feedback: z.string().optional(),
});

export type CloseAccountReq = z.infer<typeof CloseAccountSchema>;

export const AccountClosurePhaseSchema = z.enum([
  'requested',
  'revoking',
  'revoked',
  'closing',
  'closed',
  'failed',
]);
export type AccountClosurePhase = z.infer<typeof AccountClosurePhaseSchema>;

export const AccountClosureStatusSchema = z.enum(['running', 'succeeded', 'failed']);
export type AccountClosureStatus = z.infer<typeof AccountClosureStatusSchema>;

export const AccountClosureReceiptSchema = z.object({
  operationId: z.string(),
  identityId: z.string(),
  idempotencyKey: z.string(),
  phase: AccountClosurePhaseSchema,
  status: AccountClosureStatusSchema,
  retryable: z.boolean(),
  signedOut: z.boolean(),
  attempts: z.number(),
  lastError: z.string().nullable(),
  createdAt: z.number(),
  finishedAt: z.number().nullable(),
  revokedSessions: z.number().optional(),
  piiCleanupStatus: z.string().nullable().optional(),
  piiReason: z.string().nullable().optional(),
});

export type AccountClosureReceiptDTO = z.infer<typeof AccountClosureReceiptSchema>;

/** Close account response carrying structured receipt for transport & client polling. */
export type CloseAccountRes = AccountClosureReceiptDTO;
