<template>
  <div
    class="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    data-testid="local-vault-workspace"
  >
    <div
      v-if="error"
      class="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
      role="alert"
    >
      <span class="min-w-0 truncate">{{ error }}</span>
      <Button variant="ghost" size="sm" @click="loadBinding">{{ t('common.retry') }}</Button>
    </div>

    <div
      v-if="!isBound"
      class="grid min-h-0 flex-1 place-items-center overflow-auto"
      data-testid="local-vault-empty"
    >
      <DocumentWorkspaceState
        kind="empty"
        :title="t('repository.localVault.selectTitle')"
        :description="t('repository.localVault.selectDescription')"
      >
        <template #icon>
          <div
            class="grid h-12 w-12 place-items-center rounded-xl bg-[hsl(var(--surface-raised)/0.66)] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.58)]"
          >
            <FolderOpen class="h-7 w-7 text-muted-foreground" />
          </div>
        </template>
        <template #actions>
          <Button :disabled="loading" data-testid="local-vault-select" @click="selectVault">
            <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
            <FolderOpen v-else class="mr-2 h-4 w-4" />
            {{ t('repository.localVault.selectAction') }}
          </Button>
        </template>
      </DocumentWorkspaceState>
    </div>

    <template v-else>
      <DocumentWorkspaceToolbar data-testid="local-vault-document-toolbar">
        <template v-if="activeNote">
          <h1 class="min-w-0 max-w-[46%] truncate text-[13px] font-semibold tracking-[-0.01em]">
            {{ activeNote.title }}
          </h1>
          <span class="min-w-0 truncate text-[11px] text-[hsl(var(--foreground-subtle))]">
            {{ activeNote.relativePath }}
          </span>
          <Badge
            v-for="tag in activeNote.tags.slice(0, 3)"
            :key="tag"
            variant="outline"
            class="hidden shrink-0 @3xl/panel:inline-flex"
          >
            {{ tag }}
          </Badge>
        </template>
        <span v-else class="truncate text-sm font-medium text-muted-foreground">
          {{ t('repository.localVault.selectNote') }}
        </span>

        <template #actions>
          <Button
            v-if="activeNote"
            variant="ghost"
            size="sm"
            class="h-7 shrink-0 px-2 text-xs"
            data-testid="local-vault-open-note-obsidian"
            @click="openInObsidian(activeNote.relativePath)"
          >
            <ExternalLink class="mr-1.5 h-3.5 w-3.5" />
            {{ t('repository.localVault.openNote') }}
          </Button>
        </template>
      </DocumentWorkspaceToolbar>

      <div
        class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(12rem,38%)_minmax(0,1fr)] @3xl/panel:grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)] @3xl/panel:grid-rows-1"
      >
        <aside
          class="flex min-h-0 flex-col border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.55)] @3xl/panel:border-b-0 @3xl/panel:border-r"
          data-testid="local-vault-catalog"
        >
          <div class="border-b border-[hsl(var(--border-subtle))] px-3 py-2.5">
            <DocumentSourceStatus
              :title="binding?.displayName ?? ''"
              :subtitle="binding?.rootPath ?? ''"
              :count-label="String(notes.length)"
            >
              <template #icon>
                <HardDrive class="h-4 w-4" />
              </template>
              <template #actions>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7"
                  :aria-label="t('repository.localVault.rescan')"
                  :title="t('repository.localVault.rescan')"
                  :disabled="loading"
                  data-testid="local-vault-rescan"
                  @click="scan"
                >
                  <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7"
                  :aria-label="t('repository.localVault.openRoot')"
                  :title="t('repository.localVault.openRoot')"
                  @click="openInObsidian()"
                >
                  <ExternalLink class="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7"
                  :aria-label="t('repository.localVault.changeVault')"
                  :title="t('repository.localVault.changeVault')"
                  @click="selectVault"
                >
                  <FolderSync class="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-destructive/75 hover:bg-destructive/10 hover:text-destructive"
                  :aria-label="t('repository.localVault.detach')"
                  :title="t('repository.localVault.detach')"
                  data-testid="local-vault-detach"
                  @click="confirmDetach"
                >
                  <Unplug class="h-3.5 w-3.5" />
                </Button>
              </template>
            </DocumentSourceStatus>
          </div>

          <div class="px-2.5 pb-2 pt-2.5">
            <DocumentCatalogSearch
              v-model="searchQuery"
              :placeholder="t('repository.localVault.searchPlaceholder')"
              :clear-label="t('common.clear')"
              test-id="local-vault-search"
              @submit="search"
              @clear="clearSearch"
            />
          </div>

          <div class="min-h-0 flex-1 overflow-auto px-1.5 pb-1.5">
            <div v-if="displayedNotes.length" class="space-y-0.5 py-0.5">
              <DocumentCatalogRow
                v-for="note in displayedNotes"
                :key="note.relativePath"
                :selected="activeNote?.relativePath === note.relativePath"
                :data-testid="`local-vault-note-${note.relativePath}`"
                @activate="openNote(note)"
                @dblclick="openInObsidian(note.relativePath)"
              >
                {{ note.title }}
                <template #meta>{{ note.relativePath }}</template>
                <template v-if="resultExcerpt(note.relativePath)" #description>
                  {{ resultExcerpt(note.relativePath) }}
                </template>
              </DocumentCatalogRow>
            </div>

            <DocumentWorkspaceState v-if="loading && displayedNotes.length === 0" kind="loading" />
            <DocumentWorkspaceState
              v-else-if="displayedNotes.length === 0"
              kind="empty"
              :title="
                searchActive
                  ? t('repository.localVault.noSearchResults')
                  : t('repository.localVault.noNotes')
              "
            />
          </div>
        </aside>

        <main class="min-h-0 overflow-hidden">
          <div v-if="activeNote" class="h-full min-h-0">
            <div class="h-full min-h-0 overflow-y-auto" data-scroll-host="local-vault-preview">
              <KnowledgeMarkdownPreview
                :markdown="activeNote.contentMarkdown"
                :title="activeNote.title"
                data-testid="local-vault-preview"
                @vault-link="openWikiLink"
              />
            </div>
          </div>
          <DocumentWorkspaceState
            v-else
            class="h-full"
            kind="empty"
            :title="t('repository.localVault.selectNote')"
            :description="t('repository.localVault.selectNoteDescription')"
          >
            <template #icon>
              <BookOpen class="h-8 w-8 text-muted-foreground" />
            </template>
          </DocumentWorkspaceState>
        </main>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import {
  BookOpen,
  ExternalLink,
  FolderOpen,
  FolderSync,
  HardDrive,
  Loader2,
  RefreshCw,
  Unplug,
} from '@lucide/vue';
import { Badge, Button, useConfirm } from '@memoflow/ui-vue-shadcn';
import DocumentCatalogRow from '../components/DocumentCatalogRow.vue';
import DocumentCatalogSearch from '../components/DocumentCatalogSearch.vue';
import DocumentSourceStatus from '../components/DocumentSourceStatus.vue';
import DocumentWorkspaceState from '../components/DocumentWorkspaceState.vue';
import DocumentWorkspaceToolbar from '../components/DocumentWorkspaceToolbar.vue';
import KnowledgeMarkdownPreview from '../components/KnowledgeMarkdownPreview.vue';
import { useLocalVault } from '../composables/useLocalVault';

