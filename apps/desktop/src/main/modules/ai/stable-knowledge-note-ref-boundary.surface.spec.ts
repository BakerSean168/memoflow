import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** ADR-090: both Desktop and API confirmed creates expose the reviewed kdoc id. */
describe('stable knowledge-note persisted-ref boundary', () => {
  const dir = __dirname;
  const desktop = readFileSync(
    resolve(dir, 'desktop-knowledge-note-persistence.adapter.ts'),
    'utf8',
  );
  const api = readFileSync(
    resolve(
      dir,
      '../../../../../../apps/api/src/modules/ai/repository-knowledge-note-persistence.adapter.ts',
    ),
    'utf8',
  );
  const desktopSource = readFileSync(resolve(dir, 'desktop-knowledge-source.adapter.ts'), 'utf8');

  it('uses KnowledgeDocumentId for confirmed persisted refs on both hosts', () => {
    expect(desktop).toContain('id: note.knowledgeDocumentId');
    expect(desktop).toContain(
      'Confirmed Local Vault write did not return a stable KnowledgeDocumentId',
    );
    expect(desktop).not.toContain("createHash('sha256').update(note.relativePath)");

    expect(api).toContain('id: knowledgeDocumentId');
    expect(api).toContain('committed.data.knowledgeDocumentId');
    expect(api).not.toContain("createHash('sha256').update(`${connectionId}:${input.path}`)");
  });

  it('keeps storage hosts separate without splitting document identity', () => {
    expect(desktop).toContain('writeConfirmedNote');
    expect(desktop).toContain('LocalVaultNoteDTO');
    expect(desktop).toContain('note.updatedAt');
    expect(desktop).not.toContain('createConfirmedKnowledgeNote');

    expect(api).toContain('createConfirmedKnowledgeNote');
    expect(api).toContain('connection.id');
    expect(api).toContain('Buffer.byteLength');
    expect(api).not.toContain('writeConfirmedNote');
    expect(api).not.toContain('LocalVaultElectronPort');
  });

  it('allows path-derived identity only as an explicit unmanaged read fallback', () => {
    expect(desktopSource).toContain('temporaryUnmanagedResourceIdForPath');
    expect(desktopSource).toContain('Ephemeral AI identity for unmanaged notes only');
    expect(desktopSource).toContain(
      'note.knowledgeDocumentId ?? temporaryUnmanagedResourceIdForPath',
    );
    expect(desktopSource).toContain('adoption replaces it with the Markdown-carried kdoc id');
  });
});
