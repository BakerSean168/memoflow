<template>
  <main
    class="flex h-full min-h-0 flex-col bg-background text-foreground"
    data-testid="local-vault-workspace"
  >
    <ModuleHeader data-testid="knowledge-workspace-toolbar">
      <template #leading>
        <Popover v-model:open="vaultMenuOpen">
          <PopoverTrigger as-child>
            <Button
              variant="ghost"
              size="sm"
              class="min-w-0 max-w-48 shrink gap-1.5 px-2"
              data-testid="local-vault-menu"
              :disabled="busy"
              :title="snapshot?.binding.rootPath"
            >
              <FolderOpen class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="min-w-0 truncate">{{
                snapshot?.binding.displayName ?? t('repository.workspace.configure')
              }}</span>
              <ChevronDown class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <ProductPopoverSurface
            recipe="property"
            content-class="w-80 max-w-xs"
            data-testid="local-vault-menu-content"
          >
            <div v-if="snapshot" class="space-y-1 border-b border-border pb-3">
              <p class="text-sm font-medium">{{ snapshot.binding.displayName }}</p>
              <p class="break-all text-xs leading-5 text-muted-foreground">
                {{ snapshot.binding.rootPath }}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              class="w-full justify-start"
              :disabled="busy"
              data-testid="local-vault-select"
              @click="select"
            >
              <FolderOpen class="size-4" aria-hidden="true" />{{
                t(
                  snapshot
                    ? 'repository.localVault.changeVault'
                    : 'repository.localVault.selectAction',
                )
              }}
            </Button>
            <Button
              v-if="snapshot"
              variant="ghost"
              size="sm"
              class="w-full justify-start text-destructive"
              :disabled="busy"
              data-testid="local-vault-detach"
              @click="detach"
            >
              <Unplug class="size-4" aria-hidden="true" />{{ t('repository.localVault.detach') }}
            </Button>
          </ProductPopoverSurface>
        </Popover>
        <ProductSingleSelectFilter
          v-model="filter"
          :options="filters"
          :accessible-label="t('repository.workspace.filter')"
          :disabled="!available"
          test-id="knowledge-note-filter"
          trigger-class="max-w-32"
        />
      </template>
      <template #actions>
        <Button
          variant="ghost"
          size="icon"
          class="size-8"
          :disabled="busy"
          :aria-label="t('repository.hub.refresh')"
          :title="t('repository.hub.refresh')"
          data-testid="local-vault-refresh"
          @click="reload"
        >
          <RefreshCw class="size-4" :class="{ 'animate-spin': busy }" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-8 gap-1.5 px-2"
          :disabled="busy || !available"
          data-testid="local-vault-open-obsidian"
          :aria-label="t('repository.hub.openObsidian')"
          :title="t('repository.hub.openObsidian')"
          @click="openObsidian()"
        >
          <ExternalLink class="size-4" aria-hidden="true" /><span class="hidden sm:inline">{{
            t('repository.hub.openObsidian')
          }}</span>
        </Button>
      </template>
    </ModuleHeader>
    <section
      class="min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto px-3 py-4 sm:px-5"
      data-testid="knowledge-workspace-content"
      :aria-label="t('repository.hub.title')"
      :aria-busy="busy"
    >
      <p v-if="error" role="alert" class="mb-4 text-sm text-destructive">{{ error }}</p>
      <ProductSurfaceState
        v-if="!loaded"
        family="collection"
        kind="loading"
        :title="t('common.loading')"
      />
      <ProductSurfaceState
        v-else-if="!snapshot && !error"
        family="collection"
        kind="empty"
        :title="t('repository.workspace.unboundTitle')"
        :description="t('repository.workspace.unboundDescription')"
        test-id="local-vault-empty"
      >
        <template #icon><FolderOpen class="size-8 text-muted-foreground" /></template>
        <template #actions
          ><Button size="sm" data-testid="local-vault-configure" @click="select">{{
            t('repository.localVault.selectAction')
          }}</Button></template
        >
      </ProductSurfaceState>
      <ProductSurfaceState
        v-else-if="snapshot && !available"
        family="collection"
        kind="error"
        :title="t('repository.hub.needsAttention')"
        :description="t('repository.hub.localUnavailable')"
      />
      <template v-else-if="available">
        <div
          v-if="linkFailures.length"
          class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1"
          role="alert"
          data-testid="knowledge-links-error"
        >
          <p class="text-xs text-destructive">
            {{
              linksReadFailed
                ? t('repository.workspace.linksUnavailable')
                : t('repository.workspace.linksPartiallyUnavailable')
            }}
          </p>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs text-destructive"
            :disabled="busy || linkBusy"
            data-testid="knowledge-links-retry"
            @click="retryLinks"
            >{{ t('common.retry') }}</Button
          >
        </div>
        <p
          v-if="gitError || git?.state === 'unavailable'"
          role="status"
          class="mb-4 text-xs text-muted-foreground"
        >
          {{ t('repository.workspace.gitUnavailable') }}
        </p>
        <p
          v-else-if="git?.state === 'not-repository'"
          role="status"
          class="mb-4 text-xs text-muted-foreground"
        >
          {{ t('repository.workspace.notGit') }}
        </p>
        <ProductSurfaceState
          v-if="
            !visibleRows.length &&
            !error &&
            !linkFailures.length &&
            !gitError &&
            git?.state !== 'unavailable'
          "
          family="collection"
          kind="empty"
          :title="t('repository.workspace.emptyTitle')"
          :description="t('repository.workspace.emptyDescription')"
          test-id="knowledge-notes-empty"
        />
        <TransitionGroup
          v-else
          name="vault-note"
          tag="ul"
          class="space-y-2"
          data-testid="knowledge-note-list"
        >
          <li
            v-for="row in visibleRows"
            :key="row.relativePath"
            class="group flex items-start gap-3 rounded-lg border border-border/60 px-3 py-3 transition-colors hover:bg-muted/30 motion-reduce:transition-none"
            :data-note-path="row.relativePath"
          >
            <FileText class="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <h2
                  class="min-w-0 break-words text-sm font-medium"
                  :class="{
                    'text-muted-foreground line-through': row.change?.status === 'deleted',
                  }"
                >
                  {{ row.title }}
                </h2>
                <span
                  v-if="row.change"
                  class="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors motion-reduce:transition-none"
                  :class="tones[row.change.status]"
                  :data-change-status="row.change.status"
                >
                  <GitBranch class="size-3" aria-hidden="true" />{{
                    t(`repository.workspace.status.${row.change.status}`)
                  }}
                </span>
              </div>
              <p class="break-all text-xs leading-5 text-muted-foreground">
                {{ row.relativePath }}
              </p>
              <p v-if="row.change?.previousPath" class="break-all text-xs text-muted-foreground">
                {{ t('repository.workspace.renamedFrom', { path: row.change.previousPath }) }}
              </p>
              <div v-if="row.links.length" class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  v-for="link in row.links"
                  :key="`${link.subjectType}:${link.subjectId}`"
                  class="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
                  ><Link2 class="size-3 shrink-0" aria-hidden="true" />{{
                    t('repository.workspace.goalLink', { title: link.title })
                  }}</span
                >
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              class="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              :disabled="busy || row.change?.status === 'deleted'"
              :aria-label="t('repository.workspace.openNote', { title: row.title })"
              :title="
                t(
                  row.change?.status === 'deleted'
                    ? 'repository.workspace.deletedNote'
                    : 'repository.hub.openObsidian',
                )
              "
              data-testid="knowledge-note-open"
              @click="openObsidian(row.relativePath)"
              ><ExternalLink class="size-4" aria-hidden="true"
            /></Button>
          </li>
        </TransitionGroup>
      </template>
    </section>
  </main>
