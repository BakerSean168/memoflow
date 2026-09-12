/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 6 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: github-installation-repository-dual.surface.spec.ts, knowledge-connection-client-dto-dual.surface.spec.ts, knowledge-installation-res-dual.surface.spec.ts, knowledge-list-projections-dual.surface.spec.ts, knowledge-sync-params-dual.surface.spec.ts, list-knowledge-connections-res-dual.surface.spec.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// --- merged from github-installation-repository-dual.surface.spec.ts ---
{
  /**
   * Residual 701: GitHub installation repository dual body retired.
   * GitHubInstallationRepositoryDTO reuses GitHubInstallationRepositorySchema only.
   */
  describe('github installation repository dual retired (residual 701)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'knowledge-repository-connection.dto.ts'), 'utf8');
    const routes = readFileSync(
      resolve(
        apiDir,
        '../../../../../repository/src/api/routes/knowledge-repository-connection.routes.ts',
      ),
      'utf8',
    );

    it('exports GitHubInstallationRepositorySchema as sole repository shape', () => {
      expect(dto).toContain('Residual 701');
      expect(dto).toContain('export const GitHubInstallationRepositorySchema = z.object({');
      expect(dto).toContain('repositories: z.array(GitHubInstallationRepositorySchema)');
    });

    it('semantic DTO type is z.infer alias without interface dual body', () => {
      expect(dto).toContain(
        'export type GitHubInstallationRepositoryDTO = z.infer<typeof GitHubInstallationRepositorySchema>',
      );
      expect(dto).not.toMatch(/export interface GitHubInstallationRepositoryDTO\b/);
    });

    it('OpenAPI installation complete response uses repository schema array', () => {
      expect(routes).toContain('CompleteKnowledgeRepositoryInstallationResponseSchema');
      expect(dto).toContain('CompleteKnowledgeRepositoryInstallationResponseSchema');
    });
  });
}

// --- merged from knowledge-connection-client-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 803 + ADR-089: KnowledgeRemoteBindingClientDTO has one composed schema.
   * Durable binding lives in the aggregate; observation/history/projection remain independent axes.
   * ServerDTO adds only technical optimistic-concurrency version metadata.
   */
  describe('knowledge connection client dto dual retired (residual 803)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'knowledge-repository-connection.dto.ts'), 'utf8');
    const aggregate = readFileSync(
      resolve(apiDir, '../aggregates/knowledge-remote-binding.ts'),
      'utf8',
    );

    it('owns ClientDTO as z.infer of KnowledgeRemoteBindingClientSchema', () => {
      expect(aggregate).toContain('ADR-089 canonical remote knowledge-source contracts');
      expect(dto).toContain(
        'export const KnowledgeRemoteBindingClientSchema = KnowledgeRemoteBindingSchema.extend({',
      );
      expect(dto).toContain('export type KnowledgeRemoteBindingClientDTO = z.infer<');
      expect(dto).toContain('typeof KnowledgeRemoteBindingClientSchema');
      expect(dto).not.toMatch(/export interface KnowledgeRemoteBindingClientDTO\b/);
    });

    it('keeps durable binding and server concurrency metadata aggregate-owned', () => {
      expect(aggregate).toContain('ADR-089 canonical remote knowledge-source contracts');
      expect(aggregate).toContain('export const KnowledgeRemoteBindingSchema = z');
      expect(aggregate).not.toMatch(/export interface KnowledgeRemoteBindingClientDTO\b/);
      expect(aggregate).toContain('export interface KnowledgeRemoteBindingServerDTO');
      expect(aggregate).toContain('readonly version: number');
      expect(aggregate).not.toMatch(
        /lastErrorMessage|lastSyncedCommitSha|lastProjectedCommitSha|canSync/,
      );
    });

    it('ClientSchema composes independent observation, history fence and projection checkpoint axes', () => {
      expect(dto).toContain('observation: RemoteRepositoryObservationSchema.nullable()');
      expect(dto).toContain('historyFence: RemoteHistoryFenceSchema.nullable()');
      expect(dto).toContain('projectionCheckpoint: KnowledgeProjectionCheckpointSchema.nullable()');
      expect(dto).not.toMatch(/installationToken|privateKey|accessToken|clientSecret/);
      expect(dto).not.toMatch(/lastSyncedCommitSha|lastProjectedCommitSha|canSync/);
    });
  });
}

