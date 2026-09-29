import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const baseDir = dirname(fileURLToPath(import.meta.url));
const projectionSource = readFileSync(
  resolve(baseDir, 'KnowledgeProjectionWorkspaceView.vue'),
  'utf8',
);
const localVaultSource = readFileSync(resolve(baseDir, 'LocalVaultWorkspaceView.vue'), 'utf8');
const entrySource = readFileSync(resolve(baseDir, 'RepositoryEntryView.vue'), 'utf8');
const routerSource = readFileSync(resolve(baseDir, '../router/index.ts'), 'utf8');

describe('Note single-page architecture', () => {
  it('routes directly to the single Notes workspace without an intermediate segment shell', () => {
    expect(routerSource).toContain("path: '/repository'");
    expect(routerSource).toContain("name: 'repository'");
    expect(routerSource).toContain("import('../views/RepositoryEntryView.vue')");
    expect(routerSource).not.toContain('children:');
  });

  it('uses a read/search GitHub workspace on Web and the Local Vault / Obsidian path on Desktop', () => {
    expect(entrySource).toContain('LocalVaultWorkspaceView');
    expect(entrySource).toContain('KnowledgeProjectionWorkspaceView');
    expect(routerSource).not.toContain("path: '/note");
    expect(routerSource).not.toContain('note-edit');

    expect(projectionSource).not.toContain('createConfirmedKnowledgeNote');
    expect(projectionSource).not.toContain('knowledge-projection-create');
    expect(projectionSource).toContain('adoptKnowledgeDocument');
    expect(localVaultSource).toContain('openInObsidian');
    expect(localVaultSource).not.toMatch(
      /updateLocalVaultNote|saveLocalVaultNote|editExistingNote|createConfirmedKnowledgeNote/,
    );
  });

  it('keeps content primary, moves links to contextual UI, and exposes no in-app editor', () => {
    expect(projectionSource).toContain('data-testid="knowledge-projection-workspace"');
    expect(projectionSource).toContain('noteQueryId');
    expect(projectionSource).toContain('route.query.note');
    expect(projectionSource).toContain('KnowledgeNoteContextPanel');
    expect(projectionSource).toContain('KnowledgeNoteCatalog');
    expect(projectionSource).toContain('knowledge-projection-context-toggle');
    expect(projectionSource).not.toContain('knowledge-projection-relations-tab');
    expect(projectionSource).not.toContain("noteView = ref<'content' | 'links'>");
    expect(projectionSource).not.toMatch(
      /updateKnowledgeNote|saveKnowledgeNote|writeConfirmedLocalVaultNote|editExistingNote/,
    );

    expect(localVaultSource).toContain('route.query.note');
    expect(localVaultSource).toContain('applyNoteQuerySelection');
  });
});
