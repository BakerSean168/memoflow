/**
 * Account - Response Schemas (Zod)
 *
 * OpenAPI 响应体 Zod Schema，路由文件统一从此处导入。
 */

import { z } from 'zod';
import { brandedId, YmdSchema } from '../../../primitives';
import type { IdentityId } from '../value-objects/identity-id';
import { AccountStatus } from '../value-objects/account-status';
import { GenderType } from '../value-objects/gender-type';

/**
 * Account Response Schema
 *
 * Residual 825: AccountClientDTO dual retired — sole AccountResponseSchema + z.infer
 * (semantic type is z.infer alias in aggregates/account-client.ts).
 */
/**
 * Safe cloud-auth identity projection for Account views.
 * Authentication/session capability stays owned by Cloud Auth; this projection
 * deliberately excludes session ids, tokens and provider credentials.
 */
export const CloudIdentitySummarySchema = z.object({
  identityId: brandedId<IdentityId>(),
  email: z.string().email(),
  emailVerified: z.boolean(),
});
export type CloudIdentitySummary = z.infer<typeof CloudIdentitySummarySchema>;

export const AccountResponseSchema = z.object({
  id: brandedId<IdentityId>(),
  status: z.enum(AccountStatus),
  profile: z.object({
    nickname: z.string(),
    realName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    bio: z.string().nullable(),
    gender: z.enum(GenderType),
    birthday: YmdSchema.nullable(),
  }),
  createdAt: z.number(),
  updatedAt: z.number(),
  closedAt: z.union([z.number(), z.null()]),
});

/**
 * Composed Account read model. Product profile/lifecycle remains under
 * `account`; login identity is projected separately from Cloud Auth.
 */
export const AccountViewSchema = z.object({
  account: AccountResponseSchema,
  cloudIdentity: CloudIdentitySummarySchema.nullable(),
});
export type AccountView = z.infer<typeof AccountViewSchema>;
