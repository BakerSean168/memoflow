import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PrismaRepositoryAdapter } from '../adapters/prisma-adapters';
import { PrismaDataPortabilityImportStore } from '../import-store/prisma-data-portability-import-store';

/**
 * Data Portability Prisma adapter placement surface.
 * 数据可移植性 Prisma 适配器归属的表面契约。
 *
 * RefArch Phase 1 Step 2: the concrete Prisma adapters and the Prisma import
 * store must live in `server/infrastructure`, and the Application layer must
 * only hold Port interfaces and use cases — no `PrismaClient` import, no
 * concrete adapter re-export through the Application barrels.
 *
 * 参考架构阶段 1 Step 2：具体 Prisma 适配器与 Prisma import store 必须位于
 * `server/infrastructure`，Application 层只保留 Port 接口与 use case ——
 * 不得 import `PrismaClient`，也不得通过 Application barrel 重新导出具体适配器。
 */
describe('data portability Prisma adapter placement', () => {
  it('defines the Prisma adapters and import store in server/infrastructure', () => {
    const adapterPath = resolve(
      __dirname,
      '../adapters/prisma-adapters.ts',
    );
    const importStorePath = resolve(
      __dirname,
      '../import-store/prisma-data-portability-import-store.ts',
    );

    expect(readFileSync(adapterPath, 'utf8')).toContain(
      "import type { PrismaClient } from '@memoflow/database';",
    );
    expect(readFileSync(importStorePath, 'utf8')).toContain(
      "import type { PrismaClient, Prisma } from '@memoflow/database';",
    );

    expect(PrismaRepositoryAdapter).toBeDefined();
    expect(PrismaDataPortabilityImportStore).toBeDefined();
  });

  it('application layer holds no Prisma import and no concrete adapter re-export', () => {
    const applicationIndex = readFileSync(
      resolve(__dirname, '../../application/index.ts'),
      'utf8',
    );
    const importStoreIndex = readFileSync(
      resolve(__dirname, '../../application/import-store/index.ts'),
      'utf8',
    );

    for (const source of [applicationIndex, importStoreIndex]) {
      expect(source).not.toMatch(/from '@memoflow\/database'/);
      expect(source).not.toMatch(/PrismaRepositoryAdapter|PrismaDataPortabilityImportStore/);
      expect(source).not.toMatch(/prisma-adapters|prisma-data-portability-import-store/);
    }
  });

  it('application import-store barrel exports the Port types and input types only', () => {
    const importStoreIndex = readFileSync(
      resolve(__dirname, '../../application/import-store/index.ts'),
      'utf8',
    );

    expect(importStoreIndex).toContain('DataPortabilityImportStore');
    expect(importStoreIndex).toContain('DataPortabilityImportTx');
    expect(importStoreIndex).toContain('UpsertUserPreferencesInput');
    expect(importStoreIndex).toContain('CreateAIMessageInput');
  });

  it('no production file under server/application imports PrismaClient', () => {
    const applicationDir = resolve(__dirname, '../../application');
    const productionFiles = collectTsFiles(applicationDir).filter(
      (file) => !/\.(spec|test)\.ts$/.test(file),
    );

    expect(productionFiles.length).toBeGreaterThan(0);
    for (const file of productionFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, `unexpected Prisma import in ${file}`).not.toMatch(
        /from '@memoflow\/database'/,
      );
    }
  });
});

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}
