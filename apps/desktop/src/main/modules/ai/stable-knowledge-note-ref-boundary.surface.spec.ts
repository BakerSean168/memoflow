import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** ADR-090/126: Desktop persisted refs retain stable identity; API knowledge is read-only. */
describe('stable knowledge-note persisted-ref boundary', () => {
  const dir = __dirname;
  const desktop = readFileSync(
    resolve(dir, 'desktop-knowledge-note-persistence.adapter.ts'),
    'utf8',
  );
  const apiComposition = readFileSync(
    resolve(dir, '../../../../../../apps/api/src/runtime/compose-ai.ts'),
    'utf8',
  );
  const desktopSource = readFileSync(resolve(dir, 'desktop-knowledge-source.adapter.ts'), 'utf8');

  it('uses the stable KnowledgeDocumentId for Desktop direct persisted refs', () => {
    expect(desktop).toContain('id: note.knowledgeDocumentId');
    expect(desktop).toContain('Local Vault write did not return a stable KnowledgeDocumentId');
    expect(desktop).not.toContain("createHash('sha256').update(note.relativePath)");
    expect(desktop).toContain('writeNote');
    expect(desktop).toContain('LocalVaultNoteDTO');
    expect(desktop).not.toContain('createConfirmedKnowledgeNote');
  });

  it('does not compose the retired API note writer', () => {
    expect(
      existsSync(
        resolve(
          dir,
          '../../../../../../apps/api/src/modules/ai/repository-knowledge-note-persistence.adapter.ts',
        ),
      ),
    ).toBe(false);
    expect(apiComposition).not.toContain('RepositoryKnowledgeNotePersistenceAdapter');
    expect(apiComposition).toContain('new RepositoryKnowledgeSourceAdapter(');
  });

  it('does not turn temporary source references into durable document identities', () => {
    expect(desktopSource).not.toContain('temporaryUnmanagedResourceIdForPath');
    expect(desktopSource).not.toContain('note.knowledgeDocumentId ??');
    expect(desktopSource).toContain('knowledgeDocumentId: note.knowledgeDocumentId');
    expect(desktopSource).toContain(
      'scanned.notes.filter((note) => note.knowledgeDocumentId !== null)',
    );
    expect(desktopSource).toContain('async getNoteBySource(');
    expect(desktopSource).toContain('knowledgeSpaceId');
  });
});
