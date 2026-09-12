import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const EDITOR_TABLES = [
  'editor_workspaces',
  'editor_workspace_sessions',
  'editor_workspace_session_groups',
  'editor_workspace_session_group_tabs',
] as const;

describe('EDITOR-1702 legacy Editor persistence retirement', () => {
  const repoRoot = resolve(__dirname, '../../../../../../../');
  const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

  it('deletes the legacy Prisma models, natural-key bootstrap and portable DTO/projection/importer', () => {
    for (const path of [
      'packages/database/prisma/schema/editor.prisma',
      'packages/database/scripts/prepare-editor-workspace-natural-key.ts',
      'packages/database/src/schema/editor-workspace-natural-key.ts',
      'packages/contracts/src/modules/data-portability/dtos/portable-editor.dto.ts',
      'packages/data-portability/src/server/application/use-cases/projections/editor.projection.ts',
      'packages/data-portability/src/server/application/use-cases/importers/editor.importer.ts',
    ]) {
      expect(existsSync(resolve(repoRoot, path)), path).toBe(false);
    }
  });

  it('keeps every legacy Editor table out of Prisma, PowerSync and sync/upload mappings', () => {
    const surfaces = [
      read('packages/database/prisma/schema/account.prisma'),
      read('packages/powersync-schema/src/index.ts'),
      read('docker/powersync/sync-config.yaml'),
      read('apps/api/src/modules/powersync/table-mapping.ts'),
      read('apps/api/src/modules/powersync/crud-normalization.ts'),
      read('apps/desktop/src/main/database/powersync.ts'),
    ];
    for (const table of EDITOR_TABLES) {
      for (const source of surfaces) expect(source).not.toContain(table);
    }
    expect(surfaces[0]).not.toMatch(/EditorWorkspace/);
  });

  it('deletes Editor repository and import-store capabilities from data portability production code', () => {
    const surfaces = [
      read('packages/data-portability/src/server/application/data-portability.dependencies.ts'),
      read('packages/data-portability/src/server/application/import-store/data-portability-import-store.ts'),
      read('packages/data-portability/src/server/infrastructure/adapters/prisma-adapters.ts'),
      read('packages/data-portability/src/server/infrastructure/prisma.ts'),
      read('packages/data-portability/src/server/infrastructure/powersync/powersync-export-dependencies.ts'),
      read('packages/data-portability/src/server/infrastructure/powersync/powersync-import-store.ts'),
      read('packages/data-portability/src/server/infrastructure/import-store/prisma-data-portability-import-store.ts'),
    ];
    for (const source of surfaces) {
      expect(source).not.toMatch(/EditorWorkspace|editorWorkspace|createEditor/);
    }
  });
});
