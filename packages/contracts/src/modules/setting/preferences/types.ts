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
  WorkflowSchema,
  PrivacySchema,
  ShortcutsSchema,
  ExperimentalSchema,
  UISchema,
  AISchema,
  UserPreferencesSchema,
} from './schemas';

// ─── Per-Category Types (inferred from Zod) ──────────────

/** 外观设置 */
export type AppearancePreferences = z.infer<typeof AppearanceSchema>;

/** 区域/本地化设置 */
export type LocalePreferences = z.infer<typeof LocaleSchema>;

/** 工作流设置 */
export type WorkflowPreferences = z.infer<typeof WorkflowSchema>;

/** 隐私设置 */
export type PrivacyPreferences = z.infer<typeof PrivacySchema>;

/** 快捷键设置 */
export type ShortcutPreferences = z.infer<typeof ShortcutsSchema>;

/** 实验性功能 */
export type ExperimentalPreferences = z.infer<typeof ExperimentalSchema>;

/** UI 状态偏好 */
export type UIStatePreferences = z.infer<typeof UISchema>;

/** AI 偏好 */
export type AIPreferences = z.infer<typeof AISchema>;

/** 聚合：所有偏好设置 */
export type UserSettingPreferences = z.infer<typeof UserPreferencesSchema>;
