/**
 * User Preferences Zod Schemas — Single Source of Truth
 *
 * All preference types, defaults, and validation are derived from these Zod schemas.
 * Adding a new field: add to the relevant category schema with a `.default()` value.
 * Adding a new category: create a new schema file, import here, add to UserPreferencesSchema.
 */

import { z } from 'zod';
import { AppearanceSchema } from './appearance.schema';
import { LocaleSchema } from './locale.schema';
import { WorkflowSchema } from './workflow.schema';
import { PrivacySchema } from './privacy.schema';
import { ShortcutsSchema } from './shortcuts.schema';
import { ExperimentalSchema } from './experimental.schema';
import { UISchema } from './ui.schema';
import { AISchema } from './ai.schema';

export const UserPreferencesSchema = z.object({
  appearance: AppearanceSchema.default(() => AppearanceSchema.parse({})),
  locale: LocaleSchema.default(() => LocaleSchema.parse({})),
  workflow: WorkflowSchema.default(() => WorkflowSchema.parse({})),
  privacy: PrivacySchema.default(() => PrivacySchema.parse({})),
  shortcuts: ShortcutsSchema.default(() => ShortcutsSchema.parse({})),
  experimental: ExperimentalSchema.default(() => ExperimentalSchema.parse({})),
  ui: UISchema.default(() => UISchema.parse({})),
  ai: AISchema.default(() => AISchema.parse({})),
});

/** Map of category name → category Zod schema */
export const CATEGORY_SCHEMAS = {
  appearance: AppearanceSchema,
  locale: LocaleSchema,
  workflow: WorkflowSchema,
  privacy: PrivacySchema,
  shortcuts: ShortcutsSchema,
  experimental: ExperimentalSchema,
  ui: UISchema,
  ai: AISchema,
} as const;

export {
  AppearanceSchema,
  LocaleSchema,
  WorkflowSchema,
  PrivacySchema,
  ShortcutsSchema,
  ExperimentalSchema,
  UISchema,
  AISchema,
};
