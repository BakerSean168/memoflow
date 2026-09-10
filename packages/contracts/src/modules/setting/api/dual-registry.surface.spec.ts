/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 3 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: setting-operation-res-dual.surface.spec.ts, settings-sync-res-dual.surface.spec.ts, user-setting-client-dto-dual.surface.spec.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// --- merged from setting-operation-res-dual.surface.spec.ts ---
{
  /**
   * Residual 633: SettingOperationRes partial dual envelope is retired.
   * Setting API responses use DTO / Result envelopes only (no { ok, message? }).
   *
   * Soft residual 823: UserSettingClientDTO dual retired via UserSettingResponseSchema
   * (see user-setting-client-dto-dual surface).
   */
  const here = dirname(fileURLToPath(import.meta.url));

  function read(name: string): string {
    return readFileSync(join(here, name), 'utf8');
  }

  describe('setting SettingOperationRes dual retired (residual 633)', () => {
    it('user-setting.dto does not define SettingOperationRes dual envelope', () => {
      const source = read('user-setting.dto.ts');
      expect(source).toContain('Residual 633');
      expect(source).not.toMatch(/export interface SettingOperationRes/);
      expect(source).not.toMatch(/SettingOperationRes\s*\{[^}]*ok:\s*boolean/);
      expect(source).toContain('PatchUserSettingRes = UserSettingClientDTO');
      expect(source).toContain('ResetUserSettingRes = UserSettingClientDTO');
      expect(source).toContain('GetUserSettingRes = UserSettingClientDTO');
    });

    it('setting api barrel still exports user-setting DTO surface', () => {
      const index = read('index.ts');
      expect(index).toContain("./user-setting.dto");
    });
  });
}

// --- merged from settings-sync-res-dual.surface.spec.ts ---
{
  /**
   * Residual 771: ExportSettingsRes / ImportSettingsRes dual bodies retired.
   * OpenAPI + transport use *ResponseSchema; Res are z.infer aliases.
   */
  describe('settings sync res duals retired (residual 771)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'sync.dto.ts'), 'utf8');
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const routes = readFileSync(
      resolve(apiDir, '../../../../../setting/src/api/routes.ts'),
      'utf8',
    );

    it('dto Res types are z.infer aliases without object dual bodies', () => {
      expect(dto).toContain('Residual 771');
      expect(dto).toContain("from './response-schemas'");
      expect(dto).toContain(
        'export type ExportSettingsRes = z.infer<typeof ExportSettingsResponseSchema>',
      );
      expect(dto).toContain(
        'export type ImportSettingsRes = z.infer<typeof ImportSettingsResponseSchema>',
      );
      expect(dto).not.toMatch(/export type ExportSettingsRes = \{/);
      expect(dto).not.toMatch(/export type ImportSettingsRes = \{/);
    });

    it('response-schemas owns the sole export body and aliases the canonical V3 import receipt', () => {
      expect(responseSchemas).toContain(
        'export const ExportSettingsResponseSchema = z',
      );
      expect(responseSchemas).toContain(
        'export const ImportSettingsResponseSchema = PreferencePortableImportReceiptV3Schema;',
      );
    });

    it('OpenAPI setting routes use shared response schemas', () => {
      expect(routes).toContain('ExportSettingsResponseSchema');
      expect(routes).toContain('ImportSettingsResponseSchema');
      expect(routes).toContain(
        "successResponse(ExportSettingsResponseSchema, '导出成功')",
      );
      expect(routes).toContain(
        "successResponse(ImportSettingsResponseSchema, '导入成功')",
      );
    });
  });
}

// --- merged from user-setting-client-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 823: UserSettingClientDTO dual body retired.
   * Sole UserSettingResponseSchema + z.infer (semantic ClientDTO is z.infer alias).
   */
  describe('user setting client dto dual retired (residual 823)', () => {
    const apiDir = __dirname;
    const responseSchemas = readFileSync(resolve(apiDir, 'response-schemas.ts'), 'utf8');
    const aggregate = readFileSync(
      resolve(apiDir, '../aggregates/user-setting-client.ts'),
      'utf8',
    );
    const routes = readFileSync(
      resolve(apiDir, '../../../../../setting/src/api/routes.ts'),
      'utf8',
    );

    it('owns UserSettingClientDTO as z.infer of UserSettingResponseSchema', () => {
      expect(aggregate).toContain('Residual 823');
      expect(aggregate).toContain("from '../api/response-schemas'");
      expect(aggregate).toContain(
        'export type UserSettingClientDTO = z.infer<typeof UserSettingResponseSchema>',
      );
      expect(aggregate).not.toMatch(/export interface UserSettingClientDTO\b/);
    });

    it('UserSettingResponseSchema owns id/identityId/preferences/version timestamps', () => {
      expect(responseSchemas).toContain('Residual 823');
      expect(responseSchemas).toContain(
        'export const UserSettingResponseSchema = z.object({',
      );
      expect(responseSchemas).toContain('identityId: brandedId<IdentityId>()');
      expect(responseSchemas).toContain('preferences: UserPreferencesSchema');
      expect(responseSchemas).toContain('version: z.number()');
      expect(responseSchemas).toContain('createdAt: z.number()');
      expect(responseSchemas).toContain('updatedAt: z.number()');
    });

    it('OpenAPI setting routes use UserSettingResponseSchema without local dual body', () => {
      expect(routes).toContain('UserSettingResponseSchema');
      expect(routes).toContain("successResponse(UserSettingResponseSchema, '获取成功')");
      expect(routes).toContain("successResponse(UserSettingResponseSchema, '更新成功')");
      expect(routes).toContain("successResponse(UserSettingResponseSchema, '重置成功')");
    });
  });
}
