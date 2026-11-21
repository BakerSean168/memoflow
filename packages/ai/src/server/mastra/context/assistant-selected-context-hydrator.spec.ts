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
      getNoteBySource: vi.fn(),
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

  it('blocks an explicitly selected note that can no longer be read', async () => {
    const selectedPort: IAISelectedEntityContextReadPort = {
      getSelectedEntityContext: vi.fn(async ({ id }) => {
        if (id === 'goal-error') throw new Error('owner unavailable');
        return null;
      }),
    };
    const knowledgePort: IKnowledgeSourcePort = {
      getNoteBySource: vi.fn(),
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
    ).rejects.toMatchObject({ category: 'knowledge_context_stale' });
  });
});

it('hydrates ordinary Markdown through its source snapshot and rejects a stale hash', async () => {
  const ports = createPorts();
  const source = {
    kind: 'local_vault' as const,
    bindingId: 'vault-1',
    relativePath: 'ordinary.md',
    contentHash: 'a'.repeat(64),
  };
  ports.knowledgePort.getNoteBySource.mockResolvedValueOnce({
    identityId: 'identity-a',
    knowledgeDocumentId: null,
    title: 'Ordinary',
    content: '# Authoritative body',
    sourcePath: 'ordinary.md',
    sourceContentHash: source.contentHash,
  });
  const hydrator = new AssistantSelectedContextHydrator(ports.selectedPort, ports.knowledgePort);
  const selection = {
    entityType: 'knowledge_source' as const,
    id: 'source-1',
    label: 'Untrusted label',
    source,
  };
  expect((await hydrator.hydrate('identity-a', [selection])).knowledgeEvidence[0]).toMatchObject({
    title: 'Ordinary',
    excerpt: '# Authoritative body',
  });
  expect(ports.knowledgePort.getNoteBySource).toHaveBeenCalledWith('identity-a', source);
  ports.knowledgePort.getNoteBySource.mockResolvedValueOnce(null);
  await expect(hydrator.hydrate('identity-a', [selection])).rejects.toMatchObject({
    category: 'knowledge_context_stale',
  });
});
