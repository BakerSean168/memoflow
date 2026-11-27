import { inject } from 'vue';
import type { KnowledgeDocumentRef } from '@memoflow/repository-contracts';
import type {
  KnowledgeBusinessLink,
  KnowledgeBusinessLinks,
  KnowledgeLinkFailure,
} from '@memoflow/repository-ui/host';
import { GOAL_KNOWLEDGE_SERVICE_KEY, GOAL_SERVICE_KEY } from './keys';

/** Documents queried per pass; sequence and batching stay unchanged. */
const BATCH_SIZE = 8;

/**
 * Classify a thrown value without leaking its message.
 *
 * A `ResultErrorException` exposes its code; anything else is reduced to its
 * constructor name so callers still see the failure type they can act on.
 */
function failureCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code) return code;
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string' && name) return name;
  }
  return 'UNKNOWN';
}

/** Resolve business labels through their owners; paths never become relation identities. */
export function useKnowledgeBusinessLinks() {
  const relations = inject(GOAL_KNOWLEDGE_SERVICE_KEY, null);
  const goals = inject(GOAL_SERVICE_KEY, null);
  return async (documents: KnowledgeDocumentRef[]): Promise<KnowledgeBusinessLinks> => {
    if (!relations) return { links: [], failures: [] };
    const titles = new Map<string, Promise<{ title: string; failure?: KnowledgeLinkFailure }>>();
    const title = (id: string) => {
      if (!titles.has(id))
        titles.set(
          id,
          (async () => {
            // No Goal owner bound: the id is the only label available, and that is
            // not a failure of this read.
            if (!goals) return { title: id };
            try {
              const result = await goals.getGoal(id);
              if (!result.ok && result.error.code === 'NOT_FOUND') return { title: id };
              if (!result.ok)
                return {
                  title: id,
                  failure: { stage: 'goal-title', code: result.error.code, subjectId: id },
                };
              return { title: result.data.name };
            } catch (error) {
              return {
                title: id,
                failure: { stage: 'goal-title', code: failureCode(error), subjectId: id },
              };
            }
          })(),
        );
      return titles.get(id)!;
    };
    const result: KnowledgeBusinessLink[] = [];
    const failures: KnowledgeLinkFailure[] = [];
    const unique = [
      ...new Map(documents.map((document) => [document.documentId, document])).values(),
    ];
    for (let offset = 0; offset < unique.length; offset += BATCH_SIZE) {
      const batch = await Promise.all(
        unique.slice(offset, offset + BATCH_SIZE).map(async (document) => {
          const links: KnowledgeBusinessLink[] = [];
          try {
            const listed = await relations.listGoalsForKnowledge({ knowledgeDocument: document });
            if (listed.ok) {
              const edges = await Promise.all(
                listed.data.map(async (edge) => {
                  const label = await title(edge.goalId);
                  if (label.failure)
                    failures.push({ ...label.failure, documentId: document.documentId });
                  return {
                    documentId: document.documentId,
                    subjectType: 'goal' as const,
                    subjectId: edge.goalId,
                    title: label.title,
                  };
                }),
              );
              links.push(...edges);
            } else {
              // A rejected relation query down to this document only: its siblings
              // keep their links and the failure is recorded for diagnostics.
              failures.push({
                stage: 'relations',
                code: listed.error.code,
                documentId: document.documentId,
              });
            }
          } catch (error) {
            failures.push({
              stage: 'relations',
              code: failureCode(error),
              documentId: document.documentId,
            });
          }
          return links;
        }),
      );
      result.push(...batch.flat());
    }
    return { links: result, failures };
  };
}
