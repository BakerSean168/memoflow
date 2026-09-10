/** Canonical Setting controller shared by HTTP and IPC. */
import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import type { Context } from '@memoflow/contracts/shared';
import {
  ExportSettingsSchema,
  ImportSettingsSchema,
  PatchPreferenceNamespaceBodySchema,
  PreferenceNamespaceSchema,
  ResetPreferenceNamespaceBodySchema,
  ResetUserPreferencesBodySchema,
  parsePreferenceNamespacePatch,
  type PreferenceRevisionConflict,
} from '@memoflow/contracts/setting';
import { formatZodErrors } from '@memoflow/utils/result';
import type { SettingApplicationPort } from '../application';

export class SettingController {
  constructor(private readonly api: SettingApplicationPort) {}

  private preferenceConflict(result: unknown): result is PreferenceRevisionConflict {
    return Boolean(
      result &&
        typeof result === 'object' &&
        'code' in result &&
        result.code === 'preference_revision_conflict',
    );
  }

  private conflictResult(result: PreferenceRevisionConflict): Result<never> {
    return fail({
      code: 'CONFLICT',
      message: `Preference ${result.namespace} changed on another writer`,
    });
  }

  async getPreferenceProfile(ctx: Context): Promise<Result<unknown>> {
    return ok(await this.api.getPreferenceProfile(ctx.identityId));
  }

  async getPreferenceNamespace(namespaceInput: unknown, ctx: Context): Promise<Result<unknown>> {
    const parsed = PreferenceNamespaceSchema.safeParse(namespaceInput);
    if (!parsed.success) {
      return fail({ code: 'VALIDATION_ERROR', message: 'Invalid preference namespace' });
    }
    return ok(await this.api.getPreferenceNamespace(ctx.identityId, parsed.data));
  }

  async patchPreferenceNamespace(
    namespaceInput: unknown,
    input: unknown,
    ctx: Context,
  ): Promise<Result<unknown>> {
    const namespace = PreferenceNamespaceSchema.safeParse(namespaceInput);
    const body = PatchPreferenceNamespaceBodySchema.safeParse(input);
    if (!namespace.success || !body.success) {
      return fail({ code: 'VALIDATION_ERROR', message: 'Invalid preference mutation' });
    }
    let patch;
    try {
      patch = parsePreferenceNamespacePatch(namespace.data, body.data.patch);
    } catch {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Preference patch does not match namespace',
      });
    }
    const result = await this.api.patchPreferenceNamespace(
      ctx.identityId,
      namespace.data,
      patch,
      body.data.expectedRevision,
    );
    return this.preferenceConflict(result) ? this.conflictResult(result) : ok(result);
  }

  async resetPreferenceNamespace(
    namespaceInput: unknown,
    input: unknown,
    ctx: Context,
  ): Promise<Result<unknown>> {
    const namespace = PreferenceNamespaceSchema.safeParse(namespaceInput);
    const body = ResetPreferenceNamespaceBodySchema.safeParse(input);
    if (!namespace.success || !body.success) {
      return fail({ code: 'VALIDATION_ERROR', message: 'Invalid preference reset' });
    }
    const result = await this.api.resetPreferenceNamespace(
      ctx.identityId,
      namespace.data,
      body.data.expectedRevision,
    );
    return this.preferenceConflict(result) ? this.conflictResult(result) : ok(result);
  }

  async resetUserPreferences(input: unknown, ctx: Context): Promise<Result<unknown>> {
    const body = ResetUserPreferencesBodySchema.safeParse(input);
    if (!body.success) {
      return fail({ code: 'VALIDATION_ERROR', message: 'Invalid preference reset request' });
    }
    return ok(await this.api.resetUserPreferences(ctx.identityId, body.data.expectedRevisions));
  }

  async exportSettings(input: unknown, ctx: Context): Promise<Result<unknown>> {
    const parsed = ExportSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    return ok(await this.api.exportSettings(ctx.identityId));
  }

  async importSettings(input: unknown, ctx: Context): Promise<Result<unknown>> {
    const parsed = ImportSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }

    let importData: unknown;
    try {
      importData = JSON.parse(parsed.data.data) as unknown;
    } catch {
      return fail({ code: 'VALIDATION_ERROR', message: 'Invalid JSON in data field' });
    }

    return ok(await this.api.importSettings(ctx.identityId, importData));
  }
}
