/** Canonical V3 preference-only import. Legacy v1/v2 files are unsupported under ADR-111. */
import {
  PreferencePortableDocumentV3Schema,
  PreferencePortableImportReceiptV3Schema,
  type PreferencePortableImportReceiptV3,
} from '@memoflow/contracts/setting';
import type { PreferencePortableService } from '../../../preferences/preference-portability';

export class ImportSettings {
  constructor(private readonly portableService: PreferencePortableService) {}

  async execute(
    identityId: string,
    data: unknown,
  ): Promise<PreferencePortableImportReceiptV3> {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const raw = data as Record<string, unknown>;
      if (raw.schemaVersion !== undefined && raw.schemaVersion !== 3) {
        throw new Error(
          `Unsupported preference import schemaVersion: ${String(raw.schemaVersion)}; only V3 is supported`,
        );
      }
      if ('version' in raw || 'settings' in raw) {
        throw new Error('Legacy preference import V1/V2 is unsupported under ADR-111');
      }
    }

    const parsed = PreferencePortableDocumentV3Schema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `Invalid preference V3 import: ${issue.path.join('.')} — ${issue.message}`,
      );
    }

    const receipt = await this.portableService.apply(identityId, parsed.data.preferences);
    return PreferencePortableImportReceiptV3Schema.parse({
      schemaVersion: 3,
      imported: receipt.created + receipt.updated,
      skipped: receipt.skipped,
      warnings: [...receipt.warnings],
    });
  }
}
