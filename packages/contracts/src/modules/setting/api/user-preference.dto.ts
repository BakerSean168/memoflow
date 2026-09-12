import { z } from 'zod';
import {
  PreferenceMutationReceiptSchema,
  PreferenceNamespaceSchema,
  PreferenceRevisionConflictSchema,
  PresentationPreferencesPatchSchema,
  RegionalPreferencesPatchSchema,
} from '../preferences/canonical';

const ExpectedRevisionSchema = z.number().int().nonnegative().optional();

export const PatchPreferenceNamespaceBodySchema = z
  .object({
    patch: z.union([PresentationPreferencesPatchSchema, RegionalPreferencesPatchSchema]),
    expectedRevision: ExpectedRevisionSchema,
  })
  .strict();
export type PatchPreferenceNamespaceBody = z.infer<typeof PatchPreferenceNamespaceBodySchema>;

export const ResetPreferenceNamespaceBodySchema = z
  .object({ expectedRevision: ExpectedRevisionSchema })
  .strict();
export type ResetPreferenceNamespaceBody = z.infer<typeof ResetPreferenceNamespaceBodySchema>;

export const ResetUserPreferencesBodySchema = z
  .object({
    expectedRevisions: z
      .object({
        presentation: z.number().int().nonnegative().optional(),
        regional: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ResetUserPreferencesBody = z.infer<typeof ResetUserPreferencesBodySchema>;

export const PreferenceMutationResultSchema = z.union([
  PreferenceMutationReceiptSchema,
  PreferenceRevisionConflictSchema,
]);

export const ResetUserPreferencesResponseSchema = z
  .object({
    presentation: PreferenceMutationResultSchema,
    regional: PreferenceMutationResultSchema,
  })
  .strict();
export type ResetUserPreferencesResponse = z.infer<typeof ResetUserPreferencesResponseSchema>;

export const PreferenceNamespacePathSchema = z
  .object({ namespace: PreferenceNamespaceSchema })
  .strict();