// --- merged from knowledge-installation-res-dual.surface.spec.ts ---
{
  /**
   * Residual 699: knowledge repository installation response dual bodies retired.
   * Start/Complete Installation Res reuse *ResponseSchema only.
   */
  describe('knowledge installation res dual retired (residual 699)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'knowledge-repository-connection.dto.ts'), 'utf8');
    const routes = readFileSync(
      resolve(
        apiDir,
        '../../../../../repository/src/api/routes/knowledge-repository-connection.routes.ts',
      ),
      'utf8',
    );

    it('exports installation ResponseSchemas as sole response shapes', () => {
      expect(dto).toContain('Residual 699');
      expect(dto).toContain('export const StartKnowledgeRepositoryInstallationResponseSchema');
      expect(dto).toContain('export const CompleteKnowledgeRepositoryInstallationResponseSchema');
    });

    it('semantic installation Res types are z.infer aliases without interface dual bodies', () => {
      expect(dto).toContain('export type StartKnowledgeRepositoryInstallationRes = z.infer<');
      expect(dto).toContain('typeof StartKnowledgeRepositoryInstallationResponseSchema');
      expect(dto).toContain('export type CompleteKnowledgeRepositoryInstallationRes = z.infer<');
      expect(dto).toContain('typeof CompleteKnowledgeRepositoryInstallationResponseSchema');
      expect(dto).not.toMatch(/export interface StartKnowledgeRepositoryInstallationRes\b/);
      expect(dto).not.toMatch(/export interface CompleteKnowledgeRepositoryInstallationRes\b/);
    });

    it('OpenAPI knowledge connection routes use installation ResponseSchemas only', () => {
      expect(routes).toContain('StartKnowledgeRepositoryInstallationResponseSchema');
      expect(routes).toContain(
        'successResponse(StartKnowledgeRepositoryInstallationResponseSchema',
      );
      expect(routes).toContain('CompleteKnowledgeRepositoryInstallationResponseSchema');
      expect(routes).toContain(
        'successResponse(CompleteKnowledgeRepositoryInstallationResponseSchema',
      );
    });
  });
}

// --- merged from knowledge-list-projections-dual.surface.spec.ts ---
{
  /**
   * Residual 675: knowledge note/attachment list-filter dual bodies retired.
   * Both list ops use ListKnowledgeProjectionsSchema only.
   */
  describe('knowledge list projections filter dual retired (residual 675)', () => {
    const apiDir = __dirname;
    const noteDto = readFileSync(resolve(apiDir, 'knowledge-note-projection.dto.ts'), 'utf8');
    const attachmentDto = readFileSync(
      resolve(apiDir, 'knowledge-attachment-projection.dto.ts'),
      'utf8',
    );
    const controller = readFileSync(
      resolve(
        apiDir,
        '../../../../../repository/src/server/transport/knowledge-repository-connection.controller.ts',
      ),
      'utf8',
    );

    it('exports a single shared list-knowledge projections filter schema', () => {
      expect(noteDto).toContain('Residual 675');
      expect(noteDto).toContain('export const ListKnowledgeProjectionsSchema');
      expect(noteDto).toContain(
        'export type ListKnowledgeNoteProjectionsReq = z.infer<typeof ListKnowledgeProjectionsSchema>',
      );
      expect(noteDto).not.toMatch(/export const ListKnowledgeNoteProjectionsSchema\b/);
      expect(attachmentDto).toContain('Residual 675');
      expect(attachmentDto).toContain(
        'export type ListKnowledgeAttachmentProjectionsReq = z.infer<\n  typeof ListKnowledgeProjectionsSchema\n>',
      );
      expect(attachmentDto).not.toMatch(/export const ListKnowledgeAttachmentProjectionsSchema\b/);
      expect(attachmentDto).toContain(
        "import { ListKnowledgeProjectionsSchema } from './knowledge-note-projection.dto'",
      );
    });

    it('controller parses shared list filter for notes and attachments', () => {
      expect(controller).toContain('ListKnowledgeProjectionsSchema');
      expect(controller).not.toContain('ListKnowledgeNoteProjectionsSchema');
      expect(controller).not.toContain('ListKnowledgeAttachmentProjectionsSchema');
      const parseHits = controller.split('ListKnowledgeProjectionsSchema.safeParse').length - 1;
      expect(parseHits).toBeGreaterThanOrEqual(2);
    });
  });
}

