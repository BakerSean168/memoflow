<template>
  <main class="h-full overflow-auto bg-background" data-testid="local-vault-workspace">
    <div class="mx-auto w-full max-w-3xl space-y-8 px-5 py-7 sm:px-8 sm:py-10">
      <header class="space-y-2">
        <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {{ t('repository.hub.desktopLabel') }}
        </p>
        <h1 class="text-xl font-semibold tracking-tight">{{ t('repository.hub.title') }}</h1>
        <p class="max-w-xl text-sm leading-6 text-muted-foreground">
          {{ t('repository.hub.desktopDescription') }}
        </p>
      </header>
      <section class="rounded-xl border border-border/70 p-5" aria-labelledby="local-source-title">
        <div class="flex items-center justify-between gap-3">
          <h2 id="local-source-title" class="flex items-center gap-2 text-sm font-medium">
            <FolderOpen class="h-4 w-4" />{{ t('repository.hub.localSource') }}
          </h2>
          <span
            v-if="snapshot"
            class="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
            >{{ t(available ? 'repository.hub.connected' : 'repository.hub.needsAttention') }}</span
          >
        </div>
        <p v-if="!loaded" class="mt-5 text-sm text-muted-foreground" role="status">
          {{ t('common.loading') }}
        </p>
        <div v-else-if="!snapshot" class="mt-5 space-y-4" data-testid="local-vault-empty">
          <p class="text-sm leading-6 text-muted-foreground">
            {{ t('repository.hub.localEmpty') }}
          </p>
          <Button :disabled="busy" data-testid="local-vault-select" @click="select"
            ><FolderOpen class="mr-2 h-4 w-4" />{{
              t('repository.localVault.selectAction')
            }}</Button
          >
        </div>
        <div v-else class="mt-5 space-y-4">
          <div class="space-y-1">
            <p class="text-base font-medium">{{ snapshot.binding.displayName }}</p>
            <p class="break-all text-xs leading-5 text-muted-foreground">
              {{ snapshot.binding.rootPath }}
            </p>
          </div>
          <p
            v-if="!available"
            class="text-sm leading-6 text-amber-700 dark:text-amber-400"
            role="status"
          >
            {{ t('repository.hub.localUnavailable') }}
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <Button
              :disabled="busy || !available"
              data-testid="local-vault-open-obsidian"
              @click="openObsidian()"
              ><ExternalLink class="mr-2 h-4 w-4" />{{ t('repository.hub.openObsidian') }}</Button
            >
            <Button
              variant="ghost"
              size="icon"
              :disabled="busy"
              :aria-label="t('repository.localVault.changeVault')"
              :title="t('repository.localVault.changeVault')"
              @click="select"
              ><FolderOpen class="h-4 w-4"
            /></Button>
            <Button
              variant="ghost"
              size="icon"
              :disabled="busy"
              :aria-label="t('repository.hub.refresh')"
              :title="t('repository.hub.refresh')"
              @click="reload"
              ><RefreshCw class="h-4 w-4" :class="{ 'animate-spin': busy }"
            /></Button>
            <Button
              variant="ghost"
              size="icon"
              :disabled="busy"
              data-testid="local-vault-detach"
              :aria-label="t('repository.localVault.detach')"
              :title="t('repository.localVault.detach')"
              @click="detach"
              ><Unplug class="h-4 w-4"
            /></Button>
          </div>
        </div>
        <p v-if="error" class="mt-4 text-sm text-destructive" role="alert">{{ error }}</p>
      </section>
      <section class="space-y-3 px-1">
        <h2 class="flex items-center gap-2 text-sm font-medium">
          <AtSign class="h-4 w-4" />{{ t('repository.hub.contextTitle') }}
        </h2>
        <p class="text-sm leading-6 text-muted-foreground">
          {{ t('repository.hub.contextDescription') }}
        </p>
        <p class="text-xs leading-5 text-muted-foreground">
          {{ t('repository.hub.desktopSyncHint') }}
        </p>
      </section>
      <section class="space-y-3 px-1" data-testid="local-vault-recent-writes">
        <h2 class="flex items-center gap-2 text-sm font-medium">
          <CheckCheck class="h-4 w-4" />{{ t('repository.hub.writesTitle') }}
        </h2>
        <p class="text-xs leading-5 text-muted-foreground">
          {{ t('repository.hub.writesDescription') }}
        </p>
        <p
          v-if="!receipts.length"
          class="rounded-lg bg-muted/40 p-4 text-sm leading-6 text-muted-foreground"
        >
          {{ t('repository.hub.writesEmpty') }}
        </p>
        <ul v-else class="divide-y divide-border/60">
          <li v-for="receipt in receipts" :key="receipt.documentId">
            <Button
              variant="ghost"
              class="flex h-auto w-full items-center gap-3 rounded-lg px-0 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :disabled="!available"
              @click="openObsidian(receipt.relativePath)"
            >
              <span class="min-w-0 flex-1"
                ><span class="block truncate text-sm font-medium">{{ receipt.title }}</span
                ><span class="block truncate text-xs text-muted-foreground">{{
                  receipt.relativePath
                }}</span></span
              >
              <time
                class="shrink-0 text-xs text-muted-foreground"
                :datetime="new Date(receipt.createdAt).toISOString()"
                >{{ formatDate(receipt.createdAt) }}</time
              ><ExternalLink class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </li>
        </ul>
      </section>
    </div>
    <KnowledgeCaptureReviewDialog
      :open="captureOpen"
      :source-options="sourceOptions"
      @update:open="captureOpenChange"
    />
  </main>
