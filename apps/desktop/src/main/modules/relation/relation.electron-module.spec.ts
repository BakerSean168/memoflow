import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { RelationChannels } from '@memoflow/contracts/electron';
import { createGoalKnowledgeElectronModule } from './relation.electron-module';

const LINK = {
  goalId: 'IGoalId_550e8400-e29b-41d4-a716-446655440000',
  knowledgeDocument: {
    knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440091',
    documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440090',
  },
};
const handlers = new Map<string, (...args: unknown[]) => unknown>();

beforeEach(() => {
  handlers.clear();
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as (...args: unknown[]) => unknown);
  });
  vi.mocked(ipcMain.removeHandler).mockImplementation((channel) => handlers.delete(channel));
});

describe('GoalKnowledge Electron module', () => {
  it('binds all four typed operations to authenticated identity', async () => {
    const relation = { relationId: 'rel-1', ...LINK, createdAt: 1 };
    const service = {
      link: vi.fn().mockResolvedValue(relation),
      unlink: vi.fn().mockResolvedValue(true),
      listForGoal: vi.fn().mockResolvedValue([relation]),
      listGoalsForKnowledge: vi.fn().mockResolvedValue([relation]),
    };
    const module = createGoalKnowledgeElectronModule({ service: service as never });
    module.register({
      db: {} as never,
      auth: { requireRequestContext: vi.fn().mockResolvedValue({ identityId: 'identity-1' }) },
    });
    expect(await handlers.get(RelationChannels.GOAL_KNOWLEDGE_LINK)?.({}, LINK)).toMatchObject({
      ok: true,
    });
    expect(
      await handlers.get(RelationChannels.GOAL_KNOWLEDGE_LIST)?.({}, { goalId: LINK.goalId }),
    ).toMatchObject({ ok: true });
    expect(
      await handlers.get(RelationChannels.GOAL_KNOWLEDGE_REVERSE_LIST)?.(
        {},
        { knowledgeDocument: LINK.knowledgeDocument },
      ),
    ).toMatchObject({ ok: true });
    expect(await handlers.get(RelationChannels.GOAL_KNOWLEDGE_UNLINK)?.({}, LINK)).toMatchObject({
      ok: true,
      data: { unlinked: true },
    });
    expect(service.link).toHaveBeenCalledWith('identity-1', LINK);
    module.destroy?.();
    expect(handlers.size).toBe(0);
  });

  it('rejects path-derived note identities before the service', async () => {
    const service = {
      link: vi.fn(),
      unlink: vi.fn(),
      listForGoal: vi.fn(),
      listGoalsForKnowledge: vi.fn(),
    };
    const module = createGoalKnowledgeElectronModule({ service: service as never });
    module.register({
      db: {} as never,
      auth: { requireRequestContext: vi.fn().mockResolvedValue({ identityId: 'identity-1' }) },
    });
    const result = await handlers.get(RelationChannels.GOAL_KNOWLEDGE_LINK)?.(
      {},
      {
        ...LINK,
        knowledgeDocument: { ...LINK.knowledgeDocument, documentId: 'notes/interview.md' },
      },
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(service.link).not.toHaveBeenCalled();
  });
});
