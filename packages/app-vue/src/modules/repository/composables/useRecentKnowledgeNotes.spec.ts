import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, fail } from '@memoflow/contracts/result';

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
import {
  createTestServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
} from '../../../platform/server-state';
import { useRecentKnowledgeNotes } from './useRecentKnowledgeNotes';

let runtime: ReturnType<typeof createTestServerStateRuntime>;

describe('useRecentKnowledgeNotes', () => {
  beforeEach(() => {
    provideMap.clear();
    runtime = createTestServerStateRuntime();
    provideMap.set(SERVER_STATE_RUNTIME_KEY, runtime);
    provideMap.set(SERVER_STATE_IDENTITY_SCOPE_KEY, () => 'test-identity');
  });

  afterEach(() => {
    runtime.dispose();
  });

  it('loads globally recent GitHub note projections on web', async () => {
    const listKnowledgeNoteProjections = vi.fn(async () =>
      ok({
        notes: [
          {
            id: 'note-2',
            connectionId: 'conn-1',
            knowledgeDocumentId: null,
            relativePath: 'b.md',
            title: 'B',
            contentHash: 'h2',
            updatedAt: 20,
          },
          {
            id: 'note-1',
            connectionId: 'conn-1',
            knowledgeDocumentId: null,
            relativePath: 'a.md',
            title: 'A',
            contentHash: 'h1',
            updatedAt: 10,
          },
        ],
        total: 2,
        nextCursor: null,
      }),
    );
    provideMap.set(REPOSITORY_SERVICE_KEY, {
      listKnowledgeNoteProjections,
      scanLocalVault: vi.fn(),
    });

    const recent = useRecentKnowledgeNotes();
    await recent.load(5);

    expect(listKnowledgeNoteProjections).toHaveBeenCalledWith({ limit: 5, sort: 'recent' });
    expect(recent.error.value).toBeNull();
    expect(recent.notes.value.map((note) => note.id)).toEqual(['note-2', 'note-1']);
    expect(recent.notes.value[0]?.source).toBe('projection');
  });

  it('reuses a fresh recent-note projection across lightweight reads and refreshes only when forced', async () => {
    const listKnowledgeNoteProjections = vi.fn(async () =>
      ok({
        notes: [
          {
            id: 'note-1',
            connectionId: 'conn-1',
            knowledgeDocumentId: null,
            relativePath: 'a.md',
            title: 'A',
            contentHash: 'h1',
            updatedAt: 10,
          },
        ],
        total: 1,
        nextCursor: null,
      }),
    );
    provideMap.set(REPOSITORY_SERVICE_KEY, {
      listKnowledgeNoteProjections,
      scanLocalVault: vi.fn(),
    });

    const first = useRecentKnowledgeNotes();
    await first.ensure(5);
    await first.ensure(5);
    expect(listKnowledgeNoteProjections).toHaveBeenCalledTimes(1);

    const second = useRecentKnowledgeNotes();
    await second.ensure(5);
    expect(second.notes.value[0]?.title).toBe('A');
    expect(listKnowledgeNoteProjections).toHaveBeenCalledTimes(1);

    await second.load(5);
    expect(listKnowledgeNoteProjections).toHaveBeenCalledTimes(2);
  });

  it('loads local vault notes on desktop', async () => {
    provideMap.set(DESKTOP_BRIDGE_KEY, {});
    provideMap.set(REPOSITORY_SERVICE_KEY, {
      listKnowledgeNoteProjections: vi.fn(),
      scanLocalVault: vi.fn(async () =>
        ok({
          binding: { ownerId: 'owner', vaultPath: '/vault', selectedAt: 1 },
          notes: [
            {
              relativePath: 'older.md',
              knowledgeDocumentId: 'kdoc_11111111-1111-4111-8111-111111111111',
              title: 'Older',
              excerpt: '',
              tags: [],
              outgoingLinks: [],
              size: 1,
              updatedAt: 5,
            },
            {
              relativePath: 'newer.md',
              knowledgeDocumentId: 'kdoc_22222222-2222-4222-8222-222222222222',
              title: 'Newer',
              excerpt: '',
              tags: [],
              outgoingLinks: [],
              size: 1,
              updatedAt: 50,
            },
          ],
          scannedAt: 100,
        }),
      ),
    });

    const recent = useRecentKnowledgeNotes();
    await recent.load(5);

    expect(recent.error.value).toBeNull();
    expect(recent.notes.value.map((note) => note.id)).toEqual(['newer.md', 'older.md']);
    expect(recent.notes.value[0]?.source).toBe('local-vault');
    expect(recent.notes.value[0]?.knowledgeDocumentId).toBe(
      'kdoc_22222222-2222-4222-8222-222222222222',
    );
  });

  it('treats missing projections as an empty list', async () => {
    provideMap.set(REPOSITORY_SERVICE_KEY, {
      listKnowledgeNoteProjections: vi.fn(async () =>
        fail({ code: 'SERVICE_UNAVAILABLE', message: 'unavailable' }),
      ),
      scanLocalVault: vi.fn(),
    });

    const recent = useRecentKnowledgeNotes();
    await recent.load(5);

    expect(recent.error.value).toBeNull();
    expect(recent.notes.value).toEqual([]);
  });

  it('degrades explicitly on EMAIL_VERIFICATION_REQUIRED instead of throwing', async () => {
    const list = vi.fn(async () =>
      fail({
        code: 'FORBIDDEN',
        domainCode: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Email verification required',
        messageKey: 'errors.EMAIL_VERIFICATION_REQUIRED',
      } as never),
    );
    provideMap.set(REPOSITORY_SERVICE_KEY, {
      listKnowledgeNoteProjections: list,
      scanLocalVault: vi.fn(),
    });

    const recent = useRecentKnowledgeNotes();
    await recent.load(5);
    await recent.load(5);

    expect(recent.notes.value).toEqual([]);
    expect(recent.emailVerificationRequired.value).toBe(true);
    expect(recent.errorMessageKey.value).toBe('errors.EMAIL_VERIFICATION_REQUIRED');
    expect(recent.error.value).toBeTruthy();
    // Service may still be called; transport fuse lives in http-client.
    // UI must not throw / leave silent empty without the degrade flag.
    expect(list).toHaveBeenCalled();
  });
});
