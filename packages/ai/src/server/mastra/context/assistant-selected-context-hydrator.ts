import { AIExecutionError } from '../../../shared/ai-execution-error';
import type { AssistantRuntimeSelectedEntity } from '@memoflow/ai-contracts';
import type {
  IAISelectedEntityContextReadPort,
  IKnowledgeSourcePort,
} from '../../application/ports';
import type { AIContextSectionInput, AIKnowledgeEvidenceInput } from './ai-context-assembler';

export interface AssistantSelectedContextHydration {
  readonly domainFacts: readonly AIContextSectionInput[];
  readonly knowledgeEvidence: readonly AIKnowledgeEvidenceInput[];
}

function uniqueSelections(
  selections: readonly AssistantRuntimeSelectedEntity[],
): AssistantRuntimeSelectedEntity[] {
  const seen = new Set<string>();
  const unique: AssistantRuntimeSelectedEntity[] = [];
  for (const selection of selections) {
    const key = `${selection.entityType}:${selection.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(selection);
  }
  return unique;
}

/**
 * Resolves explicit composer references through owner-backed read seams before a
 * model invocation. Client labels/ids remain hints only; the model receives
 * authoritative Goal/Task projections and hydrated knowledge-note content from
 * server-owned sources.
 */
export class AssistantSelectedContextHydrator {
  constructor(
    private readonly selectedEntityContextReadPort: IAISelectedEntityContextReadPort,
    private readonly knowledgeSourcePort: IKnowledgeSourcePort,
  ) {}

  async hydrate(
    identityId: string,
    selections: readonly AssistantRuntimeSelectedEntity[],
  ): Promise<AssistantSelectedContextHydration> {
    const selected = uniqueSelections(selections);

    const domainFacts = (
      await Promise.all(
        selected
          .filter((entity) => entity.entityType === 'goal' || entity.entityType === 'task')
          .map(async (entity): Promise<AIContextSectionInput | null> => {
            try {
              const projection = await this.selectedEntityContextReadPort.getSelectedEntityContext({
                identityId,
                entityType: entity.entityType,
                id: entity.id,
              });
              return projection
                ? {
                    id: `selected:${entity.entityType}:${entity.id}`,
                    source: projection.source,
                    content: projection.content,
                    sensitivity: 'private',
                    provenanceRef: `${entity.entityType}:${entity.id}`,
                  }
                : null;
            } catch {
              // Stale/deleted selections should not block an otherwise valid chat turn.
              return null;
            }
          }),
      )
    ).filter((section): section is AIContextSectionInput => section !== null);

    const knowledgeEvidence = (
      await Promise.all(
        selected
          .filter(
            (entity) =>
              entity.entityType === 'knowledge_document' ||
              entity.entityType === 'knowledge_source',
          )
          .map(async (entity): Promise<AIKnowledgeEvidenceInput | null> => {
            try {
              const note =
                entity.entityType === 'knowledge_source'
                  ? await this.knowledgeSourcePort.getNoteBySource(identityId, entity.source)
                  : await this.knowledgeSourcePort.getNoteById(identityId, entity.id);
              if (!note)
                throw new AIExecutionError(
                  'knowledge_context_stale',
                  'A selected note changed or is no longer connected. Select the note again.',
                );
              return {
                id: `selected:${entity.entityType}:${entity.id}`,
                title: note.title,
                excerpt: note.content,
                sourceRef: note.sourcePath,
                contentHash: note.sourceContentHash,
                sensitivity: 'private',
              };
            } catch (error) {
              if (error instanceof AIExecutionError) throw error;
              throw new AIExecutionError(
                'knowledge_context_stale',
                'The selected note could not be read. Reconnect the source or select it again.',
                { cause: error },
              );
            }
          }),
      )
    ).filter((evidence): evidence is AIKnowledgeEvidenceInput => evidence !== null);

    return { domainFacts, knowledgeEvidence };
  }
}
