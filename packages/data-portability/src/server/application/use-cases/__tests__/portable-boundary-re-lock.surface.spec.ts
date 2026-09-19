import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LEGACY_AUTHORITY =
  /ExportUserData|ImportUserData|UserDataExportEnvelopeV2|PortableUserDataV2|data-portability:(?:import|export-v2)|path:\s*['"]\/import['"]|data-portability\/import/;

function productionSources(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts')) {
      continue;
    }
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...productionSources(path));
    else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

describe('Data Portability V3-only anti-resurrection locks', () => {
  const repoRoot = resolve(__dirname, '../../../../../../../');

  it('has no V1/V2 Data Portability production authority', () => {
    const roots = [
      resolve(repoRoot, 'packages/data-portability/src'),
      resolve(repoRoot, 'packages/contracts/src/modules/data-portability'),
    ];
    const hits = roots
      .flatMap(productionSources)
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return LEGACY_AUTHORITY.test(source) ? [file] : [];
      });
    expect(hits).toEqual([]);
  });

  it('does not retain the retired V1/V2 source files or import route', () => {
    for (const path of [
      'packages/contracts/src/modules/data-portability/api/export-user-data.dto.ts',
      'packages/contracts/src/modules/data-portability/api/import-user-data.dto.ts',
      'packages/contracts/src/modules/data-portability/dtos/portable-envelope.dto.ts',
      'packages/data-portability/src/server/application/use-cases/export-user-data.use-case.ts',
      'packages/data-portability/src/server/application/use-cases/import-user-data.use-case.ts',
      'packages/data-portability/src/server/application/import-store/data-portability-import-store.ts',
      'packages/data-portability/src/server/infrastructure/powersync/powersync-import-store.ts',
    ]) {
      expect(existsSync(resolve(repoRoot, path)), path).toBe(false);
    }
  });

  it('keeps disclosure separate and rejects it at the V3 parser boundary', () => {
    const safety = readFileSync(
      resolve(repoRoot, 'packages/contracts/src/modules/data-portability/rules/import-safety.ts'),
      'utf8',
    );
    const disclosure = readFileSync(
      resolve(repoRoot, 'packages/data-portability/src/server/application/use-cases/export-server-held-data-disclosure.use-case.ts'),
      'utf8',
    );
    const channels = readFileSync(
      resolve(repoRoot, 'packages/contracts/src/electron/ipc-channels.ts'),
      'utf8',
    );
    expect(safety).toContain("kind === 'memoflow.server-held-data-disclosure'");
    expect(disclosure).toContain("importMode: 'not-importable'");
    expect(disclosure).toContain('includesImportableBusinessDataBackup: false');
    expect(channels).toContain("DRY_RUN: 'data-portability:dry-run'");
    expect(channels).toContain("APPLY: 'data-portability:apply'");
    expect(channels).not.toContain("IMPORT: 'data-portability:import'");
  });
});
