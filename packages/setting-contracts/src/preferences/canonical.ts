import { z } from 'zod';
import { TimeZoneIdSchema, type TimeZoneId } from '@memoflow/shared-primitives';

export const PREFERENCE_NAMESPACES = ['presentation', 'regional'] as const;

export const PreferenceNamespaceSchema = z.enum(PREFERENCE_NAMESPACES);
export type PreferenceNamespace = z.infer<typeof PreferenceNamespaceSchema>;

/** Product locales currently supported by the shared presentation surface. */
export const SUPPORTED_LOCALE_IDS = ['zh-CN', 'en-US'] as const;
export const LocaleIdSchema = z.enum(SUPPORTED_LOCALE_IDS);
export type LocaleId = z.infer<typeof LocaleIdSchema>;

export const ThemeSchema = z.enum(['light', 'dark', 'auto']);
export const ACCENT_VALUES = [
  'brand-gold',
  'linear-indigo',
  'ocean-blue',
  'emerald-green',
  'rose-red',
  'violet',
] as const;
export const AccentSchema = z.enum(ACCENT_VALUES);

export interface AccentModeColor {
  /** Raw HSL channels, e.g. "37 91% 40%" */
  hsl: string;
  /** Ready-to-use CSS color string, e.g. "hsl(37 91% 40%)" */
  color: string;
}

export interface AccentColorDefinition {
  light: AccentModeColor;
  dark: AccentModeColor;
}

/**
 * Single source of truth for accent tokens mirroring theme.css primary tokens.
 * Locked by theme.semantic-tokens.spec.ts.
 */
export const ACCENT_PALETTES: Record<Accent, AccentColorDefinition> = {
  'brand-gold': {
    light: { hsl: '37 91% 40%', color: 'hsl(37 91% 40%)' },
    dark: { hsl: '37 91% 55%', color: 'hsl(37 91% 55%)' },
  },
  'linear-indigo': {
    light: { hsl: '235 58% 56%', color: 'hsl(235 58% 56%)' },
    dark: { hsl: '235 58% 60%', color: 'hsl(235 58% 60%)' },
  },
  'ocean-blue': {
    light: { hsl: '199 89% 34%', color: 'hsl(199 89% 34%)' },
    dark: { hsl: '199 89% 60%', color: 'hsl(199 89% 60%)' },
  },
  'emerald-green': {
    light: { hsl: '160 84% 26%', color: 'hsl(160 84% 26%)' },
    dark: { hsl: '160 70% 52%', color: 'hsl(160 70% 52%)' },
  },
  'rose-red': {
    light: { hsl: '347 77% 48%', color: 'hsl(347 77% 48%)' },
    dark: { hsl: '347 77% 52%', color: 'hsl(347 77% 52%)' },
  },
  violet: {
    light: { hsl: '262 83% 52%', color: 'hsl(262 83% 52%)' },
    dark: { hsl: '262 83% 58%', color: 'hsl(262 83% 58%)' },
  },
};

export function getAccentColor(accent: unknown, mode: 'light' | 'dark'): string {
  const parsed = AccentSchema.safeParse(accent);
  if (parsed.success) {
    return ACCENT_PALETTES[parsed.data][mode].color;
  }
  return typeof accent === 'string' && accent.length > 0
    ? accent
    : ACCENT_PALETTES['brand-gold'][mode].color;
}

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
    accent: AccentSchema.optional(),
    lightAccent: AccentSchema.optional(),
    darkAccent: AccentSchema.optional(),
  })
  .strict()
  .transform((data) => {
    const fallback = data.accent ?? 'brand-gold';
    const lightAccent = data.lightAccent ?? fallback;
    const darkAccent = data.darkAccent ?? fallback;
    const accent = data.accent ?? (data.theme === 'dark' ? darkAccent : lightAccent);
    return {
      theme: data.theme,
      language: data.language,
      accent,
      lightAccent,
      darkAccent,
    };
  });

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
export type Accent = z.infer<typeof AccentSchema>;
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
    accent: AccentSchema.optional(),
    lightAccent: AccentSchema.optional(),
    darkAccent: AccentSchema.optional(),
  })
  .strict()
  .transform((data) => {
    if (data.accent !== undefined) {
      return {
        ...data,
        lightAccent: data.lightAccent ?? data.accent,
        darkAccent: data.darkAccent ?? data.accent,
      };
    }
    return data;
  });

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
    accent: 'brand-gold',
    lightAccent: 'brand-gold',
    darkAccent: 'brand-gold',
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
