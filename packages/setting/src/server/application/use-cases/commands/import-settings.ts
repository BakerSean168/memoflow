/**
 * Import Settings
 *
 * 导入用户设置 — 支持合并或覆盖模式
 */

import type { IUserSettingRepository } from '../../../domain/repositories/i-user-setting-repository';
import { UserSetting } from '../../../domain/aggregates/user-setting';
import {
  CATEGORY_SCHEMAS,
  type UserSettingClientDTO,
  type UserSettingPreferences,
} from '@memoflow/contracts/setting';

const RETIRED_CATEGORIES = new Set([
  'workflow',
  'privacy',
  'shortcuts',
  'experimental',
  'ui',
  'ai',
]);

const LIVE_CATEGORIES = new Set(['appearance', 'locale']);

export class ImportSettings {
  constructor(private readonly userSettingRepository: IUserSettingRepository) {}

  async execute(
    identityId: string,
    data: Record<string, unknown>,
    options?: { merge?: boolean },
  ): Promise<UserSettingClientDTO> {
    const { merge = false } = options ?? {};
    const importedPreferences = this.validateImportData(data);

    let setting = await this.userSettingRepository.findByIdentityId(identityId);

    if (!setting) {
      setting = UserSetting.create({ identityId });
    }

    if (merge) {
      // 合并模式：只覆盖提供的分类/字段
      setting.importPreferences(importedPreferences);
    } else {
      // 覆盖模式：先重置，再导入
      setting.resetAll();
      setting.importPreferences(importedPreferences);
    }

    await this.userSettingRepository.save(setting);
    return setting.toClientDTO();
  }

  private validateImportData(data: Record<string, unknown>): Partial<UserSettingPreferences> {
    if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
      throw new Error('Invalid import data: missing settings field');
    }

    if (!data.version) {
      throw new Error('Invalid import data: missing version field');
    }

    const supportedVersions = ['1.0.0', '2.0.0'];
    if (!supportedVersions.includes(data.version as string)) {
      throw new Error(`Unsupported settings version: ${data.version}`);
    }

    const settings = data.settings as Record<string, unknown>;
    for (const category of Object.keys(settings)) {
      if (RETIRED_CATEGORIES.has(category)) {
        const privacy = settings.privacy;
        if (
          category === 'privacy' &&
          privacy &&
          typeof privacy === 'object' &&
          !Array.isArray(privacy) &&
          (privacy as Record<string, unknown>).shareUsageData === true
        ) {
          throw new Error(
            'Rejected retired setting privacy.shareUsageData=true: explicit re-consent is required; import was not saved',
          );
        }
        throw new Error(`Rejected retired UserSetting category: ${category}`);
      }
      if (!LIVE_CATEGORIES.has(category)) {
        throw new Error(`Rejected unknown UserSetting category: ${category}`);
      }
    }

    const locale = settings.locale;
    if (
      locale &&
      typeof locale === 'object' &&
      !Array.isArray(locale) &&
      Object.prototype.hasOwnProperty.call(locale, 'currency')
    ) {
      throw new Error(
        'Rejected retired setting locale.currency: currency is not imported or applied; import was not saved',
      );
    }

    const parsed: Record<string, unknown> = {};
    for (const [category, value] of Object.entries(settings)) {
      const schema = CATEGORY_SCHEMAS[category as keyof typeof CATEGORY_SCHEMAS];
      const result = schema.partial().strict().safeParse(value);
      if (!result.success) {
        const details = result.error.issues
          .map((issue) => `${[category, ...issue.path].join('.')}: ${issue.message}`)
          .join('; ');
        throw new Error(`Rejected invalid UserSetting import: ${details}`);
      }
      parsed[category] = result.data;
    }

    return parsed as Partial<UserSettingPreferences>;
  }
}
