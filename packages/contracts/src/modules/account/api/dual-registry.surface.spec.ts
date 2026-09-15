/**
 * Dual registry suite (elegance E3b tax cut).
 * AccountClientDTO / AccountView ownership lock.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// --- merged from account-client-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 825: AccountClientDTO dual body retired.
   * Sole AccountResponseSchema + z.infer (semantic ClientDTO is z.infer alias).
   */
  describe('account client dto dual retired (residual 825)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const aggregate = readFileSync(resolve(apiDir, '../aggregates/account-client.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../account/src/api/routes.ts'),
      'utf8',
    );

    it('owns AccountClientDTO as z.infer of AccountResponseSchema', () => {
      expect(aggregate).toContain('Residual 825');
      expect(aggregate).toContain("from '../api/response-schemas'");
      expect(aggregate).toContain(
        'export type AccountClientDTO = z.infer<typeof AccountResponseSchema>',
      );
      expect(aggregate).not.toMatch(/export interface AccountClientDTO\b/);
    });

    it('AccountResponseSchema owns product profile and permanently excludes auth/settings/contact shadows', () => {
      expect(responseSchemas).toContain('Residual 825');
      expect(responseSchemas).toContain('export const AccountResponseSchema = z.object({');
      expect(responseSchemas).toContain('id: brandedId<IdentityId>()');
      expect(responseSchemas).toContain('profile: z.object({');
      expect(responseSchemas).not.toContain('settings: z.object({');
      expect(responseSchemas).not.toContain('email: z.object({');
      expect(responseSchemas).not.toContain('phone: z');
      expect(responseSchemas).not.toContain('version: z.number()');
    });

    it('OpenAPI profile routes expose AccountViewSchema without recreating an Account response body', () => {
      expect(routes).toContain('AccountViewSchema');
      expect(routes).toContain("successResponse(AccountViewSchema, '获取成功')");
      expect(routes).toContain("successResponse(AccountViewSchema, '更新成功')");
      expect(routes).not.toContain("successResponse(AccountResponseSchema, '获取成功')");
      expect(routes).not.toContain("successResponse(AccountResponseSchema, '更新成功')");
      expect(routes).not.toContain('AccountResponseSchema.shape.settings');
      expect(routes).not.toContain("path: '/me/settings'");
    });
  });
}
