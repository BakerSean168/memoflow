import { inject } from 'vue';
import type { KnowledgeDocumentRef } from '@memoflow/repository-contracts';
import { unwrapOrThrowError } from '@memoflow/transport-contracts/result';
import type { KnowledgeBusinessLink } from '@memoflow/repository-ui/host';
import { GOAL_KNOWLEDGE_SERVICE_KEY, GOAL_SERVICE_KEY } from './keys';

/** Resolve business labels through their owners; paths never become relation identities. */
export function useKnowledgeBusinessLinks() {
  const relations = inject(GOAL_KNOWLEDGE_SERVICE_KEY, null);
  const goals = inject(GOAL_SERVICE_KEY, null);
  return async (documents: KnowledgeDocumentRef[]): Promise<KnowledgeBusinessLink[]> => {
    if (!relations) return [];
    const titles = new Map<string, Promise<string>>();
    const title = (id: string) => {
      if (!titles.has(id))
        titles.set(
          id,
          (async () => {
            if (!goals) return id;
            const result = await goals.getGoal(id);
            if (!result.ok && result.error.code === 'NOT_FOUND') return id;
            return unwrapOrThrowError(result).name;
          })(),
        );
      return titles.get(id)!;
    };
    const result: KnowledgeBusinessLink[] = [];
    const unique = [
      ...new Map(documents.map((document) => [document.documentId, document])).values(),
    ];
    for (let offset = 0; offset < unique.length; offset += 8) {
      const batch = await Promise.all(
        unique.slice(offset, offset + 8).map(async (document) => {
          const edges = unwrapOrThrowError(
            await relations.listGoalsForKnowledge({ knowledgeDocument: document }),
          );
          return Promise.all(
            edges.map(async (edge) => ({
              documentId: document.documentId,
              subjectType: 'goal' as const,
              subjectId: edge.goalId,
              title: await title(edge.goalId),
            })),
          );
        }),
      );
      result.push(...batch.flat());
    }
    return result;
  };
}
