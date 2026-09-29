import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';

const provideMap = new Map<symbol, unknown>();

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    inject: (key: symbol) => provideMap.get(key),
  };
});

vi.mock('../../../shared/utils/useStrictInject', () => ({
  useStrictInject: (key: symbol) => {
    const value = provideMap.get(key);
    if (!value) throw new Error('missing inject');
    return value;
  },
}));

import { DESKTOP_BRIDGE_KEY, REPOSITORY_SERVICE_KEY } from '../../../di/keys';
import { useReferenceableKnowledgeNotes } from './useReferenceableKnowledgeNotes';

describe('useReferenceableKnowledgeNotes', () => {
  beforeEach(() => {
    provideMap.clear();
  });

  it('uses the dedicated durable-document query on web', async () => {
    const listReferenceableKnowledgeDocuments = vi.fn(async () =>
      ok({
        documents: [
          {
            projectionId: 'projection-181',
            connectionId: 'connection-1',
            documentId: 'kdoc_62983f5c-d91f-4766-99c5-0b489a681c32',
            knowledgeSpaceId: 'KnowledgeSpaceId_11111111-1111-4111-8111-111111111111',
            relativePath: 'z/1password.md',
            title: '1Password',
            updatedAt: 100,
          },
        ],
        total: 1,
        nextCursor: null,
      }),
    );
    provideMap.set(REPOSITORY_SERVICE_KEY, {
      listReferenceableKnowledgeDocuments,
      scanLocalVault: vi.fn(),
    });

    const referenceable = useReferenceableKnowledgeNotes();
    await referenceable.load({ limit: 24 });

    expect(listReferenceableKnowledgeDocuments).toHaveBeenCalledWith(
      { limit: 24 },
      { signal: expect.any(AbortSignal) },
    );
    expect(referenceable.notes.value).toEqual([
      {
        documentId: 'kdoc_62983f5c-d91f-4766-99c5-0b489a681c32',
        knowledgeSpaceId: 'KnowledgeSpaceId_11111111-1111-4111-8111-111111111111',
        title: '1Password',
        path: 'z/1password.md',
        updatedAt: 100,
      },
    ]);
  });

  it('cancels the previous web query when picker search changes', async () => {
    let firstSignal: AbortSignal | undefined;
    const listReferenceableKnowledgeDocuments = vi
      .fn()
      .mockImplementationOnce(
        (_request: unknown, options?: { signal?: AbortSignal }) =>
          new Promise((_, reject) => {
            firstSignal = options?.signal;
            options?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      )
      .mockResolvedValueOnce(
        ok({
          documents: [
            {
              projectionId: 'projection-second',
              connectionId: 'connection-1',
              documentId: 'kdoc_33333333-3333-4333-8333-333333333333',
              knowledgeSpaceId: 'KnowledgeSpaceId_11111111-1111-4111-8111-111111111111',
              relativePath: 'z/second.md',
              title: 'Second',
              updatedAt: 200,
            },
          ],
          total: 1,
          nextCursor: null,
        }),
      );
    provideMap.set(REPOSITORY_SERVICE_KEY, {
      listReferenceableKnowledgeDocuments,
      scanLocalVault: vi.fn(),
    });

    const referenceable = useReferenceableKnowledgeNotes();
    const first = referenceable.load({ query: 'first' });
    await Promise.resolve();
    const second = referenceable.load({ query: 'second' });
    await Promise.all([first, second]);

    expect(firstSignal?.aborted).toBe(true);
    expect(referenceable.error.value).toBeNull();
    expect(referenceable.notes.value.map((note) => note.title)).toEqual(['Second']);
  });

  it('uses stable local-vault notes directly on desktop', async () => {
    provideMap.set(DESKTOP_BRIDGE_KEY, {});
    provideMap.set(REPOSITORY_SERVICE_KEY, {
      listReferenceableKnowledgeDocuments: vi.fn(),
      scanLocalVault: vi.fn(async () =>
        ok({
          binding: {
            id: 'LocalVaultBindingId_11111111-1111-4111-8111-111111111111',
            knowledgeSpaceId: 'KnowledgeSpaceId_11111111-1111-4111-8111-111111111111',
            localProfileId: 'profile',
            rootPath: '/vault',
            displayName: 'Vault',
            boundAt: 1,
            detachedAt: null,
          },
          health: {
            bindingId: 'LocalVaultBindingId_11111111-1111-4111-8111-111111111111',
            state: 'Available',
            observedAt: 1,
            detail: null,
          },
          notes: [
            {
              relativePath: 'z/1password.md',
              knowledgeDocumentId: 'kdoc_62983f5c-d91f-4766-99c5-0b489a681c32',
              title: '1Password',
              excerpt: '',
              tags: [],
              outgoingLinks: [],
              size: 1,
              updatedAt: 100,
            },
            {
              relativePath: 'z/unmanaged.md',
              knowledgeDocumentId: null,
              title: 'Unmanaged',
              excerpt: '',
              tags: [],
              outgoingLinks: [],
              size: 1,
              updatedAt: 200,
            },
          ],
          scannedAt: 200,
        }),
      ),
    });

    const referenceable = useReferenceableKnowledgeNotes();
    await referenceable.load({ query: 'password', limit: 24 });

    expect(referenceable.notes.value.map((note) => note.title)).toEqual(['1Password']);
  });
});
