import { sanitizeConversationTitle, fallbackConversationTitle } from '@memoflow/ai-contracts';
import { describe, expect, it } from 'vitest';
import { AIConversation } from '../../../domain/aggregates/ai-conversation';
import { AIConversationMemoryRepository } from '../../../infrastructure/adapters/memory/ai-conversation-memory.repository';
import { UpdateConversationUseCase } from './update-conversation.use-case';

describe('conversation title conditional writes', () => {
  it('rejects an old generation after a manual rename, including ABA names', async () => {
    const repository = new AIConversationMemoryRepository();
    const conversation = AIConversation.create({
      identityId: 'owner',
      name: 'Quick chat',
    });
    await repository.save(conversation);
    const update = new UpdateConversationUseCase(repository);
    const id = String(conversation.id);
    await update.execute('owner', id, { name: 'Manual', expectedVersion: 1 });
    await update.execute('owner', id, {
      name: 'Quick chat',
      expectedVersion: 3,
    });
    const stale = await update.execute('owner', id, {
      name: 'Stale AI',
      expectedVersion: 1,
    });
    expect(stale.ok).toBe(false);
    expect((await repository.findByIdForIdentity('owner', id))?.name).toBe('Quick chat');
  });
});

describe('bounded title generation', () => {
  async function setup(
    generate?: (
      identityId: string,
      input: import('@memoflow/ai-contracts').ConversationTitleGeneration,
    ) => Promise<string>,
  ) {
    const repository = new AIConversationMemoryRepository();
    const conversation = AIConversation.create({
      identityId: 'owner',
      name: 'Quick chat',
    });
    await repository.save(conversation);
    return {
      repository,
      id: String(conversation.id),
      update: new UpdateConversationUseCase(repository, generate),
    };
  }
  const generation = {
    content: '帮我制定学习计划',
    automatic: true,
    providerId: 'selected',
    modelId: 'selected-model',
  };
  it('rejects a late model result and duplicate generation without overwriting a manual title', async () => {
    let resolve!: (value: string) => void;
    const calls: string[] = [];
    const { repository, id, update } = await setup(async (_owner, input) => {
      calls.push(input.modelId!);
      return new Promise<string>((done) => {
        resolve = done;
      });
    });
    const pending = update.execute('owner', id, {
      generateTitle: generation,
      expectedVersion: 1,
    });
    await Promise.resolve();
    expect(
      (
        await update.execute('owner', id, {
          generateTitle: generation,
          expectedVersion: 1,
        })
      ).ok,
    ).toBe(false);
    await update.execute('owner', id, { name: '我的标题', expectedVersion: 1 });
    resolve('旧模型标题');
    expect((await pending).ok).toBe(false);
    expect((await repository.findByIdForIdentity('owner', id))?.name).toBe('我的标题');
    expect(calls).toEqual(['selected-model']);
  });
  it.each(['offline', 'no model'] as const)(
    'uses a safe same-language fallback once for %s',
    async (scenario) => {
      const { id, update } = await setup(async () => {
        throw new Error('offline');
      });
      const input =
        scenario === 'no model' ? { content: generation.content, automatic: true } : generation;
      expect(
        await update.execute('owner', id, {
          generateTitle: input,
          expectedVersion: 1,
        }),
      ).toMatchObject({
        ok: true,
        data: {
          name: generation.content,
          version: 2,
          titleGenerationOutcome: 'fallback',
        },
      });
      expect(
        (
          await update.execute('owner', id, {
            generateTitle: input,
            expectedVersion: 2,
          })
        ).ok,
      ).toBe(false);
    },
  );
  it('uses only the explicit model and permits explicit regeneration of a manual/legacy title', async () => {
    const { id, update } = await setup(async () => ' <学习>\n**计划**\u202E ');
    expect((await update.execute('foreign', id, { generateTitle: generation })).ok).toBe(false);
    await update.execute('owner', id, { name: 'Manual', expectedVersion: 1 });
    expect(
      await update.execute('owner', id, {
        generateTitle: { ...generation, automatic: false },
        expectedVersion: 3,
      }),
    ).toMatchObject({
      ok: true,
      data: { name: '学习 计划', version: 4, titleGenerationOutcome: 'model' },
    });
  });
});

it('gives explicit edits priority if the first automatic title committed before their CAS', async () => {
  const repository = new AIConversationMemoryRepository();
  const conversation = AIConversation.create({ identityId: 'owner', name: 'Quick chat' });
  await repository.save(conversation);
  const update = new UpdateConversationUseCase(repository);
  const id = String(conversation.id);
  await update.execute('owner', id, {
    expectedVersion: 1,
    generateTitle: { content: 'Automatic topic', automatic: true },
  });
  expect(
    await update.execute('owner', id, { name: 'Manual topic', expectedVersion: 1 }),
  ).toMatchObject({ ok: true, data: { name: 'Manual topic', version: 3 } });
});

it('sanitizes controls and markup while preserving meaningful C# punctuation and Unicode title bounds', () => {
  expect(sanitizeConversationTitle(' # **C# basics**\u202E\n <notes> ')).toBe('C# basics notes');
  expect(Array.from(sanitizeConversationTitle('学'.repeat(100)))).toHaveLength(80);
  expect(Array.from(fallbackConversationTitle('🙂'.repeat(100)))).toHaveLength(48);
});
