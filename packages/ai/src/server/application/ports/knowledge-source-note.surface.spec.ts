import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 213: AI knowledge source port drops Resource dual-track method/type names
 * after database Resource CRUD retirement. Stable KnowledgeDocumentId and the
 * current source path are separate fields.
 */
describe('AI knowledge source note port surface', () => {
  const dir = __dirname;
  const sourcePort = readFileSync(resolve(dir, 'knowledge-source.port.ts'), 'utf8');
  const ingestion = readFileSync(resolve(dir, 'knowledge-ingestion.port.ts'), 'utf8');
  const apiAdapter = readFileSync(
    resolve(
      dir,
      '../../../../../../apps/api/src/modules/ai/repository-knowledge-source.adapter.ts',
    ),
    'utf8',
  );
  const desktopAdapter = readFileSync(
    resolve(
      dir,
      '../../../../../../apps/desktop/src/main/modules/ai/desktop-knowledge-source.adapter.ts',
    ),
    'utf8',
  );

  it('port type and methods use note naming', () => {
    expect(sourcePort).toContain('export interface IKnowledgeSourcePort');
    expect(sourcePort).toContain('listRelevantNotes');
    expect(sourcePort).toContain('listIndexableNotes');
    expect(sourcePort).toContain('getNoteById');
    expect(sourcePort).toContain('KnowledgeSourceNote');
    expect(sourcePort).not.toContain('listRelevantResources');
    expect(sourcePort).not.toContain('listIndexableResources');
    expect(sourcePort).not.toContain('getResourceById');
    expect(sourcePort).not.toContain('KnowledgeSourceResource');
    expect(ingestion).toContain('export interface KnowledgeSourceNote');
    expect(ingestion).not.toContain('export interface KnowledgeSourceResource');
  });

  it('host adapters implement note methods only', () => {
    for (const adapter of [apiAdapter, desktopAdapter]) {
      expect(adapter).toContain('listRelevantNotes');
      expect(adapter).toContain('listIndexableNotes');
      expect(adapter).toContain('getNoteById');
      expect(adapter).not.toContain('listRelevantResources');
      expect(adapter).not.toContain('getResourceById');
    }
  });

  it('protocol stable document identity and source snapshot fields are explicit', () => {
    expect(ingestion).toContain('knowledgeSpaceId: string');
    expect(ingestion).toContain('knowledgeDocumentId: string | null');
    expect(ingestion).toContain('sourcePath: string');
    expect(ingestion).toContain('sourceContentHash: string');
    expect(ingestion).not.toContain('resourceId: string');
    expect(ingestion).not.toContain('resourcePath: string');
  });
});
