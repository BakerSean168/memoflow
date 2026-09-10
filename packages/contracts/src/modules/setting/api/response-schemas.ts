/**
 * Setting - Response Schemas (Zod)
 *
 * OpenAPI 响应体 Zod Schema，路由文件统一从此处导入。
 */

import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { IdentityId, SettingId } from '../../../primitives';
import { UserPreferencesSchema } from '../preferences/schemas';
import { PreferencePortableImportReceiptV3Schema } from '../preferences/portable-v3';

/**
 * UserSetting Response Schema
 *
 * Residual 823: UserSettingClientDTO dual retired — sole UserSettingResponseSchema + z.infer
 * (semantic type is z.infer alias in aggregates/user-setting-client.ts).
 */
export const UserSettingResponseSchema = z.object({
  id: brandedId<SettingId>(),
  identityId: brandedId<IdentityId>(),
  preferences: UserPreferencesSchema,
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * V3 preference-only export transport artifact. The JSON document itself is in `data`.
 */
export const ExportSettingsResponseSchema = z
  .object({
    data: z.string(),
    fileName: z.string(),
  })
  .strict();

/** V3 preference-only import receipt — single-source alias of the canonical receipt schema. */
export const ImportSettingsResponseSchema = PreferencePortableImportReceiptV3Schema;
