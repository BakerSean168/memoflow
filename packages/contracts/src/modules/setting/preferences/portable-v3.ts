import { z } from 'zod';
import { UserPreferenceProfileSchema } from './canonical';

/** Canonical payload owned by Setting when embedded in Data Portability V3. */
export const PreferencePortablePayloadV3Schema = UserPreferenceProfileSchema;
export type PreferencePortablePayloadV3 = z.infer<typeof PreferencePortablePayloadV3Schema>;

/** Standalone preference-only backup format used by the Settings UI. */
export const PreferencePortableDocumentV3Schema = z
  .object({
    schemaVersion: z.literal(3),
    exportedAt: z.string().datetime(),
    preferences: PreferencePortablePayloadV3Schema,
  })
  .strict();
export type PreferencePortableDocumentV3 = z.infer<typeof PreferencePortableDocumentV3Schema>;

/** Result returned by the canonical preference-only import owner. */
export const PreferencePortableImportReceiptV3Schema = z
  .object({
    schemaVersion: z.literal(3),
    imported: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    warnings: z.array(z.string()),
  })
  .strict();
export type PreferencePortableImportReceiptV3 = z.infer<
  typeof PreferencePortableImportReceiptV3Schema
>;
