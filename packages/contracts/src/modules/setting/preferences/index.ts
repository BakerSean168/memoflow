/**
 * Setting Preferences — Zod-first per-category preference types & schemas
 *
 * Types are inferred from Zod schemas (single source of truth).
 * Defaults are auto-generated from Zod `.default()` values.
 */

export type {
  AppearancePreferences,
  LocalePreferences,
  WorkflowPreferences,
  PrivacyPreferences,
  NotificationPreferences,
  ShortcutPreferences,
  ExperimentalPreferences,
  UIStatePreferences,
  AIPreferences,
  UserSettingPreferences,
} from './types';

export { getDefaultPreferences, PREFERENCE_CATEGORIES, type PreferenceCategory } from './defaults';

export {
  AppearanceSchema,
  LocaleSchema,
  WorkflowSchema,
  PrivacySchema,
  NotificationSchema,
  ShortcutsSchema,
  ExperimentalSchema,
  UISchema,
  AISchema,
  UserPreferencesSchema,
  CATEGORY_SCHEMAS,
} from './schemas';

export {
  DateStyleSchema,
  DEFAULT_USER_PREFERENCE_PROFILE,
  LocaleIdSchema,
  PREFERENCE_NAMESPACES,
  PREFERENCE_NAMESPACE_REGISTRY,
  PreferenceMutationReceiptSchema,
  PreferenceNamespaceResponseSchema,
  PreferenceNamespaceSchema,
  PreferenceRevisionConflictSchema,
  PresentationPreferencesPatchSchema,
  PresentationPreferencesSchema,
  RegionalPreferencesPatchSchema,
  RegionalPreferencesSchema,
  SUPPORTED_LOCALE_IDS,
  ThemeSchema,
  TimeStyleSchema,
  UserPreferenceProfileSchema,
  WeekStartsOnSchema,
  createDefaultPreferenceNamespace,
  createDefaultUserPreferenceProfile,
  parsePreferenceNamespace,
  parsePreferenceNamespacePatch,
  parsePreferenceNamespacePayload,
} from './canonical';

export type {
  LocaleId,
  PreferenceMutationReceipt,
  PreferenceNamespace,
  PreferenceNamespacePatch,
  PreferenceNamespacePatchMap,
  PreferenceNamespacePayload,
  PreferenceNamespacePayloadMap,
  PreferenceNamespaceResponse,
  PreferenceRevisionConflict,
  PresentationPreferences,
  RegionalPreferences,
  UserPreferenceProfile,
} from './canonical';