// --- merged from knowledge-sync-params-dual.surface.spec.ts ---
{
  /**
   * Residual 669: knowledge-repository sync request dual body retired.
   * SyncKnowledgeRepositoryReq reuses KnowledgeRepositoryConnectionParamsSchema only.
   */
  describe('knowledge sync params dual retired (residual 669)', () => {
    const apiDir = __dirname;
    const dto = readFileSync(resolve(apiDir, 'knowledge-repository-connection.dto.ts'), 'utf8');

    it('does not export a separate sync request zod dual body', () => {
      expect(dto).toContain('Residual 669');
      expect(dto).toContain('export const KnowledgeRepositoryConnectionParamsSchema');
      expect(dto).toContain(
        'export type SyncKnowledgeRepositoryReq = z.infer<typeof KnowledgeRepositoryConnectionParamsSchema>',
      );
      expect(dto).not.toMatch(/export const SyncKnowledgeRepositorySchema\b/);
    });

    it('disconnect still extends the shared connection params schema', () => {
      expect(dto).toContain('KnowledgeRepositoryConnectionParamsSchema.extend({');
    });

    it('desktop sync service parses KnowledgeRepositoryConnectionParamsSchema only', () => {
      const desktop = readFileSync(
        resolve(
          apiDir,
          '../../../../../../apps/desktop/src/main/modules/repository/desktop-knowledge-repository-sync.service.ts',
        ),
        'utf8',
      );
      expect(desktop).toContain('KnowledgeRepositoryConnectionParamsSchema.safeParse');
      expect(desktop).not.toContain('SyncKnowledgeRepositorySchema');
    });
  });
}

// --- merged from list-knowledge-connections-res-dual.surface.spec.ts ---
{
  /**
   * Residual 773: ListKnowledgeRepositoryConnectionsRes dual body retired.
   * Res is z.infer of ListKnowledgeRepositoryConnectionsResSchema.
   * Soft residual 803: nested KnowledgeRemoteBindingClientDTO dual retired via ClientSchema
   * (see knowledge-connection-client-dto-dual surface; not asserted here to avoid dual-surface lock drift).
   */
  describe('list knowledge connections res dual retired (residual 773)', () => {
    const dto = readFileSync(resolve(__dirname, 'knowledge-repository-connection.dto.ts'), 'utf8');

    it('owns sole list ResSchema body', () => {
      expect(dto).toContain('Residual 773');
      expect(dto).toContain(
        'export const ListKnowledgeRepositoryConnectionsResSchema = z.object({',
      );
      expect(dto).toContain('connections: z.array(KnowledgeRemoteBindingClientSchema)');
    });

    it('Res type is z.infer alias without object dual body', () => {
      expect(dto).toContain('export type ListKnowledgeRepositoryConnectionsRes = z.infer<');
      expect(dto).toContain('typeof ListKnowledgeRepositoryConnectionsResSchema');
      expect(dto).not.toMatch(
        /export type ListKnowledgeRepositoryConnectionsRes = \{\s*connections:/,
      );
    });

    it('nested connection transport uses ClientSchema', () => {
      expect(dto).toContain(
        'export const KnowledgeRemoteBindingClientSchema = KnowledgeRemoteBindingSchema.extend({',
      );
    });
  });
}
