import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** ADR-126: Web sources are read-only; reviewed Desktop creates are local and exclusive. */
describe('controlled note-write boundary surface', () => {
  const repoRoot = resolve(__dirname, '../../../../../../../../');

  const applicationPort = readFileSync(
    resolve(__dirname, '../../../../application/repository.application.port.ts'),
    'utf8',
  );
  const apiClientPort = readFileSync(
    resolve(
      repoRoot,
      'packages/repository-client/src/application-client/ports/repository-api-client.port.ts',
    ),
    'utf8',
  );
  const clientPort = readFileSync(
    resolve(
      repoRoot,
      'packages/repository-client/src/application-client/repository-client.port.ts',
    ),
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
    resolve(repoRoot, 'packages/desktop-contracts/src/ipc-channels.ts'),
    'utf8',
  );
  const createConfirmedDto = readFileSync(
    resolve(repoRoot, 'packages/repository-contracts/src/api/knowledge-note-projection.dto.ts'),
    'utf8',
  );
  const aiKnowledgeDto = readFileSync(
    resolve(repoRoot, 'packages/ai-contracts/src/api/ai-knowledge-note.dto.ts'),
    'utf8',
  );
  const vueRepositoryRouter = readFileSync(
    resolve(repoRoot, 'packages/repository-ui/src/router/index.ts'),
    'utf8',
  );
  const projectionWorkspace = readFileSync(
    resolve(repoRoot, 'packages/repository-ui/src/components/KnowledgeSourceConnections.vue'),
    'utf8',
  );
  const localVaultWorkspace = readFileSync(
    resolve(repoRoot, 'packages/repository-ui/src/views/LocalVaultWorkspaceView.vue'),
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
    expect(apiClientPort).toContain('writeLocalVaultNote');
    // Application port is server-side GitHub projection; Local Vault write is Desktop-only.
    expect(applicationPort).not.toContain('writeConfirmedLocalVaultNote');
  });

  it('HTTP note surfaces retain reads and retire create, adoption and edits', () => {
    expect(knowledgeRoutes).toContain("path: '/knowledge-notes'");
    expect(knowledgeRoutes).toContain("path: '/knowledge-notes/:projectionId'");
    expect(knowledgeRoutes).not.toContain('controller.createNote');
    expect(knowledgeRoutes).not.toContain('controller.adoptNote');
    expect(knowledgeRoutes).not.toMatch(/method:\s*'(put|patch)'/);
  });

  it('Desktop Local Vault write is direct, atomic and hash-fenced', () => {
    expect(localVaultRuntime).toContain('writeNote');
    expect(localVaultRuntime).toContain('expectedContentHash');
    expect(localVaultRuntime).toContain('atomicReplace');
    expect(localVaultRuntime).toContain("open(candidate, 'wx'");
    expect(localVaultRuntime).toContain('A Vault note already exists at this path');
    expect(localVaultRuntime).not.toMatch(/open\(candidate,\s*'w'/);
    expect(localVaultRuntime).not.toMatch(/open\(candidate,\s*'a'/);

    expect(electronIndex).toContain('LOCAL_VAULT_NOTE_WRITE');
    expect(electronIndex).not.toContain('LOCAL_VAULT_GIT_DIFF');
    expect(repositoryChannels).toContain(
      "LOCAL_VAULT_NOTE_WRITE: 'repository:local-vault:note:write'",
    );
    expect(repositoryChannels).not.toContain('LOCAL_VAULT_GIT_DIFF');
    // The inline Git diff view is retired; Git status reads survive for the notes list.
    expect(localVaultRuntime).toContain('getGitChanges');
    expect(localVaultRuntime).not.toContain('getGitDiff');
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

  it('Vue workspaces expose no generic or manual note editor/create surface', () => {
    expect(vueRepositoryRouter).toContain("path: '/repository'");
    expect(vueRepositoryRouter).toContain('Existing-note editing is');
    expect(vueRepositoryRouter).not.toContain("path: '/note");
    expect(vueRepositoryRouter).not.toContain('note-edit');
    expect(vueRepositoryRouter).not.toContain('/note/:id');

    // Web only manages the connection and original-file links.
    expect(projectionWorkspace).not.toContain('createConfirmedKnowledgeNote');
    expect(projectionWorkspace).not.toContain('knowledge-projection-create');
    expect(projectionWorkspace).not.toContain('adoptKnowledgeDocument');
    expect(projectionWorkspace).not.toContain('knowledge-projection-adopt-document-id');
    expect(projectionWorkspace).not.toMatch(
      /updateKnowledgeNote|saveKnowledgeNote|writeConfirmedLocalVaultNote|editExistingNote/,
    );

    // Desktop opens files in Obsidian; AI writes happen outside this view.
    expect(localVaultWorkspace).toContain('openLocalVaultInObsidian');
    expect(localVaultWorkspace).not.toContain('createConfirmedKnowledgeNote');
    expect(localVaultWorkspace).not.toMatch(
      /updateLocalVaultNote|saveLocalVaultNote|editExistingNote/,
    );
  });

  it('legacy Editor runtime and persistence stay deleted', () => {
    expect(existsSync(resolve(repoRoot, 'packages/editor'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'packages/database/prisma/schema/editor.prisma'))).toBe(
      false,
    );
    expect(
      existsSync(
        resolve(repoRoot, 'packages/database/scripts/prepare-editor-workspace-natural-key.ts'),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          repoRoot,
          'packages/data-portability/src/server/application/use-cases/importers/editor.importer.ts',
        ),
      ),
    ).toBe(false);
  });
});
