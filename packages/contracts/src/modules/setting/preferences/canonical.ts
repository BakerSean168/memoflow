import { z } from 'zod';
import { TimeZoneIdSchema, type TimeZoneId } from '../../../primitives';

export const PREFERENCE_NAMESPACES = ['presentation', 'regional'] as const;

export const PreferenceNamespaceSchema = z.enum(PREFERENCE_NAMESPACES);
export type PreferenceNamespace = z.infer<typeof PreferenceNamespaceSchema>;

/** Product locales currently supported by the shared presentation surface. */
export const SUPPORTED_LOCALE_IDS = ['zh-CN', 'en-US'] as const;
export const LocaleIdSchema = z.enum(SUPPORTED_LOCALE_IDS);
export type LocaleId = z.infer<typeof LocaleIdSchema>;

export const ThemeSchema = z.enum(['light', 'dark', 'auto']);
export const DateStyleSchema = z.enum(['short', 'medium', 'long']);
export const TimeStyleSchema = z.enum(['12h', '24h']);
export const WeekStartsOnSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const PresentationPreferencesSchema = z
  .object({
    theme: ThemeSchema,
    language: LocaleIdSchema,
  })
  .strict();

export const RegionalPreferencesSchema = z
  .object({
    timeZone: TimeZoneIdSchema,
    dateStyle: DateStyleSchema,
    timeStyle: TimeStyleSchema,
    weekStartsOn: WeekStartsOnSchema,
  })
  .strict();

export const UserPreferenceProfileSchema = z
  .object({
    presentation: PresentationPreferencesSchema,
    regional: RegionalPreferencesSchema,
  })
  .strict();

export type PresentationPreferences = z.infer<typeof PresentationPreferencesSchema>;
export type RegionalPreferences = z.infer<typeof RegionalPreferencesSchema>;
export type UserPreferenceProfile = z.infer<typeof UserPreferenceProfileSchema>;

export interface PreferenceNamespacePayloadMap {
  presentation: PresentationPreferences;
  regional: RegionalPreferences;
}

export type PreferenceNamespacePayload<N extends PreferenceNamespace = PreferenceNamespace> =
  PreferenceNamespacePayloadMap[N];

export const PresentationPreferencesPatchSchema = z
  .object({
    theme: ThemeSchema.optional(),
    language: LocaleIdSchema.optional(),
  })
  .strict();

export const RegionalPreferencesPatchSchema = z
  .object({
    timeZone: TimeZoneIdSchema.optional(),
    dateStyle: DateStyleSchema.optional(),
    timeStyle: TimeStyleSchema.optional(),
    weekStartsOn: WeekStartsOnSchema.optional(),
  })
  .strict();

export interface PreferenceNamespacePatchMap {
  presentation: z.infer<typeof PresentationPreferencesPatchSchema>;
  regional: z.infer<typeof RegionalPreferencesPatchSchema>;
}

export type PreferenceNamespacePatch<N extends PreferenceNamespace = PreferenceNamespace> =
  PreferenceNamespacePatchMap[N];

/** Closed namespace registry used by future application and persistence adapters. */
export const PREFERENCE_NAMESPACE_REGISTRY = {
  presentation: {
    schema: PresentationPreferencesSchema,
    patchSchema: PresentationPreferencesPatchSchema,
  },
  regional: {
    schema: RegionalPreferencesSchema,
    patchSchema: RegionalPreferencesPatchSchema,
  },
} as const;

const RevisionSchema = z.number().int().nonnegative();
const MutationRevisionSchema = z.number().int().positive();
const ChangedKeysSchema = z.array(z.string().min(1));

const PresentationNamespaceResponseSchema = z
  .object({
    namespace: z.literal('presentation'),
    preferences: PresentationPreferencesSchema,
    revision: RevisionSchema,
  })
  .strict();

const RegionalNamespaceResponseSchema = z
  .object({
    namespace: z.literal('regional'),
    preferences: RegionalPreferencesSchema,
    revision: RevisionSchema,
  })
  .strict();

