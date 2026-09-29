import type { AssistantRuntimeSelectedEntity } from '@memoflow/contracts/ai';
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
          .filter((entity) => entity.entityType === 'knowledge_document')
          .map(async (entity): Promise<AIKnowledgeEvidenceInput | null> => {
            try {
              const note = await this.knowledgeSourcePort.getNoteById(identityId, entity.id);
              if (!note) return null;
              return {
                id: `selected:knowledge_document:${entity.id}`,
                title: note.title,
                excerpt: note.content,
                sourceRef: note.sourcePath,
                contentHash: note.sourceContentHash,
                sensitivity: 'private',
              };
            } catch {
              return null;
            }
          }),
      )
    ).filter((evidence): evidence is AIKnowledgeEvidenceInput => evidence !== null);

    return { domainFacts, knowledgeEvidence };
  }
}
