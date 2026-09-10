/**
 * User Preferences Zod Schemas — Single Source of Truth
 *
 * All preference types, defaults, and validation are derived from these Zod schemas.
 * Adding a new field: add to the relevant category schema with a `.default()` value.
 * Adding a new category: create a new schema file, import here, and add it to UserPreferencesSchema.
 */

import { z } from 'zod';
import { AppearanceSchema } from './appearance.schema';
import { LocaleSchema } from './locale.schema';

export const UserPreferencesSchema = z.object({
  appearance: AppearanceSchema.default(() => AppearanceSchema.parse({})),
  locale: LocaleSchema.default(() => LocaleSchema.parse({})),
}).strict();

/** Map of category name → category Zod schema */
export const CATEGORY_SCHEMAS = {
  appearance: AppearanceSchema,
  locale: LocaleSchema,
} as const;

export {
  AppearanceSchema,
  LocaleSchema,
};
