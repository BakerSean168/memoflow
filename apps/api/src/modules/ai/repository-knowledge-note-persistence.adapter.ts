/**
 * App-local AI host adapter (API lane).
 * apps/api 本地的 AI 宿主适配器（API lane）。
 *
 * Import seam: this adapter consumes public package roots (`@memoflow/contracts/ai`,
 * `@memoflow/repository`) and the public `@memoflow/ai/ports` seam. It must never
 * import the package-internal `/server` subpath (any deep package-internal
 * path). Only `apps/api/src/runtime/compose-ai.ts` imports the package `/api`
 * transport seam; app-local adapters stay behind the port interfaces.
 *
 * 导入边界：本适配器只使用公开的包根（`@memoflow/contracts/ai`、
 * `@memoflow/repository`）与公开的 `@memoflow/ai/ports` seam，绝不导入
 * 包内 `/server` 子路径（或任何包内深路径）。只有 `apps/api/src/runtime/compose-ai.ts`
 * 导入 package `/api` transport seam；app-local adapter 保持在 port 接口之后。
 */
import { createHash } from 'node:crypto';
import type { KnowledgeNotePersistedRef } from '@memoflow/contracts/ai';
import type { RepositoryApplicationPort } from '@memoflow/repository';
import { ResultErrorException } from '@memoflow/contracts/result';
import type {
  CreateKnowledgeNotePersistenceInput,
  CreateKnowledgeNotePersistenceResult,
  IKnowledgeNotePersistencePort,
} from '@memoflow/ai/ports';

/**
 * Web/API AI notes are committed through knowledge repository confirmed create.
 * Returns a knowledge-note ref over the projection write, not a Resource CRUD DTO.
 */
export class RepositoryKnowledgeNotePersistenceAdapter implements IKnowledgeNotePersistencePort {
  constructor(private readonly repositoryApi: RepositoryApplicationPort) {}

  async createKnowledgeNote(
    input: CreateKnowledgeNotePersistenceInput,
  ): Promise<CreateKnowledgeNotePersistenceResult> {
    if (!input.proposalId || !input.proposalRevision || !input.requestId) {
      throw new Error('A confirmed knowledge-note proposal is required for GitHub writes');
    }

    const listed = await this.repositoryApi.listKnowledgeRepositoryConnections(input.context);
    if (!listed.ok) {
      throw new ResultErrorException(
        'Repository knowledge connections listing failed',
        listed.error.code,
        undefined,
        listed.error.context,
        undefined,
        listed.error,
      );
    }

    const active = listed.data.connections.filter(
      (binding) =>
        binding.disconnectedAt === null && binding.observation?.eligibility.state === 'Ready',
    );
    const connection = input.connectionId
      ? active.find((c) => c.id === input.connectionId)
      : active.length === 1
        ? active[0]
        : undefined;

    if (!connection) {
      throw new Error(
        input.connectionId
          ? 'The selected knowledge repository binding is not ready'
          : active.length > 1
            ? 'An explicit knowledge repository binding is required'
            : 'No ready knowledge repository binding is available',
      );
    }

    const committed = await this.repositoryApi.createConfirmedKnowledgeNote(input.context, {
      connectionId: connection.id,
      proposalId: input.proposalId,
      revision: input.proposalRevision,
      requestId: input.requestId,
      proposedPath: input.path,
      title: input.fileName.replace(/\.md$/i, ''),
      frontmatter: {},
      content: input.content,
      reason: 'AI knowledge note approved by the user',
    });
    if (!committed.ok) {
      throw new ResultErrorException(
        'Repository knowledge note commit failed',
        committed.error.code,
        undefined,
        committed.error.context,
        undefined,
        committed.error,
      );
    }

    return {
      note: toKnowledgeNoteRef(input, connection.id),
    };
  }
}

/**
 * Residual 1149 soft residual / keep-boundary: API GitHub knowledge-repo mapping.
 * id = knowledge-note-<sha256(connectionId:path)>; scope = connectionId;
 * size = Buffer.byteLength(content); timestamps = Date.now().
 * Soft residual 1149: Desktop local-Vault mapping stays separate (no force-merge).
 */
function toKnowledgeNoteRef(
  input: CreateKnowledgeNotePersistenceInput,
  connectionId: string,
): KnowledgeNotePersistedRef {
  const now = Date.now();
  const id = `knowledge-note-${createHash('sha256')
    .update(`${connectionId}:${input.path}`)
    .digest('hex')}`;

  return {
    id,
    repositoryScopeId: connectionId,
    name: input.fileName,
    path: input.path,
    mimeType: 'text/markdown',
    size: Buffer.byteLength(input.content, 'utf8'),
    content: input.content,
    createdAt: now,
    updatedAt: now,
  };
}
