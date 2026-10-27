/**
 * Knowledge write-request ledger (W6 P1-1 UI closure).
 *
 * Consumes listKnowledgeWriteRequests + replayKnowledgeWriteRequestProjection
 * so the Knowledge settings page can show the commit and projection statuses of
 * every write request and replay Pending/Failed projections. The transport is
 * the injected RepositoryService (HTTP on Web, IPC → cloud HTTP on Desktop).
 */
import { ref } from 'vue';
import type {
  KnowledgeWriteRequestClientDTO,
  KnowledgeWriteRequestReplayResponse,
  ListKnowledgeWriteRequestsReq,
} from '@memoflow/repository-contracts';
import { useI18n } from 'vue-i18n';
import { repositoryUiHost } from '../repository-ui-host';

function safeT(): (key: string, params?: Record<string, unknown>) => string {
  try {
    return useI18n().t;
  } catch {
    return (key: string) => key;
  }
}

export interface LedgerReplayResult {
  ok: boolean;
  code?: string;
  message?: string;
  response?: KnowledgeWriteRequestReplayResponse;
}

export function useKnowledgeWriteRequestLedger() {
  const service = repositoryUiHost.useStrictInject(
    repositoryUiHost.REPOSITORY_SERVICE_KEY,
    'RepositoryService',
  );
  const t = safeT();

  const writeRequests = ref<KnowledgeWriteRequestClientDTO[]>([]);
  const isLoading = ref(false);
  const replayingId = ref<string | null>(null);
  const error = ref<string | null>(null);
  const lastReplay = ref<{ writeRequestId: string; status: string } | null>(null);

  async function load(request: ListKnowledgeWriteRequestsReq = { limit: 50 }): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const result = await service.listKnowledgeWriteRequests(request);
      if (!result.ok) {
        // No connection / unavailable projection is a normal empty state.
        writeRequests.value = [];
        if (
          result.error.code !== 'SERVICE_UNAVAILABLE' &&
          result.error.code !== 'UNAUTHORIZED' &&
          result.error.code !== 'NOT_FOUND'
        ) {
          error.value = repositoryUiHost.translateResultError(result.error, t, {
            scope: 'repository',
            fallbackKey: 'common.operationFailed',
          });
        }
        return;
      }
      writeRequests.value = result.data.writeRequests;
    } finally {
      isLoading.value = false;
    }
  }

  async function replay(writeRequestId: string): Promise<LedgerReplayResult> {
    replayingId.value = writeRequestId;
    error.value = null;
    try {
      const result = await service.replayKnowledgeWriteRequestProjection(writeRequestId);
      if (!result.ok) {
        const message = repositoryUiHost.translateResultError(result.error, t, {
          scope: 'repository',
          fallbackKey: 'common.operationFailed',
        });
        error.value = message;
        return { ok: false, code: result.error.code, message };
      }
      lastReplay.value = { writeRequestId, status: result.data.status };
      return { ok: true, response: result.data };
    } finally {
      replayingId.value = null;
    }
  }

  return {
    writeRequests,
    isLoading,
    replayingId,
    error,
    lastReplay,
    load,
    replay,
  };
}
