/**
 * Data Portability V3 product-surface request and response contracts.
 *
 * Transport owns only the V3 envelope and receipt shape. Capability payloads
 * remain opaque here and are validated by their registering owner.
 */

import { z } from 'zod';
import {
  PortableCapabilityKeySchema,
  PortableBackupEnvelopeV3Schema,
} from '../dtos/portable-v3.dto';

export const ExportPortableDataV3ReqSchema = z
  .object({
    capabilities: z.array(PortableCapabilityKeySchema).optional(),
  })
  .strict();

export type ExportPortableDataV3Req = z.infer<typeof ExportPortableDataV3ReqSchema>;

export const ExportPortableDataV3ResSchema = z
  .object({
    fileName: z.string().min(1),
    content: z.string().min(1),
    summary: z
      .object({
        capabilityKeys: z.array(PortableCapabilityKeySchema),
        warnings: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export type ExportPortableDataV3Res = z.infer<typeof ExportPortableDataV3ResSchema>;

export const PortableDataV3ImportReqSchema = z
  .object({
    content: z.string().max(10_000_000, 'Import content exceeds 10 MB limit'),
  })
  .strict();

export type PortableDataV3ImportReq = z.infer<typeof PortableDataV3ImportReqSchema>;

const PortableDataV3ReceiptEntrySchema = z
  .object({
    key: PortableCapabilityKeySchema,
    schemaVersion: z.number().int().positive(),
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    warnings: z.array(z.string()),
  })
  .strict();

export const PortableDataV3ImportResSchema = z
  .object({
    batchId: z.string().min(1),
    dryRun: z.boolean(),
    capabilities: z.array(PortableDataV3ReceiptEntrySchema),
    created: z.record(z.string(), z.number().int().nonnegative()),
    updated: z.record(z.string(), z.number().int().nonnegative()),
    skipped: z.record(z.string(), z.number().int().nonnegative()),
    warnings: z.array(z.string()),
  })
  .strict();

export type PortableDataV3ImportRes = z.infer<typeof PortableDataV3ImportResSchema>;

/** Kept as a contract-level assertion so transport changes cannot loosen the envelope. */
export const PortableDataV3EnvelopeSchema = PortableBackupEnvelopeV3Schema;
