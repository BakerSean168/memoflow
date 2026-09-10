/**
 * Setting Preference Types — Derived from Zod schemas (single source of truth)
 *
 * All types are inferred from their corresponding Zod schemas.
 * To modify a type, update the schema in `./schemas/` instead.
 */

import type { z } from 'zod';
import type {
  AppearanceSchema,
  LocaleSchema,
  UserPreferencesSchema,
} from './schemas';

// ─── Per-Category Types (inferred from Zod) ──────────────

/** 外观设置 */
export type AppearancePreferences = z.infer<typeof AppearanceSchema>;

/** 区域/本地化设置 */
export type LocalePreferences = z.infer<typeof LocaleSchema>;

/** 聚合：所有偏好设置 */
export type UserSettingPreferences = z.infer<typeof UserPreferencesSchema>;
