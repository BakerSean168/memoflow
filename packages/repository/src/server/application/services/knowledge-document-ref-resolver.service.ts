import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import {
  KnowledgeDocumentRefSchema,
  type KnowledgeDocumentRef,
} from '@memoflow/contracts/repository';
import type { IKnowledgeDocumentIdentityRepository } from '../ports/knowledge-document-identity.repository';
import type { IKnowledgeRemoteBindingRepository } from '../ports/knowledge-remote-binding.repositories';

/** Repository-owned resolver from stable document identity to the current user's KnowledgeSpace. */
export class KnowledgeDocumentRefResolverService {
  constructor(
    private readonly bindings: Pick<IKnowledgeRemoteBindingRepository, 'findByIdentityId'>,
    private readonly identities: Pick<IKnowledgeDocumentIdentityRepository, 'find'>,
  ) {}

  async resolve(
    identityId: string,
    documentId: KnowledgeDocumentId,
  ): Promise<KnowledgeDocumentRef | null> {
    const activeBindings = (await this.bindings.findByIdentityId(identityId)).filter(
      (binding) => binding.disconnectedAt === null,
    );
    const knowledgeSpaceIds = [
      ...new Set(activeBindings.map((binding) => binding.knowledgeSpaceId)),
    ];
    const matches: KnowledgeDocumentRef[] = [];
    for (const knowledgeSpaceId of knowledgeSpaceIds) {
      const identity = await this.identities.find(knowledgeSpaceId, documentId);
      if (!identity) continue;
      matches.push(KnowledgeDocumentRefSchema.parse({ knowledgeSpaceId, documentId }));
    }
    if (matches.length > 1) {
      throw new Error('Knowledge document identity is ambiguous for current identity.');
    }
    return matches[0] ?? null;
  }
}
