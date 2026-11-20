import { z } from 'zod';
import type { ExternalAgentAuditEntry } from '@memoflow/database';

/** Bounded owner query; identity always comes from the session, never the query string. */
export const ExternalAgentAuditQuerySchema = z
  .object({
    credentialId: z.string().trim().min(1).max(128).optional(),
    requestId: z.string().trim().min(1).max(128).optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .refine((value) => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to), {
    message: 'from must not be after to',
    path: ['from'],
  });

export interface ExternalAgentAuditQueryPort {
  list(
    identityId: string,
    filter: {
      readonly credentialId?: string;
      readonly requestId?: string;
      readonly from?: Date;
      readonly to?: Date;
      readonly limit?: number;
    },
  ): Promise<{ readonly items: readonly ExternalAgentAuditEntry[]; readonly hasMore: boolean }>;
}
