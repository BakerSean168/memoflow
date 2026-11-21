import { webcrypto } from 'node:crypto';
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import { repositoryUiHost } from '../repository-ui-host';
import { useKnowledgeContextNotes } from './useKnowledgeContextNotes';

function host(service: object, desktop: boolean) {
  let context!: ReturnType<typeof useKnowledgeContextNotes>;
  const wrapper = mount(
    defineComponent({
      setup: () => {
        context = useKnowledgeContextNotes();
        return () => h('div');
      },
    }),
    {
      global: {
        provide: {
          [repositoryUiHost.REPOSITORY_SERVICE_KEY as symbol]: service,
          ...(desktop ? { [repositoryUiHost.DESKTOP_BRIDGE_KEY as symbol]: {} } : {}),
        },
      },
    },
  );
  return { context, wrapper };
}
async function search(context: ReturnType<typeof useKnowledgeContextNotes>, query: string) {
  context.search(query);
  await vi.advanceTimersByTimeAsync(180);
  await vi.waitFor(() => expect(context.isLoading.value).toBe(false));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('knowledge context candidates', () => {
  it('finds ordinary Markdown outside the recent twenty by path and alias, without writes', async () => {
    const notes = Array.from({ length: 30 }, (_, i) => ({
      title: `Recent ${i}`,
      relativePath: `recent/${i}.md`,
      aliases: [],
      updatedAt: 1000 + i,
      knowledgeDocumentId: null,
      contentHash: 'a'.repeat(64),
    }));
    notes.push({
      title: 'Older ordinary note',
      relativePath: 'archive/rare-subject.md',
      aliases: ['独特别名'],
      updatedAt: 1,
      knowledgeDocumentId: null,
      contentHash: 'b'.repeat(64),
    });
    const service = {
      scanLocalVault: vi.fn(async () => ok({ binding: { id: 'local-1' }, notes })),
    };
    const { context, wrapper } = host(service, true);
    await search(context, 'rare-subject');
    expect(context.notes.value).toEqual([
      expect.objectContaining({
        title: 'Older ordinary note',
        source: {
          kind: 'local_vault',
          bindingId: 'local-1',
          relativePath: 'archive/rare-subject.md',
          contentHash: 'b'.repeat(64),
        },
      }),
    ]);
    await search(context, '独特别名');
    expect(context.notes.value).toHaveLength(1);
    expect(service.scanLocalVault).toHaveBeenCalledTimes(1);
    context.cancel();
    await search(context, 'rare-subject');
    expect(service.scanLocalVault).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
  it('queries Web at the source and ignores a late response from a previous query', async () => {
    let resolveOld!: (value: unknown) => void;
    const old = new Promise((resolve) => {
      resolveOld = resolve;
    });
    const candidate = {
      connectionId: 'remote-1',
      title: 'New result',
      relativePath: 'notes/new.md',
      contentHash: 'c'.repeat(64),
      updatedAt: 1,
    };
    const list = vi
      .fn()
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce(ok({ notes: [candidate] }));
    const { context, wrapper } = host({ listKnowledgeNoteProjections: list }, false);
    context.search('old');
    await vi.advanceTimersByTimeAsync(180);
    await search(context, 'new');
    expect(list.mock.calls[0]?.[1]?.signal.aborted).toBe(true);
    expect(list).toHaveBeenLastCalledWith(
      { query: 'new', limit: 12 },
      { signal: expect.any(AbortSignal) },
    );
    resolveOld(ok({ notes: [{ ...candidate, title: 'Old result' }] }));
    await flushPromises();
    expect(context.notes.value[0]?.title).toBe('New result');
    wrapper.unmount();
  });
});
