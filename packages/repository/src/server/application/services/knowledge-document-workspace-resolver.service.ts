import type { KnowledgeDocumentId, KnowledgeSpaceId } from '@memoflow/contracts/primitives';
import type { IKnowledgeDocumentIdentityRepository } from '../ports/knowledge-document-identity.repository';
import type { IKnowledgeRemoteBindingRepository } from '../ports/knowledge-remote-binding.repositories';
import type { IKnowledgeNoteProjectionRepository } from '../ports/knowledge-note-projection.repository';

export interface KnowledgeDocumentWorkspaceProjection {
  readonly knowledgeSpaceId: KnowledgeSpaceId;
  readonly title: string;
  readonly excerpt: string;
  readonly relativePath: string;
  readonly updatedAt: number;
}

function excerpt(markdown: string): string {
  return markdown.replace(/\s+/g, ' ').trim().slice(0, 240);
}

/** Repository-owned stable-document -> current display projection resolver for cross-module read models. */
export class KnowledgeDocumentWorkspaceResolverService {
  constructor(
    private readonly bindings: Pick<IKnowledgeRemoteBindingRepository, 'findByIdentityId'>,
    private readonly identities: Pick<IKnowledgeDocumentIdentityRepository, 'find'>,
    private readonly projections: Pick<IKnowledgeNoteProjectionRepository, 'findLiveByDocumentId'>,
  ) {}

  async resolveForWorkspace(
    identityId: string,
    documentId: KnowledgeDocumentId,
  ): Promise<KnowledgeDocumentWorkspaceProjection | null> {
    const activeBindings = (await this.bindings.findByIdentityId(identityId)).filter(
      (binding) => binding.disconnectedAt === null,
    );
    const spaceIds = [...new Set(activeBindings.map((binding) => binding.knowledgeSpaceId))];
    const identityMatches: KnowledgeSpaceId[] = [];
    for (const knowledgeSpaceId of spaceIds) {
      if (await this.identities.find(knowledgeSpaceId, documentId)) {
        identityMatches.push(knowledgeSpaceId);
      }
    }
    if (identityMatches.length > 1) {
      throw new Error('Knowledge document identity is ambiguous for current identity.');
    }
    const knowledgeSpaceId = identityMatches[0];
    if (!knowledgeSpaceId) return null;

    const candidateBindings = activeBindings.filter(
      (binding) => binding.knowledgeSpaceId === knowledgeSpaceId,
    );
    const projections = [];
    for (const binding of candidateBindings) {
      projections.push(...(await this.projections.findLiveByDocumentId(binding.id, documentId)));
    }
    if (projections.length > 1) {
      throw new Error('Knowledge document has multiple live projections for current identity.');
    }
    const projection = projections[0];
    if (!projection) return null;

    return {
      knowledgeSpaceId,
      title: projection.title,
      excerpt: excerpt(projection.markdownContent),
      relativePath: projection.relativePath,
      updatedAt: projection.updatedAt,
    };
  }
}
