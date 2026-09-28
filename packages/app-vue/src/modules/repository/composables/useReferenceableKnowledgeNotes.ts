/**
 * Durable knowledge-document candidates for Goal/Task/AI reference surfaces.
 *
 * Web performs stable-identity filtering + ordering on the server before
 * pagination. Desktop derives the same shape from the bound local Vault.
 * Consumers never paginate arbitrary notes and then filter for memoflow_id.
 */
import { inject, ref } from 'vue';
import { unwrapOrThrowError } from '@memoflow/contracts/result';
import { DESKTOP_BRIDGE_KEY, REPOSITORY_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import {
  getGlobalResultErrorT,
  translateResultError,
} from '../../../shared/utils/translate-result-error';

export type ReferenceableKnowledgeNote = {
  documentId: string;
  knowledgeSpaceId: string;
  title: string;
  path: string;
  updatedAt: number;
};

export interface ReferenceableKnowledgeNoteQuery {
  query?: string;
  limit?: number;
}

export function useReferenceableKnowledgeNotes() {
  const service = useStrictInject(REPOSITORY_SERVICE_KEY, 'RepositoryService');
  const desktopBridge = inject(DESKTOP_BRIDGE_KEY, undefined);
  const t = getGlobalResultErrorT();

  const notes = ref<ReferenceableKnowledgeNote[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  let activeAbortController: AbortController | null = null;
  let loadGeneration = 0;

  async function load(options: ReferenceableKnowledgeNoteQuery = {}): Promise<void> {
    const generation = ++loadGeneration;
    activeAbortController?.abort();
    activeAbortController = desktopBridge ? null : new AbortController();
    isLoading.value = true;
    error.value = null;
    const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
    const query = options.query?.trim() || undefined;

    try {
      const loaded = desktopBridge
        ? await loadLocalVaultNotes(query, limit)
        : await loadProjectionNotes(query, limit, activeAbortController?.signal);
      if (generation !== loadGeneration) return;
      notes.value = loaded;
    } catch (loadError) {
      if (generation !== loadGeneration || isAbortError(loadError)) return;
      notes.value = [];
      error.value = translateResultError(loadError, t, {
        scope: 'repository',
        fallbackKey: 'common.operationFailed',
      });
    } finally {
      if (generation === loadGeneration) isLoading.value = false;
    }
  }

  async function loadProjectionNotes(
    query: string | undefined,
    limit: number,
    signal?: AbortSignal,
  ): Promise<ReferenceableKnowledgeNote[]> {
    const result = await service.listReferenceableKnowledgeDocuments(
      {
        ...(query ? { query } : {}),
        limit,
      },
      signal ? { signal } : undefined,
    );
    if (!result.ok) throw unwrapOrThrowError(result);

    return result.data.documents.map((document) => ({
      documentId: document.documentId,
      knowledgeSpaceId: document.knowledgeSpaceId,
      title: document.title,
      path: document.relativePath,
      updatedAt: Number(document.updatedAt),
    }));
  }

  async function loadLocalVaultNotes(
    query: string | undefined,
    limit: number,
  ): Promise<ReferenceableKnowledgeNote[]> {
    if (typeof service.scanLocalVault !== 'function') return [];
    const result = await service.scanLocalVault();
    if (!result.ok) throw unwrapOrThrowError(result);

    const needle = query?.toLocaleLowerCase();
    return result.data.notes
      .filter(
        (note): note is typeof note & { knowledgeDocumentId: string } =>
          typeof note.knowledgeDocumentId === 'string' && note.knowledgeDocumentId.length > 0,
      )
      .filter((note) => {
        if (!needle) return true;
        return (
          note.title.toLocaleLowerCase().includes(needle) ||
          note.relativePath.toLocaleLowerCase().includes(needle)
        );
      })
      .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt))
      .slice(0, limit)
      .map((note) => ({
        documentId: note.knowledgeDocumentId,
        knowledgeSpaceId: String(result.data.binding.knowledgeSpaceId),
        title: note.title,
        path: note.relativePath,
        updatedAt: Number(note.updatedAt),
      }));
  }

  function isAbortError(value: unknown): boolean {
    return value instanceof DOMException && value.name === 'AbortError';
  }

  function cancel(): void {
    loadGeneration += 1;
    activeAbortController?.abort();
    activeAbortController = null;
    isLoading.value = false;
  }

  return {
    notes,
    isLoading,
    error,
    load,
    cancel,
  };
}
