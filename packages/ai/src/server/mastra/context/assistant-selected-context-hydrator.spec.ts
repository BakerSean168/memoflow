import { describe, expect, it, vi } from 'vitest';
import type {
  IAISelectedEntityContextReadPort,
  IKnowledgeSourcePort,
} from '../../application/ports';
import { AssistantSelectedContextHydrator } from './assistant-selected-context-hydrator';

function createPorts() {
  const getSelectedEntityContext = vi.fn<
    IAISelectedEntityContextReadPort['getSelectedEntityContext']
  >(async ({ entityType, id }) => ({
    source: `${entityType}.owner.read-model`,
    content: { entityType, id, authoritative: true },
  }));
  const getNoteById = vi.fn<IKnowledgeSourcePort['getNoteById']>(async (_identityId, id) => ({
    identityId: 'identity-a',
    repositoryId: 'repo-1',
    knowledgeSpaceId: 'space-1',
    knowledgeDocumentId: id,
    sourcePath: 'notes/release.md',
    sourceContentHash: 'hash-1',
    sourceVersion: 'commit-1',
    title: 'Release note',
    mimeType: 'text/markdown',
    content: '# Release\nShip it.',
  }));
  return {
    selectedPort: { getSelectedEntityContext } satisfies IAISelectedEntityContextReadPort,
    knowledgePort: {
      getNoteById,
      listRelevantNotes: vi.fn(),
      listIndexableNotes: vi.fn(),
    } satisfies IKnowledgeSourcePort,
    getSelectedEntityContext,
    getNoteById,
  };
}

describe('AssistantSelectedContextHydrator', () => {
  it('hydrates owner-backed goal/task facts and knowledge content while deduplicating selections', async () => {
    const ports = createPorts();
    const hydrator = new AssistantSelectedContextHydrator(ports.selectedPort, ports.knowledgePort);

    const result = await hydrator.hydrate('identity-a', [
      { entityType: 'goal', id: 'goal-1', label: 'client label' },
      { entityType: 'goal', id: 'goal-1', label: 'duplicate label' },
      { entityType: 'task', id: 'task-1' },
      { entityType: 'knowledge_document', id: 'kdoc-1', label: 'Note' },
    ]);

    expect(ports.getSelectedEntityContext).toHaveBeenCalledTimes(2);
    expect(ports.getSelectedEntityContext).toHaveBeenNthCalledWith(1, {
      identityId: 'identity-a',
      entityType: 'goal',
      id: 'goal-1',
    });
    expect(ports.getSelectedEntityContext).toHaveBeenNthCalledWith(2, {
      identityId: 'identity-a',
      entityType: 'task',
      id: 'task-1',
    });
    expect(ports.getNoteById).toHaveBeenCalledTimes(1);
    expect(ports.getNoteById).toHaveBeenCalledWith('identity-a', 'kdoc-1');

    expect(result.domainFacts).toEqual([
      {
        id: 'selected:goal:goal-1',
        source: 'goal.owner.read-model',
        content: { entityType: 'goal', id: 'goal-1', authoritative: true },
        sensitivity: 'private',
        provenanceRef: 'goal:goal-1',
      },
      {
        id: 'selected:task:task-1',
        source: 'task.owner.read-model',
        content: { entityType: 'task', id: 'task-1', authoritative: true },
        sensitivity: 'private',
        provenanceRef: 'task:task-1',
      },
    ]);
    expect(result.knowledgeEvidence).toEqual([
      {
        id: 'selected:knowledge_document:kdoc-1',
        title: 'Release note',
        excerpt: '# Release\nShip it.',
        sourceRef: 'notes/release.md',
        contentHash: 'hash-1',
        sensitivity: 'private',
      },
    ]);
  });

  it('fails soft for stale or temporarily unavailable selections', async () => {
    const selectedPort: IAISelectedEntityContextReadPort = {
      getSelectedEntityContext: vi.fn(async ({ id }) => {
        if (id === 'goal-error') throw new Error('owner unavailable');
        return null;
      }),
    };
    const knowledgePort: IKnowledgeSourcePort = {
      getNoteById: vi.fn(async () => {
        throw new Error('projection unavailable');
      }),
      listRelevantNotes: vi.fn(),
      listIndexableNotes: vi.fn(),
    };
    const hydrator = new AssistantSelectedContextHydrator(selectedPort, knowledgePort);

    await expect(
      hydrator.hydrate('identity-a', [
        { entityType: 'goal', id: 'goal-error' },
        { entityType: 'task', id: 'task-missing' },
        { entityType: 'knowledge_document', id: 'kdoc-missing' },
      ]),
    ).resolves.toEqual({ domainFacts: [], knowledgeEvidence: [] });
  });
});
