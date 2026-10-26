import { z } from 'zod';
import { OperationSourceSchema } from './timeline-entry';

export const OperationAuditActionSchema = z.enum(['replay', 'timeline_query']);

export const OperationAuditRecordSchema = z.object({
  id: z.string(),
  actorIdentityId: z.string(),
  source: OperationSourceSchema,
  operationId: z.string(),
  action: OperationAuditActionSchema,
  details: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type OperationAuditAction = z.infer<typeof OperationAuditActionSchema>;
export type OperationAuditRecord = z.infer<typeof OperationAuditRecordSchema>;

export const OperationAuditQuerySchema = z.object({
  identityId: z.string(),
  source: OperationSourceSchema.optional(),
  operationId: z.string().optional(),
  limit: z.number().int().positive().max(200).default(50),
});

export type OperationAuditQuery = z.infer<typeof OperationAuditQuerySchema>;
