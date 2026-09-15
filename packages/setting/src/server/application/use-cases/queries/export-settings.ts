/** Canonical V3 preference-only export. */
import {
  ExportSettingsResponseSchema,
  PreferencePortableDocumentV3Schema,
  type ExportSettingsRes,
} from '@memoflow/contracts/setting';
import type { PreferencePortableService } from '../../../preferences/preference-portability';

function exportFileName(exportedAt: string): string {
  return `memoflow-settings-${exportedAt.replace(/[:.]/g, '-')}.json`;
}

export class ExportSettings {
  constructor(
    private readonly portableService: PreferencePortableService,
    private readonly nowIsoString: () => string = () => new Date().toISOString(),
  ) {}

  async execute(identityId: string): Promise<ExportSettingsRes> {
    const document = PreferencePortableDocumentV3Schema.parse({
      schemaVersion: 3,
      exportedAt: this.nowIsoString(),
      preferences: await this.portableService.export(identityId),
    });

    return ExportSettingsResponseSchema.parse({
      data: JSON.stringify(document, null, 2),
      fileName: exportFileName(document.exportedAt),
    });
  }
}
