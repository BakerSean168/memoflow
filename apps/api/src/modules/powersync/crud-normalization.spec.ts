import { executeCrudBatch } from './crud-executor.js';
import { describe, expect, it, vi } from 'vitest';
import { normalizeCrudData } from './crud-normalization';

describe('normalizeCrudData', () => {
  it('decodes PowerSync JSON text for Prisma scalar-list fields', () => {
    expect(normalizeCrudData('goals', { tags: '["work","focus"]' })).toEqual({
      tags: ['work', 'focus'],
    });
  });

  it('does not normalize retired Account.settings as a writable JSON field', () => {
    expect(
      normalizeCrudData('accounts', {
        profile: '{"nickname":"Sean"}',
        settings: '{"timezone":"UTC"}',
      }),
    ).toEqual({
      profile: { nickname: 'Sean' },
      settings: '{"timezone":"UTC"}',
    });
  });

  it('does not treat retired Account auth/contact flags as owned booleans', () => {
    expect(
      normalizeCrudData('accounts', {
        email_is_verified: 1,
        email_is_primary: 'false',
        phone_is_verified: 0,
      }),
    ).toEqual({
      emailIsVerified: 1,
      emailIsPrimary: 'false',
      phoneIsVerified: 0,
    });
  });

  it('decodes canonical preference payload JSON before Prisma persistence', () => {
    expect(
      normalizeCrudData('user_preference_records', {
        payload: '{"theme":"dark","language":"zh-CN"}',
      }),
    ).toEqual({
      payload: { theme: 'dark', language: 'zh-CN' },
    });
  });

  it('keeps JSON-looking text when the Prisma column is intentionally a string', () => {
    expect(normalizeCrudData('task_plans', { tags: '["work"]' })).toEqual({
      tags: '["work"]',
    });
  });

  it('maps expanded task-goal relation columns without reviving the JSON binding', () => {
    expect(
      normalizeCrudData('task_plans', {
        goal_id: 'goal-1',
        key_result_id: 'kr-1',
        goal_record_value: 2.5,
        goal_progress_trigger: 'EachCompletion',
      }),
    ).toEqual({
      goalId: 'goal-1',
      keyResultId: 'kr-1',
      goalRecordValue: 2.5,
      goalProgressTrigger: 'EachCompletion',
    });
  });

  it('keeps malformed JSON unchanged instead of corrupting an upload batch', () => {
    expect(normalizeCrudData('goals', { tags: '[invalid]' })).toEqual({
      tags: '[invalid]',
    });
  });
});

describe('AI conversation archive state upload', () => {
  it.each(['Archived', 'Active'])(
    'preserves activity order and ownership for a changed-column %s patch',
    async (status) => {
      const updatedAt = new Date('2026-10-01T00:00:00Z');
      const delegate = {
        upsert: vi.fn(),
        deleteMany: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(async () => ({ updatedAt })),
      };
      const db = {
        $transaction: async <T>(work: (tx: { aiConversation: typeof delegate }) => Promise<T>) =>
          work({ aiConversation: delegate }),
      };
      await executeCrudBatch(db, 'owner', [
        { ops: [{ op: 'PATCH', type: 'ai_conversations', id: 'conversation', data: { status } }] },
      ]);
      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: 'conversation', identityId: 'owner', deletedAt: null },
        select: { updatedAt: true },
      });
      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: 'conversation', identityId: 'owner', deletedAt: null },
        data: { status, identityId: 'owner', updatedAt },
      });
      expect(delegate.upsert).not.toHaveBeenCalled();
    },
  );
  it('acknowledges a stale archive for a deleted/foreign conversation without recreating it', async () => {
    const delegate = {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(async () => null),
    };
    const db = {
      $transaction: async <T>(work: (tx: { aiConversation: typeof delegate }) => Promise<T>) =>
        work({ aiConversation: delegate }),
    };
    await executeCrudBatch(db, 'owner', [
      {
        ops: [{ op: 'PATCH', type: 'ai_conversations', id: 'deleted', data: { status: 'Active' } }],
      },
    ]);
    expect(delegate.update).not.toHaveBeenCalled();
    expect(delegate.upsert).not.toHaveBeenCalled();
  });
});

describe('conversation title upload ordering', () => {
  it.each([
    ['automatic', 'manual'],
    ['manual', 'automatic'],
  ] as const)(
    'keeps manual titles across offline uploads in order %s then %s',
    async (first, second) => {
      const current = {
        name: '快速对话',
        version: 1,
        identityId: 'owner',
        deletedAt: null as Date | null,
      };
      const delegate = {
        upsert: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn(),
        updateMany: vi.fn(async ({ where, data }) => {
          if (
            where.identityId === current.identityId &&
            !current.deletedAt &&
            current.version < where.version.lt
          )
            Object.assign(current, data);
        }),
      };
      const db = {
        $transaction: async <T>(work: (tx: { aiConversation: typeof delegate }) => Promise<T>) =>
          work({ aiConversation: delegate }),
      };
      const upload = (kind: string, owner = 'owner') =>
        executeCrudBatch(db, owner, [
          {
            ops: [
              {
                op: 'PATCH',
                type: 'ai_conversations',
                id: 'conversation',
                data:
                  kind === 'manual'
                    ? { name: '人工标题', version: 3 }
                    : { name: '自动标题', version: 2 },
              },
            ],
          },
        ]);
      await upload(first);
      await upload(second);
      await upload('automatic');
      expect(current.name).toBe('人工标题');
      expect(current.version).toBe(3);
      await upload('manual', 'foreign');
      expect(current.identityId).toBe('owner');
      expect(delegate.update).not.toHaveBeenCalled();
    },
  );
});

it('preserves an archive coalesced with a title patch without carrying the stale name into the status write', async () => {
  const updatedAt = new Date('2026-10-31T00:00:00Z');
  const delegate = {
    upsert: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(async () => ({ updatedAt })),
  };
  const db = {
    $transaction: async <T>(work: (tx: { aiConversation: typeof delegate }) => Promise<T>) =>
      work({ aiConversation: delegate }),
  };
  await executeCrudBatch(db, 'owner', [
    {
      ops: [
        {
          op: 'PATCH',
          type: 'ai_conversations',
          id: 'conversation',
          data: { name: 'old auto', version: 2, status: 'Archived' },
        },
      ],
    },
  ]);
  expect(delegate.update).toHaveBeenCalledWith({
    where: { id: 'conversation', identityId: 'owner', deletedAt: null },
    data: { status: 'Archived', updatedAt },
  });
});
