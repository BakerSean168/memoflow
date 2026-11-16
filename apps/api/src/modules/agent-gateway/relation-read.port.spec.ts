import { describe, expect, it, vi } from 'vitest';
import { bindRelationReadPort } from './relation-read.port';
import type { RelationDTO } from '@memoflow/relation-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';

const context: ExecutionContext = {
  identityId: 'owner-me',
  requestId: 'req-1',
  traceId: 'trace-1',
  startedAt: Date.now(),
  source: 'http',
};

function fixture(overrides?: {
  forwardRows?: RelationDTO[];
  reverseRows?: RelationDTO[];
  visibleGoals?: Set<string>;
  visibleTasks?: Set<string>;
  visibleNotes?: Set<string>;
}) {
  const visibleGoals = overrides?.visibleGoals ?? new Set(['goal-1', 'goal-2']);
  const visibleTasks = overrides?.visibleTasks ?? new Set(['task-1', 'task-2']);
  const visibleNotes = overrides?.visibleNotes ?? new Set(['note-1', 'note-2']);

  const relationService = {
    forward: vi.fn().mockImplementation(async (_owner: string, _subject: unknown) => {
      return overrides?.forwardRows ?? [];
    }),
    reverse: vi.fn().mockImplementation(async (_owner: string, _object: unknown) => {
      return overrides?.reverseRows ?? [];
    }),
  };

  const goals = {
    getGoal: vi.fn().mockImplementation(async (id: string) => {
      if (visibleGoals.has(id)) {
        return { id, name: `Goal ${id}`, status: 'active', keyResults: [] } as never;
      }
      return null;
    }),
  };

  const tasks = {
    getTaskPlan: vi.fn().mockImplementation(async (id: string) => {
      if (visibleTasks.has(id)) {
        return { id, title: `Task ${id}` } as never;
      }
      return null;
    }),
  };

  const knowledge = {
    resolve: vi.fn().mockImplementation(async (owner: string, id: string) => {
      if (owner === 'owner-me' && visibleNotes.has(id)) {
        return { documentId: id, knowledgeSpaceId: 'space-1', path: `${id}.md` } as never;
      }
      return null;
    }),
  };

  const port = bindRelationReadPort({
    relationService,
    goals,
    tasks,
    knowledge,
  });

  return { port, relationService, goals, tasks, knowledge };
}

