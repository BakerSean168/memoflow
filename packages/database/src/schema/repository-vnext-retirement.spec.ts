import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CLEAN-2601 legacy repository persistence retirement', () => {
  const schema = readFileSync(
    resolve(__dirname, '../../prisma/schema/repository.prisma'),
    'utf8',
  );
  const migration = readFileSync(
    resolve(__dirname, '../../prisma/migrations/retire-legacy-repository-persistence.sql'),
    'utf8',
  );

  it('keeps canonical Knowledge persistence while removing the retired aggregate models', () => {
    expect(schema).toMatch(/model KnowledgeSpace\s*\{/);
    expect(schema).toMatch(/model KnowledgeDocumentIdentity\s*\{/);
    for (const model of [
      'Repository',
      'Folder',
      'Resource',
      'RepositoryResource',
      'LinkedContent',
      'ResourceReference',
      'RepositoryExplorer',
      'RepositoryStatistic',
    ]) {
      expect(schema).not.toMatch(new RegExp(`model ${model}\\s*\\{`));
    }
  });

  it('ships the destructive reset/reseed cutover for every retired repository table', () => {
    for (const table of [
      'repositories',
      'folders',
      'resources',
      'repository_resources',
      'linked_contents',
      'resource_references',
      'repository_explorers',
      'repository_statistics',
    ]) {
      expect(migration).toContain(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
    }
  });
});
