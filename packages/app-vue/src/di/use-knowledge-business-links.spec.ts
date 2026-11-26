import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/transport-contracts/result';
import type { KnowledgeDocumentRef } from '@memoflow/repository-contracts';
import { GOAL_KNOWLEDGE_SERVICE_KEY, GOAL_SERVICE_KEY } from './keys';
import { useKnowledgeBusinessLinks } from './use-knowledge-business-links';

function fixture() {
  let read!: ReturnType<typeof useKnowledgeBusinessLinks>;
  const relations = { listGoalsForKnowledge: vi.fn(async () => ok([{ goalId: 'goal-1' }])) };
  const goals = { getGoal: vi.fn(async () => ok({ name: 'Knowledge workflow' })) };
  const wrapper = mount(
    defineComponent({
      setup() {
        read = useKnowledgeBusinessLinks();
        return () => null;
      },
    }),
    {
      global: {
        provide: {
          [GOAL_KNOWLEDGE_SERVICE_KEY as symbol]: relations,
          [GOAL_SERVICE_KEY as symbol]: goals,
        },
      },
    },
  );
  return {
    read: (documents: KnowledgeDocumentRef[]) => read(documents),
    relations,
    goals,
    wrapper,
  };
}
describe('Knowledge business labels', () => {
  it('uses stable document refs, deduplicates documents and reads a shared goal label once', async () => {
    const f = fixture();
    const document = {
      knowledgeSpaceId: 'space-1',
      documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440101',
    } as KnowledgeDocumentRef;
    const second = {
      ...document,
      documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440102',
    } as KnowledgeDocumentRef;
    const links = await f.read([document, second, document]);
    expect(f.relations.listGoalsForKnowledge).toHaveBeenCalledTimes(2);
    expect(f.relations.listGoalsForKnowledge).toHaveBeenCalledWith({ knowledgeDocument: document });
    expect(f.goals.getGoal).toHaveBeenCalledTimes(1);
    expect(links.map((link) => link.documentId)).toEqual([document.documentId, second.documentId]);
    expect(links.every((link) => link.title === 'Knowledge workflow')).toBe(true);
    f.wrapper.unmount();
  });
  it('does not turn a failed relation query into an empty list', async () => {
    const f = fixture();
    f.relations.listGoalsForKnowledge.mockResolvedValueOnce(
      fail({ code: 'INTERNAL_ERROR', message: 'Read failed' }) as never,
    );
    await expect(
      f.read([{ knowledgeSpaceId: 'space-1', documentId: 'doc-1' } as KnowledgeDocumentRef]),
    ).rejects.toBeDefined();
    f.wrapper.unmount();
  });
});
