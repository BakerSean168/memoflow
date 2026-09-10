/**
 * Setting Preference Defaults — Driven by Zod schemas
 *
 * `getDefaultPreferences()` parses an empty object through UserPreferencesSchema,
 * which fills in the live legacy remainder defaults automatically.
 * No manual default constants needed.
 */

import { UserPreferencesSchema } from './schemas/index';
import type { UserSettingPreferences } from './types';

// ─── Category list (derived from schema shape keys) ───────

export const PREFERENCE_CATEGORIES = Object.keys(
  UserPreferencesSchema.shape,
) as ReadonlyArray<PreferenceCategory>;

export type PreferenceCategory = keyof UserSettingPreferences;

// ─── Factory: create complete default preferences ─────────

export function getDefaultPreferences(): UserSettingPreferences {
  return UserPreferencesSchema.parse({});
}
