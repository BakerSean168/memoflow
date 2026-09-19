import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { useRecentKnowledgeNotes } from './useRecentKnowledgeNotes';

describe('useRecentKnowledgeNotes', () => {
  beforeEach(() => {
    provideMap.clear();
  });

  it('loads GitHub note projections on web', async () => {
    provideMap.set(REPOSITORY_SERVICE_KEY, {
      listKnowledgeNoteProjections: vi.fn(async () =>
        ok({
          notes: [
            {
              id: 'note-2',
              connectionId: 'conn-1',
              relativePath: 'b.md',
              title: 'B',
              commitSha: 'c2',
              blobSha: 'b2',
              contentHash: 'h2',
              frontmatter: {},
              markdownContent: '# B',
              createdAt: 1,
              updatedAt: 20,
              deletedAt: null,
            },
            {
              id: 'note-1',
              connectionId: 'conn-1',
              relativePath: 'a.md',
              title: 'A',
              commitSha: 'c1',
              blobSha: 'b1',
              contentHash: 'h1',
              frontmatter: {},
              markdownContent: '# A',
              createdAt: 1,
              updatedAt: 10,
              deletedAt: null,
            },
          ],
        }),
      ),
      scanLocalVault: vi.fn(),
    });

    const recent = useRecentKnowledgeNotes();
    await recent.load(5);

    expect(recent.error.value).toBeNull();
    expect(recent.notes.value.map((note) => note.id)).toEqual(['note-2', 'note-1']);
    expect(recent.notes.value[0]?.source).toBe('projection');
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
              title: 'Older',
              excerpt: '',
              tags: [],
              outgoingLinks: [],
              size: 1,
              updatedAt: 5,
            },
            {
              relativePath: 'newer.md',
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
