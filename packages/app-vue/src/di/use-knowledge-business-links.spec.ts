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
const document = {
  knowledgeSpaceId: 'space-1',
  documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440101',
} as KnowledgeDocumentRef;
const second = {
  ...document,
  documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440102',
} as KnowledgeDocumentRef;
describe('Knowledge business labels', () => {
  it('uses stable document refs, deduplicates documents and reads a shared goal label once', async () => {
    const f = fixture();
    const links = await f.read([document, second, document]);
    expect(f.relations.listGoalsForKnowledge).toHaveBeenCalledTimes(2);
    expect(f.relations.listGoalsForKnowledge).toHaveBeenCalledWith({ knowledgeDocument: document });
    expect(f.goals.getGoal).toHaveBeenCalledTimes(1);
    expect(links.links.map((link) => link.documentId)).toEqual([
      document.documentId,
      second.documentId,
    ]);
    expect(links.links.every((link) => link.title === 'Knowledge workflow')).toBe(true);
    expect(links.failures).toEqual([]);
    f.wrapper.unmount();
  });
  it('keeps sibling links when one relation query fails', async () => {
    const f = fixture();
    f.relations.listGoalsForKnowledge.mockImplementation(
      (request: { knowledgeDocument: KnowledgeDocumentRef }) =>
        request.knowledgeDocument.documentId === document.documentId
          ? fail({ code: 'INTERNAL_ERROR', message: 'Read failed' })
          : ok([{ goalId: 'goal-1' }]),
    );
    const links = await f.read([document, second]);
    expect(links.links.map((link) => link.documentId)).toEqual([second.documentId]);
    expect(links.failures).toEqual([
      { stage: 'relations', code: 'INTERNAL_ERROR', documentId: document.documentId },
    ]);
    f.wrapper.unmount();
  });
  it('records a structured failure and keeps confirmed links when a thrown query rejects', async () => {
    const f = fixture();
    f.relations.listGoalsForKnowledge.mockImplementation(
      (request: { knowledgeDocument: KnowledgeDocumentRef }) => {
        if (request.knowledgeDocument.documentId === document.documentId)
          return Promise.reject(new Error('socket hang up'));
        return ok([{ goalId: 'goal-1' }]);
      },
    );
    const links = await f.read([document, second]);
    expect(links.links.map((link) => link.documentId)).toEqual([second.documentId]);
    expect(links.failures).toEqual([
      { stage: 'relations', code: 'Error', documentId: document.documentId },
    ]);
    f.wrapper.unmount();
  });
  it('keeps the confirmed relation when the Goal title read fails, falling back to the id', async () => {
    const f = fixture();
    f.goals.getGoal.mockResolvedValueOnce(
      fail({ code: 'SERVICE_UNAVAILABLE', message: 'Goals down' }),
    );
    const links = await f.read([document]);
    expect(links.links).toEqual([
      {
        documentId: document.documentId,
        subjectType: 'goal',
        subjectId: 'goal-1',
        title: 'goal-1',
      },
    ]);
    expect(links.failures).toEqual([
      {
        stage: 'goal-title',
        code: 'SERVICE_UNAVAILABLE',
        subjectId: 'goal-1',
        documentId: document.documentId,
      },
    ]);
    f.wrapper.unmount();
  });
  it('degrades a missing Goal to its id without recording a failure', async () => {
    const f = fixture();
    f.goals.getGoal.mockResolvedValueOnce(fail({ code: 'NOT_FOUND', message: 'gone' }));
    const links = await f.read([document]);
    expect(links.links).toEqual([
      {
        documentId: document.documentId,
        subjectType: 'goal',
        subjectId: 'goal-1',
        title: 'goal-1',
      },
    ]);
    expect(links.failures).toEqual([]);
    f.wrapper.unmount();
  });
  it('reads no relations without the owners bound', async () => {
    let read!: ReturnType<typeof useKnowledgeBusinessLinks>;
    const wrapper = mount(
      defineComponent({
        setup() {
          read = useKnowledgeBusinessLinks();
          return () => null;
        },
      }),
    );
    expect(await read([document])).toEqual({ links: [], failures: [] });
    wrapper.unmount();
  });
});
