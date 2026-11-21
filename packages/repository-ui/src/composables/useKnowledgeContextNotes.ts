import { inject, onScopeDispose, ref } from 'vue';
import type { KnowledgeContextSource } from '@memoflow/ai-contracts';
import type { ScanLocalVaultRes } from '@memoflow/repository-contracts';
import { unwrapOrThrowError } from '@memoflow/transport-contracts/result';
import { repositoryUiHost } from '../repository-ui-host';

export interface KnowledgeContextNote {
  id: string;
  title: string;
  path: string;
  updatedAt: number;
  source: KnowledgeContextSource;
}

/** Transient context candidates, distinct from durable Goal/Task document links. */
export function useKnowledgeContextNotes() {
  const service = repositoryUiHost.useStrictInject(
    repositoryUiHost.REPOSITORY_SERVICE_KEY,
    'RepositoryService',
  );
  const desktop = inject(repositoryUiHost.DESKTOP_BRIDGE_KEY, undefined);
  const notes = ref<KnowledgeContextNote[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: AbortController | undefined;
  let localCatalog: Promise<ScanLocalVaultRes> | undefined;

  async function identify(note: Omit<KnowledgeContextNote, 'id'>): Promise<KnowledgeContextNote> {
    const bytes = new TextEncoder().encode(`${note.source.bindingId}\n${note.path}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const id = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    return { ...note, id };
  }
  async function load(query: string, epoch: number) {
    try {
      let candidates: Array<Omit<KnowledgeContextNote, 'id'>>;
      if (desktop) {
        localCatalog ??= service.scanLocalVault().then(unwrapOrThrowError);
        const catalog = await localCatalog;
        const needle = query.normalize('NFKC').toLocaleLowerCase();
        candidates = catalog.notes
          .filter(
            (note) =>
              !needle ||
              [note.title, note.relativePath, ...note.aliases].some((value) =>
                value.normalize('NFKC').toLocaleLowerCase().includes(needle),
              ),
          )
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 12)
          .map((note) => ({
            title: note.title,
            path: note.relativePath,
            updatedAt: note.updatedAt,
            source: {
              kind: 'local_vault',
              bindingId: catalog.binding.id,
              relativePath: note.relativePath,
              contentHash: note.contentHash,
            },
          }));
      } else {
        abort = new AbortController();
        const result = await service.listKnowledgeNoteProjections(
          { ...(query ? { query } : { sort: 'recent' as const }), limit: 12 },
          { signal: abort.signal },
        );
        const data = unwrapOrThrowError(result);
        candidates = data.notes.map((note) => ({
          title: note.title,
          path: note.relativePath,
          updatedAt: note.updatedAt,
          source: {
            kind: 'github_projection',
            bindingId: note.connectionId,
            relativePath: note.relativePath,
            contentHash: note.contentHash,
          },
        }));
      }
      const identified = await Promise.all(candidates.map(identify));
      if (epoch === generation) notes.value = identified;
    } catch (failure) {
      if (epoch !== generation) return;
      notes.value = [];
      localCatalog = undefined;
      error.value = repositoryUiHost.translateResultError(failure, (key) => key, {
        fallbackKey: 'common.operationFailed',
      });
    } finally {
      if (epoch === generation) isLoading.value = false;
    }
  }
  function search(query: string | null) {
    const epoch = ++generation;
    clearTimeout(timer);
    abort?.abort();
    notes.value = [];
    error.value = null;
    isLoading.value = query !== null;
    if (query === null) {
      localCatalog = undefined;
      return;
    }
    timer = setTimeout(() => {
      void load(query.trim().slice(0, 200), epoch);
    }, 180);
  }
  function cancel() {
    search(null);
  }
  onScopeDispose(cancel);
  return { notes, isLoading, error, search, cancel };
}