export const PreferenceNamespaceResponseSchema = z.discriminatedUnion('namespace', [
  PresentationNamespaceResponseSchema,
  RegionalNamespaceResponseSchema,
]);
export type PreferenceNamespaceResponse = z.infer<typeof PreferenceNamespaceResponseSchema>;

const PresentationMutationReceiptSchema = z
  .object({
    namespace: z.literal('presentation'),
    revision: MutationRevisionSchema,
    changedKeys: ChangedKeysSchema,
  })
  .strict();

const RegionalMutationReceiptSchema = z
  .object({
    namespace: z.literal('regional'),
    revision: MutationRevisionSchema,
    changedKeys: ChangedKeysSchema,
  })
  .strict();

export const PreferenceMutationReceiptSchema = z.discriminatedUnion('namespace', [
  PresentationMutationReceiptSchema,
  RegionalMutationReceiptSchema,
]);
export type PreferenceMutationReceipt = z.infer<typeof PreferenceMutationReceiptSchema>;

const PresentationRevisionConflictSchema = z
  .object({
    code: z.literal('preference_revision_conflict'),
    namespace: z.literal('presentation'),
    expectedRevision: RevisionSchema,
    latest: PresentationNamespaceResponseSchema,
  })
  .strict();

const RegionalRevisionConflictSchema = z
  .object({
    code: z.literal('preference_revision_conflict'),
    namespace: z.literal('regional'),
    expectedRevision: RevisionSchema,
    latest: RegionalNamespaceResponseSchema,
  })
  .strict();

export const PreferenceRevisionConflictSchema = z.discriminatedUnion('namespace', [
  PresentationRevisionConflictSchema,
  RegionalRevisionConflictSchema,
]);
export type PreferenceRevisionConflict = z.infer<typeof PreferenceRevisionConflictSchema>;

const DEFAULT_TIME_ZONE = TimeZoneIdSchema.parse('UTC');

export const DEFAULT_USER_PREFERENCE_PROFILE: UserPreferenceProfile = Object.freeze({
  presentation: Object.freeze({
    theme: 'auto',
    language: 'zh-CN',
  }),
  regional: Object.freeze({
    timeZone: DEFAULT_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: '24h',
    weekStartsOn: 1,
  }),
});

/** Pure canonical defaults; no identity, entity id, or persistence metadata. */
export function createDefaultUserPreferenceProfile(): UserPreferenceProfile {
  return {
    presentation: { ...DEFAULT_USER_PREFERENCE_PROFILE.presentation },
    regional: { ...DEFAULT_USER_PREFERENCE_PROFILE.regional },
  };
}

/** Returns pure defaults for one registered namespace. */
export function createDefaultPreferenceNamespace<N extends PreferenceNamespace>(
  namespace: N,
): PreferenceNamespacePayload<N> {
  const validatedNamespace = PreferenceNamespaceSchema.parse(namespace);
  const profile = createDefaultUserPreferenceProfile();
  return { ...profile[validatedNamespace] } as PreferenceNamespacePayload<N>;
}

export function parsePreferenceNamespace(value: unknown): PreferenceNamespace {
  return PreferenceNamespaceSchema.parse(value);
}

export function parsePreferenceNamespacePayload<N extends PreferenceNamespace>(
  namespace: N,
  value: unknown,
): PreferenceNamespacePayload<N> {
  const validatedNamespace = parsePreferenceNamespace(namespace);
  return PREFERENCE_NAMESPACE_REGISTRY[validatedNamespace].schema.parse(
    value,
  ) as PreferenceNamespacePayload<N>;
}

export function parsePreferenceNamespacePatch<N extends PreferenceNamespace>(
  namespace: N,
  value: unknown,
): PreferenceNamespacePatch<N> {
  const validatedNamespace = parsePreferenceNamespace(namespace);
  return PREFERENCE_NAMESPACE_REGISTRY[validatedNamespace].patchSchema.parse(
    value,
  ) as PreferenceNamespacePatch<N>;
}

export type { TimeZoneId };
