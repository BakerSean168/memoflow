import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Controlled note-write boundary (ADR-090): generic existing-note editing stays
 * closed. Runtime writes are confirmed create plus the one specialized Web
 * adoption operation that only adds memoflow_id under an exact-blob CAS guard.
 * Desktop Local Vault confirmed create remains exclusive-create. packages/editor
 * stays deleted; portable editor_* backup remains data-portability-only.
 */
describe('controlled note-write boundary surface', () => {
  const repoRoot = resolve(__dirname, '../../../../../../../../');

  const applicationPort = readFileSync(
    resolve(__dirname, '../../../../application/repository.application.port.ts'),
    'utf8',
  );
  const apiClientPort = readFileSync(
    resolve(
      repoRoot,
      'packages/repository/src/application-client/ports/repository-api-client.port.ts',
    ),
    'utf8',
  );
  const clientPort = readFileSync(
    resolve(repoRoot, 'packages/repository/src/application-client/repository-client.port.ts'),
    'utf8',
  );
  const knowledgeRoutes = readFileSync(
    resolve(
      repoRoot,
      'packages/repository/src/api/routes/knowledge-repository-connection.routes.ts',
    ),
    'utf8',
  );
  const localVaultRuntime = readFileSync(
    resolve(repoRoot, 'packages/repository/src/electron/local-vault-runtime.ts'),
    'utf8',
  );
  const electronIndex = readFileSync(
    resolve(repoRoot, 'packages/repository/src/electron/index.ts'),
    'utf8',
  );
  const repositoryChannels = readFileSync(
    resolve(repoRoot, 'packages/contracts/src/electron/ipc-channels.ts'),
    'utf8',
  );
  const createConfirmedDto = readFileSync(
    resolve(
      repoRoot,
      'packages/contracts/src/modules/repository/api/knowledge-note-projection.dto.ts',
    ),
    'utf8',
  );
  const aiKnowledgeDto = readFileSync(
    resolve(repoRoot, 'packages/contracts/src/modules/ai/api/ai-knowledge-note.dto.ts'),
    'utf8',
  );
  const vueRepositoryRouter = readFileSync(
    resolve(repoRoot, 'packages/app-vue/src/modules/repository/router/index.ts'),
    'utf8',
  );
  const projectionWorkspace = readFileSync(
    resolve(
      repoRoot,
      'packages/app-vue/src/modules/repository/views/KnowledgeProjectionWorkspaceView.vue',
    ),
    'utf8',
  );
  const localVaultWorkspace = readFileSync(
    resolve(repoRoot, 'packages/app-vue/src/modules/repository/views/LocalVaultWorkspaceView.vue'),
    'utf8',
  );

  it('application and client ports expose confirmed create plus explicit adoption only', () => {
    // Method surface lives on the application port + IRepositoryApiClient.
    // RepositoryClientPort is a residual-284 type alias (no dual method body).
    for (const source of [applicationPort, apiClientPort]) {
      expect(source).toContain('createConfirmedKnowledgeNote');
      expect(source).toContain('adoptKnowledgeDocument');
      expect(source).not.toMatch(
        /updateKnowledgeNote(?!ProjectionIndexStatus)|updateConfirmedKnowledgeNote|saveKnowledgeNote|patchKnowledgeNote|editKnowledgeNote/,
      );
      expect(source).not.toMatch(/updateLocalVaultNote|saveLocalVaultNote|patchLocalVaultNote/);
    }

    expect(clientPort).toMatch(/export type RepositoryClientPort\s*=\s*IRepositoryApiClient/);
    expect(clientPort).not.toMatch(/export interface RepositoryClientPort\s*\{/);
    expect(clientPort).not.toMatch(
      /updateKnowledgeNote(?!ProjectionIndexStatus)|updateConfirmedKnowledgeNote|saveKnowledgeNote|patchKnowledgeNote|editKnowledgeNote/,
    );
    expect(clientPort).not.toMatch(/updateLocalVaultNote|saveLocalVaultNote|patchLocalVaultNote/);

    expect(apiClientPort).toContain('writeConfirmedLocalVaultNote');
    // Application port is server-side GitHub projection; Local Vault write is Desktop-only.
    expect(applicationPort).not.toContain('writeConfirmedLocalVaultNote');
  });

  it('HTTP knowledge-notes surface allows confirmed create and specialized CAS adoption, not generic edit', () => {
    expect(knowledgeRoutes).toContain("method: 'get'");
    expect(knowledgeRoutes).toContain("path: '/knowledge-notes'");
    expect(knowledgeRoutes).toContain("path: '/knowledge-notes/:projectionId'");
    expect(knowledgeRoutes).toContain("method: 'post'");
    expect(knowledgeRoutes).toContain('创建已确认的 GitHub 知识笔记');
    expect(knowledgeRoutes).toContain('只允许创建新 Markdown 文件');
    expect(knowledgeRoutes).toContain('CreateConfirmedKnowledgeNoteSchema');
    expect(knowledgeRoutes).toContain('controller.createNote');
    expect(knowledgeRoutes).toContain("path: '/knowledge-notes/adopt'");
    expect(knowledgeRoutes).toContain('AdoptKnowledgeDocumentSchema');
    expect(knowledgeRoutes).toContain('controller.adoptNote');
    expect(knowledgeRoutes).toContain('expectedBlobSha');

    // No full-text update / replace of an existing projection note.
    expect(knowledgeRoutes).not.toMatch(/method:\s*'put'/);
    expect(knowledgeRoutes).not.toMatch(/method:\s*'patch'/);
    expect(knowledgeRoutes).not.toContain('updateNote');
    expect(knowledgeRoutes).not.toContain('controller.updateNote');
    // GET detail stays; no write methods on /knowledge-notes/:projectionId.
    const writeMethodsOnProjectionId = [
      ...knowledgeRoutes.matchAll(
        /method:\s*'(put|patch|post|delete)'[\s\S]{0,200}?path:\s*'\/knowledge-notes\/:projectionId'/g,
      ),
    ];
    expect(writeMethodsOnProjectionId).toHaveLength(0);
  });

  it('Desktop Local Vault write is exclusive create + confirmed proposal metadata only', () => {
    expect(localVaultRuntime).toContain('writeConfirmedNote');
    expect(localVaultRuntime).toContain("open(candidate, 'wx'");
    expect(localVaultRuntime).toContain('A Vault note already exists at this path');
    expect(localVaultRuntime).toContain('Confirmed proposal metadata is required');
    expect(localVaultRuntime).not.toMatch(/open\(candidate,\s*'w'/);
    expect(localVaultRuntime).not.toMatch(/open\(candidate,\s*'a'/);
    expect(localVaultRuntime).not.toContain('updateNote(');
    expect(localVaultRuntime).not.toContain('overwriteNote');

    expect(electronIndex).toContain('LOCAL_VAULT_NOTE_WRITE_CONFIRMED');
    expect(electronIndex).toContain('writeConfirmedNote');
    expect(repositoryChannels).toContain(
      "LOCAL_VAULT_NOTE_WRITE_CONFIRMED: 'repository:local-vault:note:write-confirmed'",
    );
    expect(repositoryChannels).not.toMatch(
      /LOCAL_VAULT_NOTE_UPDATE|LOCAL_VAULT_NOTE_SAVE|LOCAL_VAULT_NOTE_PATCH/,
    );
  });

  it('confirmed-create DTOs and AI schema require proposal confirmation', () => {
    expect(createConfirmedDto).toContain('CreateConfirmedKnowledgeNoteSchema');
    expect(createConfirmedDto).toContain('proposalId');
    expect(createConfirmedDto).toContain('requestId');
    expect(createConfirmedDto).toContain('revision');
    expect(createConfirmedDto).toContain('proposedPath');

    expect(aiKnowledgeDto).toContain('CreateKnowledgeNoteSchema');
    expect(aiKnowledgeDto).toContain('confirmation');
    expect(aiKnowledgeDto).toContain('proposalId');
    expect(aiKnowledgeDto).toContain('revision');
    expect(aiKnowledgeDto).toContain('requestId');
    // confirmation object is required (not optional) on the create schema.
    expect(aiKnowledgeDto).toMatch(
      /CreateKnowledgeNoteSchema\s*=\s*z\.object\(\{[\s\S]*?confirmation:\s*z\.object\(/,
    );
    expect(aiKnowledgeDto).not.toMatch(/confirmation:\s*z\.object\([\s\S]*?\)\.optional\(/);
  });

  it('Vue routes and workspaces close existing-note edit; create dialog is draft→review only', () => {
    expect(vueRepositoryRouter).toContain("path: '/repository'");
    expect(vueRepositoryRouter).toContain('Existing-note editing is');
    expect(vueRepositoryRouter).not.toContain("path: '/note");
    expect(vueRepositoryRouter).not.toContain('note-edit');
    expect(vueRepositoryRouter).not.toContain('/note/:id');

    expect(projectionWorkspace).toContain('createConfirmedKnowledgeNote');
    expect(projectionWorkspace).toContain('adoptKnowledgeDocument');
    expect(projectionWorkspace).toContain('knowledge-projection-adopt-document-id');
    expect(projectionWorkspace).toContain('function editDraft()');
    expect(projectionWorkspace).toContain("stage.value = 'draft'");
    expect(projectionWorkspace).toContain("stage.value = 'review'");
    expect(projectionWorkspace).toContain('function confirmCreate()');
    // editDraft only returns to draft stage — no note id / projection id mutation path.
    const editDraftBody = projectionWorkspace.match(
      /function editDraft\(\):\s*void\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    expect(editDraftBody).toBeTruthy();
    expect(editDraftBody).toContain("stage.value = 'draft'");
    expect(editDraftBody).not.toMatch(/selectedNoteId|projectionId|update|save|write/);
    expect(projectionWorkspace).not.toMatch(
      /updateKnowledgeNote|saveKnowledgeNote|writeConfirmedLocalVaultNote/,
    );

    // Desktop existing notes open in Obsidian; in-app path is not an editor.
    expect(localVaultWorkspace).toContain('openInObsidian');
    expect(localVaultWorkspace).not.toContain('createConfirmedKnowledgeNote');
    expect(localVaultWorkspace).not.toMatch(
      /updateLocalVaultNote|saveLocalVaultNote|editExistingNote/,
    );
  });

  it('legacy editor runtime package stays deleted; portable editor_* backup remains', () => {
    expect(existsSync(resolve(repoRoot, 'packages/editor'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'packages/database/prisma/schema/editor.prisma'))).toBe(
      true,
    );
    expect(
      existsSync(
        resolve(repoRoot, 'packages/database/scripts/prepare-editor-workspace-natural-key.ts'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        resolve(
          repoRoot,
          'packages/data-portability/src/server/application/use-cases/importers/editor.importer.ts',
        ),
      ),
    ).toBe(true);
  });
});