</template>
<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { AtSign, CheckCheck, ExternalLink, FolderOpen, RefreshCw, Unplug } from '@lucide/vue';
import { Button, useConfirm } from '@memoflow/ui-vue-shadcn';
import type {
  LocalVaultBindingSnapshotDTO,
  LocalVaultWriteReceipt,
} from '@memoflow/repository-contracts';
import { unwrapOrThrowError } from '@memoflow/transport-contracts/result';
import { repositoryUiHost } from '../repository-ui-host';
import KnowledgeCaptureReviewDialog from '../components/KnowledgeCaptureReviewDialog.vue';
import type { KnowledgeCaptureSourceOption } from '../composables/knowledgeCaptureNativeEditSession';
const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const service = repositoryUiHost.useStrictInject(
  repositoryUiHost.REPOSITORY_SERVICE_KEY,
  'RepositoryService',
);
const snapshot = ref<LocalVaultBindingSnapshotDTO | null>(null);
const receipts = ref<LocalVaultWriteReceipt[]>([]);
const loaded = ref(false);
const busy = ref(false);
const error = ref('');
const active = ref(true);
let epoch = 0;
let attemptedLink = '';
const available = computed(() => snapshot.value?.health.state === 'Available');
const captureOpen = computed(() => route.query.dialog === 'knowledge-capture');
const sourceOptions = computed<KnowledgeCaptureSourceOption[]>(() =>
  available.value && snapshot.value
    ? [
        {
          key: 'local_vault',
          label: snapshot.value.binding.displayName,
          source: { kind: 'local_vault' },
        },
      ]
    : [],
);
function formatDate(value: number) {
  return new Intl.DateTimeFormat(locale.value, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}
async function action(work: () => Promise<void>) {
  if (busy.value || !active.value) return;
  const actionEpoch = epoch;
  busy.value = true;
  error.value = '';
  try {
    await work();
  } catch (failure) {
    if (actionEpoch === epoch)
      error.value = repositoryUiHost.translateResultError(failure, t, {
        fallbackKey: 'common.operationFailed',
      });
  } finally {
    if (actionEpoch === epoch) {
      busy.value = false;
      loaded.value = true;
    }
  }
}
async function load() {
  const readEpoch = epoch;
  const result = await service.getLocalVaultBinding();
  if (!result.ok) throw unwrapOrThrowError(result);
  if (readEpoch !== epoch || !active.value) return;
  snapshot.value = result.data;
  receipts.value = [];
  if (available.value) {
    const writes = await service.listLocalVaultWrites();
    if (!writes.ok) throw unwrapOrThrowError(writes);
    if (readEpoch === epoch && active.value) receipts.value = writes.data;
  }
}
function reload() {
  attemptedLink = '';
  return action(load);
}
function select() {
  return action(async () => {
    const result = await service.selectLocalVault();
    if (!result.ok) throw unwrapOrThrowError(result);
    await load();
  });
}
async function detach() {
  if (
    !(await useConfirm({
      title: t('repository.localVault.detachTitle'),
      description: t('repository.localVault.detachDescription'),
      confirmText: t('repository.localVault.detach'),
      cancelText: t('common.cancel'),
    }))
  )
    return;
  await action(async () => {
    const result = await service.detachLocalVault();
    if (!result.ok) throw unwrapOrThrowError(result);
    await load();
  });
}
function openObsidian(relativePath?: string) {
  return action(async () => {
    const result = await service.openLocalVaultInObsidian(relativePath ? { relativePath } : {});
    if (!result.ok) throw unwrapOrThrowError(result);
  });
}
async function captureOpenChange(open: boolean) {
  if (open) return;
  const query = { ...route.query };
  delete query.dialog;
  await router.replace({ name: 'repository', query });
  await reload();
}
function currentLink() {
  return `${route.query.sourceBindingId ?? ''}:${route.query.notePath ?? ''}:${route.query.note ?? ''}`;
}
async function openLinkedNote() {
  if (!active.value || route.name !== 'repository' || !available.value || busy.value) return;
  const notePath = typeof route.query.notePath === 'string' ? route.query.notePath : null;
  const documentId = typeof route.query.note === 'string' ? route.query.note : null;
  if (!notePath && !documentId) return;
  const link = currentLink();
  if (attemptedLink === link) return;
  attemptedLink = link;
  const linkEpoch = epoch;
  await action(async () => {
    if (notePath && route.query.sourceBindingId !== snapshot.value?.binding.id)
      throw new Error(t('repository.hub.noteUnavailable'));
    let relativePath = notePath;
    if (!relativePath) {
      const result = await service.scanLocalVault();
      if (!result.ok) throw unwrapOrThrowError(result);
      relativePath =
        result.data.notes.find((note) => note.knowledgeDocumentId === documentId)?.relativePath ??
        null;
    }
    if (
      linkEpoch !== epoch ||
      !active.value ||
      route.name !== 'repository' ||
      link !== currentLink()
    )
      return;
    if (!relativePath) throw new Error(t('repository.hub.noteUnavailable'));
    const opened = await service.openLocalVaultInObsidian({ relativePath });
    if (!opened.ok) throw unwrapOrThrowError(opened);
    if (
      linkEpoch !== epoch ||
      !active.value ||
      route.name !== 'repository' ||
      link !== currentLink()
    )
      return;
    const query = { ...route.query };
    delete query.note;
    delete query.notePath;
    delete query.sourceBindingId;
    await router.replace({ name: 'repository', query });
  });
}
onMounted(async () => {
  await reload();
  await openLinkedNote();
});
watch(
  () => [route.query.note, route.query.notePath, route.query.sourceBindingId, busy.value],
  () => {
    void openLinkedNote();
  },
);
onActivated(() => {
  active.value = true;
  if (!busy.value) void reload().then(openLinkedNote);
});
function deactivate() {
  active.value = false;
  epoch += 1;
  busy.value = false;
  attemptedLink = '';
}
onDeactivated(deactivate);
onBeforeUnmount(deactivate);
</script>
