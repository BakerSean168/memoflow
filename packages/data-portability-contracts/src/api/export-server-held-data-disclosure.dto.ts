/**
 * Export Server-held Data Disclosure — API request/response DTOs
 */

import { z } from 'zod';

export const ExportServerHeldDataDisclosureReqSchema = z.object({}).strict();

export type ExportServerHeldDataDisclosureReq = z.infer<
  typeof ExportServerHeldDataDisclosureReqSchema
>;

export const ExportServerHeldDataDisclosureResSchema = z
  .object({
    fileName: z.string(),
    content: z.string(),
    summary: z
      .object({
        entityCounts: z.record(z.string(), z.number().int().nonnegative()),
        cachedAttachmentBytes: z.number().int().nonnegative(),
        notes: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export type ExportServerHeldDataDisclosureRes = z.infer<
  typeof ExportServerHeldDataDisclosureResSchema
>;
