/**
 * Recent knowledge notes for shell/AI surfaces.
 *
 * Uses GitHub note projections on Web and the local Vault scan on Desktop.
 * Does not call legacy database Repository/Resource CRUD endpoints.
 */
import { inject, ref } from 'vue';
import { unwrapOrThrowError } from '@memoflow/contracts/result';
import {
  EMAIL_VERIFICATION_MESSAGE_KEY,
  isEmailVerificationRequiredError,
} from '@memoflow/http-client';
import { useI18n } from 'vue-i18n';
import { repositoryUiHost } from '../repository-ui-host';
import { useStrictInject } from '../utils/useStrictInject';

function safeT(): (key: string, params?: Record<string, unknown>) => string {
  try {
    return useI18n().t;
  } catch {
    return (key: string) => key;
  }
}

export type RecentKnowledgeNote = {
  id: string;
  title: string;
  path: string;
  /** Stable owner id used by AI context hydration; null until the note is registered. */
  knowledgeDocumentId: string | null;
  updatedAt: number;
  source: 'projection' | 'local-vault';
};

type RecentKnowledgeSnapshot = {
  notes: RecentKnowledgeNote[];
  error: string | null;
  errorMessageKey: string | null;
  emailVerificationRequired: boolean;
};

export function useRecentKnowledgeNotes() {
  const service = useStrictInject(repositoryUiHost.REPOSITORY_SERVICE_KEY, 'RepositoryService');
  const desktopBridge = inject(repositoryUiHost.DESKTOP_BRIDGE_KEY, undefined);
  const runtime =
    (repositoryUiHost.SERVER_STATE_RUNTIME_KEY
      ? inject(repositoryUiHost.SERVER_STATE_RUNTIME_KEY, null)
      : null) ?? repositoryUiHost.useServerStateRuntime();
  const resolveIdentityScope =
    (repositoryUiHost.SERVER_STATE_IDENTITY_SCOPE_KEY
      ? inject(repositoryUiHost.SERVER_STATE_IDENTITY_SCOPE_KEY, null)
      : null) ?? repositoryUiHost.useServerStateIdentityScope();
  const t = safeT();

  const notes = ref<RecentKnowledgeNote[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  /** i18n message key when the session needs email verification (UI degrade). */
  const errorMessageKey = ref<string | null>(null);
  const emailVerificationRequired = ref(false);

  function applySnapshot(snapshot: RecentKnowledgeSnapshot): void {
    notes.value = snapshot.notes;
    error.value = snapshot.error;
    errorMessageKey.value = snapshot.errorMessageKey;
    emailVerificationRequired.value = snapshot.emailVerificationRequired;
  }

  async function read(limit: number, force: boolean): Promise<void> {
    const source = desktopBridge ? 'local-vault' : 'projection';
    const queryKey = repositoryUiHost.recentKnowledgeQueryKeys.recent(
      resolveIdentityScope(),
      source,
      limit,
    );
    const cachedSnapshot = (runtime.queryClient as any).getQueryData(queryKey) as
      | RecentKnowledgeSnapshot
      | undefined;
    if (cachedSnapshot) applySnapshot(cachedSnapshot);
    isLoading.value = cachedSnapshot === undefined;
    if (!cachedSnapshot) {
      error.value = null;
      errorMessageKey.value = null;
      emailVerificationRequired.value = false;
    }

    try {
      const snapshot = await (runtime.queryClient as any).fetchQuery({
        queryKey,
        staleTime: force ? 0 : repositoryUiHost.RECENT_KNOWLEDGE_STALE_TIME_MS,
        queryFn: async () => {
          error.value = null;
          errorMessageKey.value = null;
          emailVerificationRequired.value = false;
          const nextNotes = desktopBridge
            ? await loadLocalVaultNotes(limit)
            : await loadProjectionNotes(limit);
          return {
            notes: nextNotes,
            error: error.value,
            errorMessageKey: errorMessageKey.value,
            emailVerificationRequired: emailVerificationRequired.value,
          };
        },
      });
      applySnapshot(snapshot);
    } catch (loadError) {
      applySnapshot({
        notes: [],
        error: repositoryUiHost.translateResultError(loadError, t, {
          fallbackKey: 'common.operationFailed',
        }),
        errorMessageKey: null,
        emailVerificationRequired: false,
      });
    } finally {
      isLoading.value = false;
    }
  }

  /** Explicit refresh for pages/retry. */
  function load(limit = 20): Promise<void> {
    return read(limit, true);
  }

  /** Cache-aware read for shell/assistant lightweight projections. */
  function ensure(limit = 20): Promise<void> {
    return read(limit, false);
  }

  async function loadProjectionNotes(limit: number): Promise<RecentKnowledgeNote[]> {
    const result = await service.listKnowledgeNoteProjections({ limit, sort: 'recent' });
    if (!result.ok) {
      // Empty connection / unavailable projection is a normal empty state.
      if (
        result.error.code === 'SERVICE_UNAVAILABLE' ||
        result.error.code === 'NOT_FOUND' ||
        result.error.code === 'UNAUTHORIZED'
      ) {
        return [];
      }
      if (isEmailVerificationRequiredError(result.error)) {
        emailVerificationRequired.value = true;
        const ctx = result.error.context as { messageKey?: string } | undefined;
        errorMessageKey.value = ctx?.messageKey ?? EMAIL_VERIFICATION_MESSAGE_KEY;
        error.value = repositoryUiHost.translateResultError(result.error, t, {
          fallbackKey: 'common.operationFailed',
        });
        return [];
      }
      throw unwrapOrThrowError(result);
    }

    return [...result.data.notes]
      .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt))
      .slice(0, limit)
      .map((note) => ({
        id: note.id,
        title: note.title,
        path: note.relativePath,
        knowledgeDocumentId: note.knowledgeDocumentId,
        updatedAt: Number(note.updatedAt),
        source: 'projection' as const,
      }));
  }

  async function loadLocalVaultNotes(limit: number): Promise<RecentKnowledgeNote[]> {
    if (typeof service.scanLocalVault !== 'function') {
      return [];
    }
    const result = await service.scanLocalVault();
    if (!result.ok) {
      if (
        result.error.code === 'SERVICE_UNAVAILABLE' ||
        result.error.code === 'NOT_FOUND' ||
        result.error.code === 'UNAUTHORIZED'
      ) {
        return [];
      }
      throw unwrapOrThrowError(result);
    }

    return [...result.data.notes]
      .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt))
      .slice(0, limit)
      .map((note) => ({
        id: note.relativePath,
        title: note.title,
        path: note.relativePath,
        knowledgeDocumentId: note.knowledgeDocumentId,
        updatedAt: Number(note.updatedAt),
        source: 'local-vault' as const,
      }));
  }

  return {
    notes,
    isLoading,
    error,
    errorMessageKey,
    emailVerificationRequired,
    load,
    ensure,
  };
}