const { t } = useI18n();
const route = useRoute();
const {
  binding,
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
  notes,
} = useLocalVault();

function noteQueryId(): string {
  const raw = route.query.note;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return '';
}

async function applyNoteQuerySelection(): Promise<void> {
  const requested = noteQueryId();
  if (!requested) return;
  const target =
    notes.value.find((note) => note.relativePath === requested) ??
    notes.value.find((note) => note.title === requested) ??
    null;
  if (!target) return;
  if (activeNote.value?.relativePath === target.relativePath) return;
  await openNote(target);
}

onMounted(() => {
  void applyNoteQuerySelection();
});

watch(
  () => [route.query.note, notes.value.map((note) => note.relativePath).join('|')],
  () => {
    void applyNoteQuerySelection();
  },
);

const LOCAL_SEARCH_DEBOUNCE_MS = 220;
let localSearchTimer: ReturnType<typeof setTimeout> | null = null;

watch(searchQuery, () => {
  if (localSearchTimer) clearTimeout(localSearchTimer);
  localSearchTimer = setTimeout(() => {
    localSearchTimer = null;
    if (searchQuery.value.trim()) void search();
    else clearSearch();
  }, LOCAL_SEARCH_DEBOUNCE_MS);
});

onBeforeUnmount(() => {
  if (localSearchTimer) clearTimeout(localSearchTimer);
});

function resultExcerpt(relativePath: string): string {
  const result = searchResults.value.find((item) => item.note.relativePath === relativePath);
  return result?.matches[0]?.lineContent ?? '';
}

async function confirmDetach(): Promise<void> {
  const confirmed = await useConfirm({
    title: t('repository.localVault.detachTitle'),
    description: t('repository.localVault.detachDescription'),
    confirmText: t('repository.localVault.detach'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (confirmed) await detachVault();
}
</script>