describe('bindRelationReadPort (#994)', () => {
  it('1. 空关系：节点无任何关系时返回空列表与 hasMore: false', async () => {
    const { port } = fixture({ forwardRows: [], reverseRows: [] });
    const result = await port.getNeighbors(
      {
        node: { type: 'goal', id: 'goal-1' },
        limit: 10,
      },
      context,
    );
    expect(result).toEqual({
      items: [],
      total: 0,
      hasMore: false,
    });
  });

  it('2. 类型过滤：按 relationType 与 targetType 筛选并支持知识节点别名', async () => {
    const forwardRows: RelationDTO[] = [
      {
        id: 'rel-1',
        subject: { type: 'goal', id: 'goal-1' },
        relationType: 'related',
        object: { type: 'note', id: 'note-1' },
        createdAt: 1000,
      },
      {
        id: 'rel-2',
        subject: { type: 'goal', id: 'goal-1' },
        relationType: 'depends_on',
        object: { type: 'task', id: 'task-1' },
        createdAt: 2000,
      },
      {
        id: 'rel-3',
        subject: { type: 'goal', id: 'goal-1' },
        relationType: 'related',
        object: { type: 'goal', id: 'goal-2' },
        createdAt: 3000,
      },
    ];

    const { port } = fixture({ forwardRows, reverseRows: [] });

    // 过滤 relationType = related
    const relatedResult = await port.getNeighbors(
      {
        node: { type: 'goal', id: 'goal-1' },
        relationType: 'related',
        limit: 10,
      },
      context,
    );
    expect(relatedResult.items.map((r) => r.relationId)).toEqual(['rel-1', 'rel-3']);

    // 过滤 targetType = knowledge (归一化为 note)
    const knowledgeResult = await port.getNeighbors(
      {
        node: { type: 'goal', id: 'goal-1' },
        targetType: 'knowledge',
        limit: 10,
      },
      context,
    );
    expect(knowledgeResult.items).toHaveLength(1);
    expect(knowledgeResult.items[0]).toMatchObject({
      relationId: 'rel-1',
      relationType: 'related',
      direction: 'outgoing',
      targetNode: { type: 'knowledge', id: 'note-1' },
    });
  });

  it('3. 分页：支持有界 limit 与 offset 分页，正确设置 hasMore', async () => {
    const forwardRows: RelationDTO[] = [
      {
        id: 'rel-1',
        subject: { type: 'goal', id: 'goal-1' },
        relationType: 'related',
        object: { type: 'note', id: 'note-1' },
        createdAt: 1000,
      },
      {
        id: 'rel-2',
        subject: { type: 'goal', id: 'goal-1' },
        relationType: 'related',
        object: { type: 'note', id: 'note-2' },
        createdAt: 2000,
      },
      {
        id: 'rel-3',
        subject: { type: 'goal', id: 'goal-1' },
        relationType: 'depends_on',
        object: { type: 'task', id: 'task-1' },
        createdAt: 3000,
      },
    ];

    const { port } = fixture({ forwardRows, reverseRows: [] });

    // 第 1 页 limit = 2
    const page1 = await port.getNeighbors(
      {
        node: { type: 'goal', id: 'goal-1' },
        limit: 2,
        offset: 0,
      },
      context,
    );
    expect(page1.items).toHaveLength(2);
    expect(page1.items.map((i) => i.relationId)).toEqual(['rel-1', 'rel-2']);
    expect(page1.hasMore).toBe(true);
    expect(page1.total).toBe(3);

    // 第 2 页 limit = 2, offset = 2
    const page2 = await port.getNeighbors(
      {
        node: { type: 'goal', id: 'goal-1' },
        limit: 2,
        offset: 2,
      },
      context,
    );
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].relationId).toBe('rel-3');
    expect(page2.hasMore).toBe(false);
  });

  it('4. 跨 owner 不可见：对端不可见节点直接省略，查询不可见节点返回空', async () => {
    // note-invisible 属于他人/已被删，goal-other 属于他人/不可见
    const forwardRows: RelationDTO[] = [
      {
        id: 'rel-visible',
        subject: { type: 'goal', id: 'goal-1' },
        relationType: 'related',
        object: { type: 'note', id: 'note-1' }, // visible
        createdAt: 1000,
      },
      {
        id: 'rel-invisible-peer-note',
        subject: { type: 'goal', id: 'goal-1' },
        relationType: 'related',
        object: { type: 'note', id: 'note-invisible' }, // invisible
        createdAt: 2000,
      },
      {
        id: 'rel-invisible-peer-goal',
        subject: { type: 'goal', id: 'goal-1' },
        relationType: 'contributes_to',
        object: { type: 'goal', id: 'goal-other' }, // invisible
        createdAt: 3000,
      },
    ];

    const { port, relationService } = fixture({
      forwardRows,
      reverseRows: [],
      visibleGoals: new Set(['goal-1']),
      visibleNotes: new Set(['note-1']),
      visibleTasks: new Set(),
    });

    // 查询可见的 goal-1，指向 note-invisible 和 goal-other 的边直接被省略，不泄露其存在
    const result = await port.getNeighbors(
      {
        node: { type: 'goal', id: 'goal-1' },
        limit: 10,
      },
      context,
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].relationId).toBe('rel-visible');
    expect(result.items[0].targetNode).toEqual({ type: 'knowledge', id: 'note-1' });

    // 查询不可见的 goal-other，直接返回空，且不调用底层关系查询
    const invisibleResult = await port.getNeighbors(
      {
        node: { type: 'goal', id: 'goal-other' },
        limit: 10,
      },
      context,
    );
    expect(invisibleResult).toEqual({
      items: [],
      hasMore: false,
    });
    // relationService forward should only have been called once (for the first query)
    expect(relationService.forward).toHaveBeenCalledTimes(1);
  });
});
