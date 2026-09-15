/**
 * App-local AI host adapter (API lane).
 * apps/api 本地的 AI 宿主适配器（API lane）。
 *
 * Import seam: this adapter consumes the public `@memoflow/ai/ports` seam and
 * `@memoflow/repository`. It must never import the package-internal `/server`
 * subpath (any deep package-internal path). Only
 * `apps/api/src/runtime/compose-ai.ts` imports the package `/api` transport
 * seam; app-local adapters stay behind the port interfaces.
 *
 * 导入边界：本适配器只使用公开的 `@memoflow/ai/ports` seam 与
 * `@memoflow/repository`，绝不导入包内 `/server` 子路径（或任何包内深路径）。
 * 只有 `apps/api/src/runtime/compose-ai.ts` 导入 package `/api` transport seam；
 * app-local adapter 保持在 port 接口之后。
 */
import type { IKnowledgeIndexStatusPort, KnowledgeIndexStatusUpdate } from '@memoflow/ai/ports';
import type { RepositoryApplicationPort } from '@memoflow/repository';
import { ResultErrorException } from '@memoflow/contracts/result';

/** Bridges AI indexing outcomes back to the repository-owned projection. */
export class RepositoryKnowledgeIndexStatusAdapter implements IKnowledgeIndexStatusPort {
  constructor(private readonly repositoryApi: RepositoryApplicationPort) {}

  async updateIndexStatus(identityId: string, update: KnowledgeIndexStatusUpdate): Promise<void> {
    const result = await this.repositoryApi.updateKnowledgeNoteProjectionIndexStatus(
      { identityId },
      {
        connectionId: update.repositoryId,
        resourceId: update.resourceId,
        contentHash: update.contentHash,
        status: update.status,
      },
    );
    if (!result.ok) {
      throw new ResultErrorException(
        'Repository knowledge index status update failed',
        result.error.code,
        undefined,
        result.error.context,
        undefined,
        result.error,
      );
    }
  }
}