</template>
<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  ChevronDown,
  ExternalLink,
  FileText,
  FolderOpen,
  GitBranch,
  Link2,
  RefreshCw,
  Unplug,
} from '@lucide/vue';
import { Button, Popover, PopoverTrigger, useConfirm } from '@memoflow/ui-vue-shadcn';
import type {
  LocalVaultBindingSnapshotDTO,
  LocalVaultGitChanges,
  LocalVaultNoteSummaryDTO,
} from '@memoflow/repository-contracts';
import type { KnowledgeDocumentRef } from '@memoflow/repository-contracts';
import { unwrapOrThrowError } from '@memoflow/transport-contracts/result';
import { buildVaultWorkspaceRows } from '../utils/local-vault-workspace';
import type { KnowledgeBusinessLink, KnowledgeLinkFailure } from '../repository-ui-host';
import { repositoryUiHost } from '../repository-ui-host';
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const service = repositoryUiHost.useStrictInject(
  repositoryUiHost.REPOSITORY_SERVICE_KEY,
  'RepositoryService',
);
const snapshot = ref<LocalVaultBindingSnapshotDTO | null>(null);
const notes = ref<LocalVaultNoteSummaryDTO[]>([]);
const git = ref<LocalVaultGitChanges | null>(null);
const links = ref<KnowledgeBusinessLink[]>([]);
const gitError = ref(false);
const linkFailures = ref<KnowledgeLinkFailure[]>([]);
const filter = ref('all');
const vaultMenuOpen = ref(false);
const { ModuleHeader, ProductSingleSelectFilter, ProductPopoverSurface, ProductSurfaceState } =
  repositoryUiHost.components;
const readBusinessLinks = repositoryUiHost.useKnowledgeBusinessLinks();
const rows = computed(() =>
  buildVaultWorkspaceRows(notes.value, git.value?.changes ?? [], links.value),
);
const visibleRows = computed(() =>
  rows.value.filter((row) =>
    filter.value === 'linked'
      ? row.links.length > 0
      : filter.value === 'changes'
        ? Boolean(row.change)
        : true,
  ),
);
const filters = computed(() => [
  { value: 'all', label: t('repository.workspace.all'), count: rows.value.length },
  {
    value: 'linked',
    label: t('repository.workspace.linked'),
    count: rows.value.filter((row) => row.links.length).length,
  },
  {
    value: 'changes',
    label: t('repository.workspace.changes'),
    count: rows.value.filter((row) => row.change).length,
  },
]);
const tones = {
  added: 'bg-success/10 text-success',
  modified: 'bg-info/10 text-info',
  deleted: 'bg-destructive/10 text-destructive',
  renamed: 'bg-primary/10 text-primary',
  conflicted: 'bg-warning/10 text-warning',
};

