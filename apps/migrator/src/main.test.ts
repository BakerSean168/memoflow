import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMigrationCommands, hasPrismaMigrations, resolveDatabaseUrl } from './main';

describe('migrator interface', () => {
  it('constructs DATABASE_URL from DB fields without leaking encoding rules to Compose', () => {
    expect(
      resolveDatabaseUrl({
        DB_HOST: 'postgres',
        DB_PORT: '5432',
        DB_NAME: 'memo flow',
        DB_USER: 'memo@flow',
        DB_PASSWORD: 'p@ss',
      }),
    ).toBe('postgresql://memo%40flow:p%40ss@postgres:5432/memo%20flow?schema=public');
  });

  it('recognizes only standard Prisma migration directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'memoflow-migrations-'));
    expect(hasPrismaMigrations(root)).toBe(false);
    const migration = join(root, '20260731_init');
    mkdirSync(migration);
    writeFileSync(join(migration, 'migration.sql'), 'SELECT 1;');
    expect(hasPrismaMigrations(root)).toBe(true);
  });

  it('keeps schema reconciliation and smoke verification ordered', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'memoflow-migrator-workspace-'));
    const labels = createMigrationCommands(workspaceRoot).map((command) => command.label);
    expect(labels).toEqual([
      'prepare pgvector',
      'retire legacy AI runtime state',
      'prepare goal-record source correlation',
      'prepare editor-workspace natural key',
      'prepare notification preference hierarchy',
      'prepare vNext unique constraints',
      'prepare stable Knowledge document identity cutover',
      'reconcile Prisma schema',
      'prepare AI provider onboarding sessions',
      'prepare AI provider default invariant',
      'ensure Task goal-binding constraint',
      'bootstrap AI knowledge index',
      'verify AI knowledge index',
    ]);
  });
});
