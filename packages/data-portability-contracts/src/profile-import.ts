import { z } from 'zod';
import { PortableCapabilityKeySchema, PortableReferenceV3Schema } from './dtos/portable-v3.dto';
import { PortableDataV3ImportResSchema } from './api/portable-v3.dto';

// The existing HTTP body limit is 256 KiB; JSON-string wrapping stays below it.
export const PROFILE_IMPORT_MAX_BYTES = 100_000;

/**
 * Stable Profile import failure codes. This is the single definition; the
 * server error class derives both its type and HTTP status from it.
 */
export const PROFILE_IMPORT_ERROR_CODES = [
  'TARGET_UNAVAILABLE',
  'TARGET_NOT_EMPTY',
  'TARGET_UNKNOWN',
  'TARGET_CHANGED',
  'IMPORT_REQUEST_CONFLICT',
  'IMPORT_NOT_COMMITTED',
  'IMPORT_PREFLIGHT_REQUIRED',
  'IMPORT_NOT_FOUND',
  'IMPORT_ARCHIVE_REQUIRED',
  'IMPORT_ARCHIVE_MISMATCH',
  'IMPORT_ARCHIVE_UNAVAILABLE',
  'IMPORT_VERIFICATION_FAILED',
  'IMPORT_LIMIT_EXCEEDED',
] as const;
export const ProfileImportErrorCodeSchema = z.enum(PROFILE_IMPORT_ERROR_CODES);
export type ProfileImportErrorCode = z.infer<typeof ProfileImportErrorCodeSchema>;
export const ProfileImportRequestSchema = z
  .object({
    requestId: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/),
    content: z
      .string()
      .max(PROFILE_IMPORT_MAX_BYTES)
      .refine(
        (value) => new TextEncoder().encode(value).byteLength <= PROFILE_IMPORT_MAX_BYTES,
        'Import exceeds the UTF-8 byte limit',
      ),
  })
  .strict();
const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const ProfileImportCommitRequestSchema = ProfileImportRequestSchema.extend({
  effectiveDigest: DigestSchema,
});
export const ProfileImportBlockerSchema = z
  .object({
    capability: z.string().min(1),
    reason: z.enum([
      'preserved_target',
      'unsupported_user_data',
      'unknown',
      // #865 design §2.7/§6: per-table Mastra coverage blockers keep their own
      // stable codes so an explicit exclusion is distinguishable from unknown data.
      'storage/mastra.db:messages-uncovered',
      'storage/mastra.db:resources',
      'storage/mastra.db:unsupported-runtime-state',
      'storage/mastra.db:orphan-thread',
    ]),
    field: z.string().min(1),
  })
  .strict();
export const ProfileImportBindingSchema = z
  .object({ ref: PortableReferenceV3Schema, targetKey: z.string().min(1) })
  .strict();
export const ProfileImportManifestSchema = z
  .object({
    key: PortableCapabilityKeySchema,
    schemaVersion: z.number().int().positive(),
    digest: DigestSchema,
  })
  .strict();
export const ProfileImportPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    operationId: z.string().min(1),
    requestId: ProfileImportRequestSchema.shape.requestId,
    batchId: z.string().min(1),
    sourceDigest: DigestSchema,
    effectiveDigest: DigestSchema,
    blockers: z.array(ProfileImportBlockerSchema),
    preview: PortableDataV3ImportResSchema,
  })
  .strict();
export const ProfileImportCommittedSchema = z
  .object({
    status: z.literal('committed'),
    plan: ProfileImportPlanSchema,
    receipt: PortableDataV3ImportResSchema,
    bindings: z.array(ProfileImportBindingSchema),
    manifests: z.array(ProfileImportManifestSchema),
    committedAt: z.iso.datetime(),
    serverVerified: z.boolean(),
  })
  .strict();
export const ProfileImportOperationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending'), plan: ProfileImportPlanSchema }).strict(),
  ProfileImportCommittedSchema,
]);
export type ProfileImportRequest = z.infer<typeof ProfileImportRequestSchema>;
export type ProfileImportCommitRequest = z.infer<typeof ProfileImportCommitRequestSchema>;
export type ProfileImportBlocker = z.infer<typeof ProfileImportBlockerSchema>;
export type ProfileImportBinding = z.infer<typeof ProfileImportBindingSchema>;
export type ProfileImportManifest = z.infer<typeof ProfileImportManifestSchema>;
export type ProfileImportPlan = z.infer<typeof ProfileImportPlanSchema>;
export type ProfileImportCommitted = z.infer<typeof ProfileImportCommittedSchema>;
export type ProfileImportOperation = z.infer<typeof ProfileImportOperationSchema>;