const loaded = ref(false);
const busy = ref(false);
const linkBusy = ref(false);
const error = ref('');
const active = ref(true);
let epoch = 0;
let attemptedLink = '';
const available = computed(() => snapshot.value?.health.state === 'Available');
const linksReadFailed = computed(() =>
  linkFailures.value.some((failure) => failure.stage === 'read'),
);
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
  const changedBinding = snapshot.value?.binding.id !== result.data?.binding.id;
  snapshot.value = result.data;
  if (changedBinding || !available.value) {
    notes.value = [];
    links.value = [];
    git.value = null;
    linkFailures.value = [];
  }
  gitError.value = false;
  linkFailures.value = [];
  if (!available.value || !snapshot.value) return;
  const binding = snapshot.value.binding;
  const catalog = await service.scanLocalVault();
  if (!catalog.ok) throw unwrapOrThrowError(catalog);
  if (readEpoch !== epoch || !active.value) return;
  if (catalog.data.binding.id !== binding.id)
    throw new Error(t('repository.workspace.bindingChanged'));
  const nextNotes = catalog.data.notes;
  // Business links and Git status are independent reads: neither may gate the note list.
  const [changes, business] = await Promise.allSettled([
    service.getLocalVaultGitChanges().then(unwrapOrThrowError),
    readBusinessLinks(documentRefs(nextNotes, binding)),
  ]);
  if (readEpoch !== epoch || !active.value) return;
  notes.value = nextNotes;
  if (changes.status === 'fulfilled' && changes.value.bindingId === binding.id)
    git.value = changes.value;
  else {
    git.value = null;
    gitError.value = true;
  }
  if (business.status === 'fulfilled') {
    links.value = business.value.links;
    linkFailures.value = business.value.failures;
    reportLinkFailures(business.value.failures);
  } else {
    // The whole read failed: keep the links already confirmed for this binding.
    linkFailures.value = [{ stage: 'read', code: failureCodeOf(business.reason) }];
    reportLinkFailures(linkFailures.value);
  }
}
function documentRefs(notes: LocalVaultNoteSummaryDTO[], binding: { knowledgeSpaceId: string }) {
  return notes.flatMap((note) =>
    note.knowledgeDocumentId
      ? [{ knowledgeSpaceId: binding.knowledgeSpaceId, documentId: note.knowledgeDocumentId }]
      : [],
  ) satisfies KnowledgeDocumentRef[];
}
/** Codes only; failure messages can echo user content and stay out of the diagnostic log. */
function failureCodeOf(cause: unknown) {
  if (typeof cause === 'object' && cause !== null) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === 'string' && code) return code;
    const name = (cause as { name?: unknown }).name;
    if (typeof name === 'string' && name) return name;
  }
  return 'UNKNOWN';
}
/** Structured runtime evidence for the next reproduction on the failing platform. */
function reportLinkFailures(failures: KnowledgeLinkFailure[]) {
  if (!failures.length) return;
  console.warn('[knowledge-business-links] business link read failed', {
    bindingId: snapshot.value?.binding.id,
    documents: notes.value.length,
    failures,
  });
}
/** Re-read business links alone; the note list and Git status stay untouched. */
async function retryLinks() {
  if (busy.value || linkBusy.value || !available.value || !snapshot.value) return;
  const retryEpoch = epoch;
  linkBusy.value = true;
  try {
    const read = await readBusinessLinks(documentRefs(notes.value, snapshot.value.binding));
    if (retryEpoch !== epoch || !active.value) return;
    links.value = read.links;
    linkFailures.value = read.failures;
    reportLinkFailures(read.failures);
  } catch (failure) {
    if (retryEpoch !== epoch) return;
    linkFailures.value = [{ stage: 'read', code: failureCodeOf(failure) }];
    reportLinkFailures(linkFailures.value);
  } finally {
    if (retryEpoch === epoch) linkBusy.value = false;
  }
}
function reload() {
  attemptedLink = '';
  return action(load);
}
function select() {
  vaultMenuOpen.value = false;
  return action(async () => {
    const result = await service.selectLocalVault();
    if (!result.ok) throw unwrapOrThrowError(result);
    await load();
  });
}
async function detach() {
  vaultMenuOpen.value = false;
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

<style scoped>
.vault-note-enter-active,
.vault-note-leave-active,
.vault-note-move {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}
.vault-note-enter-from,
.vault-note-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
@media (prefers-reduced-motion: reduce) {
  .vault-note-enter-active,
  .vault-note-leave-active,
  .vault-note-move {
    transition: none;
  }
}
</style>
