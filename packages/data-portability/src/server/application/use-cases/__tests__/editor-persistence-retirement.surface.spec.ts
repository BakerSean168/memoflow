import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('retired Editor persistence remains absent', () => {
  const repoRoot = resolve(__dirname, '../../../../../../../');

  it('keeps the legacy Editor persistence and Data Portability projections deleted', () => {
    for (const path of [
      'packages/database/prisma/schema/editor.prisma',
      'packages/database/scripts/prepare-editor-workspace-natural-key.ts',
      'packages/database/src/schema/editor-workspace-natural-key.ts',
      'packages/data-portability/src/server/application/use-cases/projections/editor.projection.ts',
      'packages/data-portability/src/server/application/use-cases/importers/editor.importer.ts',
    ]) {
      expect(existsSync(resolve(repoRoot, path)), path).toBe(false);
    }
  });

  it('keeps the retired Editor tables out of sync mappings', () => {
    const sources = [
      readFileSync(resolve(repoRoot, 'packages/powersync-schema/src/index.ts'), 'utf8'),
      readFileSync(resolve(repoRoot, 'docker/powersync/sync-config.yaml'), 'utf8'),
      readFileSync(resolve(repoRoot, 'apps/api/src/modules/powersync/table-mapping.ts'), 'utf8'),
      readFileSync(resolve(repoRoot, 'apps/desktop/src/main/database/powersync.ts'), 'utf8'),
    ];
    for (const source of sources) expect(source).not.toMatch(/editor_workspaces|EditorWorkspace/);
  });
});
