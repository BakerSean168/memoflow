<script setup lang="ts">
/**
 * KnowledgeWriteRequestLedger — Git commit + projection 双状态账本（W6 P1-1）
 *
 * 展示 service listKnowledgeWriteRequests 返回的写入请求：每行同时显示
 * commit 状态（status/commitSha）与 projection 状态（projectionStatus/
 * projectionAttempts/错误），并对 projection Pending/Failed 的行提供重放。
 * 刷新与重放都重新向服务端读取账本，保证 UI 与服务端 ledger 一致。
 */
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, AlertDescription, AlertTitle, Badge, Button } from '@memoflow/ui-vue-shadcn';
import { AlertCircle, Loader2, RefreshCw, RotateCcw } from '@lucide/vue';
import type { KnowledgeWriteRequestClientDTO } from '@memoflow/contracts/repository';
import { useKnowledgeWriteRequestLedger } from '../composables/useKnowledgeWriteRequestLedger';

const { t } = useI18n();

const props = defineProps<{
  connectionId?: string;
}>();

const { writeRequests, isLoading, replayingId, error, load, replay } =
  useKnowledgeWriteRequestLedger();

const replayMessage = ref<string | null>(null);

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : '';
}

function commitBadgeVariant(
  status: KnowledgeWriteRequestClientDTO['status'],
): 'secondary' | 'outline' | 'destructive' {
  if (status === 'Committed') return 'secondary';
  if (status === 'Failed') return 'destructive';
  return 'outline';
}

function projectionBadgeVariant(
  status: KnowledgeWriteRequestClientDTO['projectionStatus'],
): 'secondary' | 'outline' | 'destructive' {
  if (status === 'Succeeded') return 'secondary';
  if (status === 'Failed') return 'destructive';
  return 'outline';
}

function canReplay(row: KnowledgeWriteRequestClientDTO): boolean {
  return row.status === 'Committed' && row.projectionStatus !== 'Succeeded';
}

async function refresh(): Promise<void> {
  replayMessage.value = null;
  await load(props.connectionId ? { connectionId: props.connectionId, limit: 50 } : { limit: 50 });
}

async function handleReplay(row: KnowledgeWriteRequestClientDTO): Promise<void> {
  replayMessage.value = null;
  const result = await replay(row.id);
  if (result.ok && result.response) {
    // Re-read the ledger so the UI reflects the server state after the replay.
    await refresh();
    replayMessage.value = t('repository.writeRequestLedger.replayed', {
      status: result.response.status,
    });
    return;
  }
  // On failure the replay error stays visible as an actionable message.
}

onMounted(() => {
  void refresh();
});

watch(
  () => props.connectionId,
  () => {
    void refresh();
  },
);

defineExpose({ refresh });
</script>

<template>
  <div class="space-y-3" data-testid="knowledge-write-request-ledger">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h3 class="flex items-center gap-2 text-sm font-semibold">
          <RotateCcw class="h-4 w-4" />
          {{ t('repository.writeRequestLedger.title') }}
        </h3>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ t('repository.writeRequestLedger.description') }}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('repository.writeRequestLedger.refresh')"
        :disabled="isLoading"
        data-testid="ledger-refresh-button"
        @click="refresh"
      >
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isLoading }" />
      </Button>
    </div>

    <Alert v-if="error" variant="destructive" data-testid="ledger-error">
      <AlertCircle class="h-4 w-4" />
      <AlertTitle>{{ t('repository.writeRequestLedger.errorTitle') }}</AlertTitle>
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <p
      v-if="replayMessage"
      class="text-xs text-muted-foreground"
      data-testid="ledger-replay-message"
    >
      {{ replayMessage }}
    </p>

    <div
      v-if="isLoading && writeRequests.length === 0"
      class="flex items-center gap-2 py-4 text-sm text-muted-foreground"
    >
      <Loader2 class="h-4 w-4 animate-spin" />
      {{ t('common.loading') }}
    </div>

    <p
      v-else-if="writeRequests.length === 0"
      class="py-4 text-sm text-muted-foreground"
      data-testid="ledger-empty"
    >
      {{ t('repository.writeRequestLedger.empty') }}
    </p>

    <div v-else class="divide-y rounded-md border">
      <div
        v-for="row in writeRequests"
        :key="row.id"
        class="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
        :data-testid="`ledger-row-${row.id}`"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium" :title="row.relativePath">
            {{ row.relativePath }}
          </p>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <Badge :variant="commitBadgeVariant(row.status)" data-testid="ledger-commit-status">
              {{ t('repository.writeRequestLedger.commitStatus', { status: row.status }) }}
            </Badge>
            <span v-if="row.commitSha" class="text-xs text-muted-foreground">
              {{ t('repository.writeRequestLedger.commitSha', { sha: shortSha(row.commitSha) }) }}
            </span>
            <Badge
              :variant="projectionBadgeVariant(row.projectionStatus)"
              data-testid="ledger-projection-status"
            >
              {{
                t('repository.writeRequestLedger.projectionStatus', {
                  status: row.projectionStatus,
                })
              }}
            </Badge>
            <span class="text-xs text-muted-foreground">
              {{
                t('repository.writeRequestLedger.projectionAttempts', {
                  count: row.projectionAttempts,
                })
              }}
            </span>
          </div>
          <p
            v-if="row.projectionStatus === 'Failed' && row.projectionErrorMessage"
            class="mt-1 text-xs text-destructive"
            data-testid="ledger-projection-error"
          >
            {{ row.projectionErrorCode }}: {{ row.projectionErrorMessage }}
          </p>
        </div>
        <Button
          v-if="canReplay(row)"
          variant="outline"
          size="sm"
          :disabled="replayingId === row.id"
          data-testid="ledger-replay-button"
          @click="handleReplay(row)"
        >
          <RotateCcw class="mr-2 h-4 w-4" :class="{ 'animate-spin': replayingId === row.id }" />
          {{
            replayingId === row.id
              ? t('repository.writeRequestLedger.replaying')
              : t('repository.writeRequestLedger.replay')
          }}
        </Button>
      </div>
    </div>
  </div>
</template>
