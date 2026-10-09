import {
  computed,
  onActivated,
  onDeactivated,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import type {
  LocalVaultBindingSnapshotDTO,
  LocalVaultNoteDTO,
  LocalVaultNoteSummaryDTO,
  SearchLocalVaultRes,
} from '@memoflow/contracts/repository';
import { unwrapOrThrowError, type Result } from '@memoflow/contracts/result';
import { REPOSITORY_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import {
  getGlobalResultErrorT,
  translateResultError,
} from '../../../shared/utils/translate-result-error';
// Residual 999: sole errorMessage (local dual retired).
import { errorMessage } from '@memoflow/utils/shared';

// Residual 999: errorMessage elevated to @memoflow/utils/shared.

export function useLocalVault() {
  const service = useStrictInject(REPOSITORY_SERVICE_KEY, 'RepositoryService');
  const t = getGlobalResultErrorT();
  const bindingSnapshot = ref<LocalVaultBindingSnapshotDTO | null>(null);
  const binding = computed(() => bindingSnapshot.value?.binding ?? null);
  const health = computed(() => bindingSnapshot.value?.health ?? null);
  const notes = shallowRef<LocalVaultNoteSummaryDTO[]>([]);
  const activeNote = shallowRef<LocalVaultNoteDTO | null>(null);
  const searchQuery = ref('');
  const searchResults = shallowRef<SearchLocalVaultRes['results']>([]);
  const searchActive = ref(false);
  const pending = ref(0);
  const loading = computed(() => pending.value > 0);
  const error = ref<string | null>(null);
  let generation = 0;
  let noteRevision = 0;
  let scanRevision = 0;
  let searchRevision = 0;
  let searching = false;
  let disposed = false;
  let inactive = false;
  let openingNote: { scope: number; path: string } | null = null;

  function cancelSearch(): void {
    searchRevision++;
    if (searching) {
      searching = false;
      // An empty query cancels the previous request on this renderer's IPC lane.
      void service.searchLocalVault({ query: '' }).catch(() => undefined);
    }
  }

  function invalidateScope(): void {
    generation++;
    openingNote = null;
    pending.value = 0;
    cancelSearch();
  }

  const isBound = computed(() => health.value?.state === 'Available');
  const displayedNotes = computed(() =>
    searchActive.value ? searchResults.value.map((result) => result.note) : notes.value,
  );

  async function unwrap<T>(operation: Promise<Result<T>>): Promise<T> {
    const result = await operation;
    return unwrapOrThrowError(result);
  }

  async function run<T>(
    operation: () => Promise<T>,
    isCurrent: () => boolean = () => true,
  ): Promise<T | null> {
    const scope = generation;
    pending.value++;
    error.value = null;
    try {
      return await operation();
    } catch (cause) {
      if (disposed || scope !== generation || !isCurrent()) return null;
      // Residual 999 keep-boundary: sole errorMessage helper stays on this
      // file's dev-diagnostic surface (dual-registry.surface.spec.ts), while the
      // user-facing error is translated.
      console.warn('[useLocalVault] operation failed', errorMessage(cause));
      error.value = translateResultError(cause, t, {
        scope: 'repository',
        fallbackKey: 'common.operationFailed',
      });
      return null;
    } finally {
      if (scope === generation) pending.value--;
    }
  }

  async function loadBinding(): Promise<void> {
    invalidateScope();
    notes.value = [];
    activeNote.value = null;
    clearSearch();
    const scope = generation;
    const loaded = await run(() => unwrap(service.getLocalVaultBinding()));
    if (disposed || scope !== generation) return;
    bindingSnapshot.value = loaded;
    notes.value = [];
    activeNote.value = null;
    clearSearch();
    if (loaded?.health.state === 'Available') await scan();
  }

  async function refreshBinding(): Promise<void> {
    const scope = generation;
    const loaded = await run(() => unwrap(service.getLocalVaultBinding()));
    if (disposed || inactive || scope !== generation) return;
    if (
      loaded?.binding.id !== bindingSnapshot.value?.binding.id ||
      loaded?.health.state !== 'Available'
    ) {
      invalidateScope();
      notes.value = [];
      activeNote.value = null;
      clearSearch();
    }
    bindingSnapshot.value = loaded;
    if (loaded?.health.state !== 'Available') return;
    const refreshedScope = generation;
    await scan();
    if (!inactive && !disposed && refreshedScope === generation && searchQuery.value.trim())
      await search();
  }

  async function selectVault(): Promise<void> {
    invalidateScope();
    const scope = generation;
    const selected = await run(() =>
      unwrap(
        service.selectLocalVault({
          suggestedPath: binding.value?.rootPath,
        }),
      ),
    );
    if (!selected || disposed || scope !== generation) return;
    bindingSnapshot.value = selected;
    activeNote.value = null;
    notes.value = [];
    clearSearch();
    await scan();
  }

  async function detachVault(): Promise<void> {
    invalidateScope();
    const scope = generation;
    const detached = await run(() => unwrap(service.detachLocalVault()));
    if (detached !== null && !disposed && scope === generation) {
      bindingSnapshot.value = null;
      notes.value = [];
      activeNote.value = null;
      clearSearch();
    }
  }

  async function scan(): Promise<void> {
    const scope = generation;
    const revision = ++scanRevision;
    const current = () => !disposed && scope === generation && revision === scanRevision;
    await run(async () => {
      const scanned = await unwrap(service.scanLocalVault());
      if (!current()) return;
      if (bindingSnapshot.value?.binding.id !== scanned.binding.id) {
        invalidateScope();
        activeNote.value = null;
        clearSearch();
      }
      bindingSnapshot.value = { binding: scanned.binding, health: scanned.health };
      notes.value = scanned.notes;
      if (activeNote.value) {
        const stillExists = scanned.notes.some(
          (note) => note.relativePath === activeNote.value?.relativePath,
        );
        if (!stillExists) activeNote.value = null;
      }
    }, current);
  }

  async function openNote(note: LocalVaultNoteSummaryDTO): Promise<void> {
    const scope = generation;
    if (openingNote?.scope === scope && openingNote.path === note.relativePath) return;
    const opening = { scope, path: note.relativePath };
    openingNote = opening;
    const revision = ++noteRevision;
    const current = () => !disposed && scope === generation && revision === noteRevision;
    await run(async () => {
      const loaded = await unwrap(
        service.readLocalVaultNote({
          relativePath: note.relativePath,
        }),
      );
      if (current()) activeNote.value = loaded;
    }, current);
    if (openingNote === opening) openingNote = null;
  }

  async function search(): Promise<void> {
    const query = searchQuery.value.trim();
    if (!query) {
      clearSearch();
      return;
    }
    if (searching) return;
    const scope = generation;
    const revision = ++searchRevision;
    const current = () => !disposed && scope === generation && revision === searchRevision;
    searching = true;
    const searched = await run(
      () => unwrap(service.searchLocalVault({ query, limit: 100 })),
      current,
    );
    if (!current()) return;
    searching = false;
    if (!searched) return;
    searchResults.value = searched.results;
    searchActive.value = true;
  }

  function clearSearch(): void {
    cancelSearch();
    searchQuery.value = '';
    searchResults.value = [];
    searchActive.value = false;
  }

  watch(
    searchQuery,
    () => {
      cancelSearch();
      searchResults.value = [];
      searchActive.value = false;
    },
    { flush: 'sync' },
  );

  async function openInObsidian(relativePath?: string): Promise<void> {
    await run(() =>
      unwrap(
        service.openLocalVaultInObsidian({
          ...(relativePath ? { relativePath } : {}),
        }),
      ),
    );
  }

  async function openWikiLink(title: string): Promise<void> {
    const normalized = title.trim().toLocaleLowerCase();
    const target = notes.value.find((note) => {
      const segments = note.relativePath.replace(/\.md$/i, '').split('/');
      const stem = segments[segments.length - 1]?.toLocaleLowerCase();
      return note.title.toLocaleLowerCase() === normalized || stem === normalized;
    });
    if (target) await openNote(target);
  }

  onMounted(() => {
    void loadBinding();
  });
  onDeactivated(() => {
    inactive = true;
    invalidateScope();
  });
  onActivated(() => {
    if (inactive) {
      inactive = false;
      void refreshBinding();
    }
  });
  onBeforeUnmount(() => {
    disposed = true;
    invalidateScope();
  });

  return {
    binding,
    health,
    notes,
    activeNote,
    searchQuery,
    searchResults,
    searchActive,
    loading,
    error,
    isBound,
    displayedNotes,
    loadBinding,
    selectVault,
    detachVault,
    scan,
    openNote,
    search,
    clearSearch,
    openInObsidian,
    openWikiLink,
  };
}
