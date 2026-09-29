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
      class="grid min-h-0 flex-1 place-items-center overflow-auto px-6 py-10"
      data-testid="local-vault-empty"
    >
      <div class="flex max-w-md flex-col items-center text-center">
        <div class="grid h-12 w-12 place-items-center rounded-xl bg-[hsl(var(--surface-raised)/0.66)] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.58)]">
          <FolderOpen class="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 class="mt-5 text-xl font-semibold">{{ t('repository.localVault.selectTitle') }}</h1>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">
          {{ t('repository.localVault.selectDescription') }}
        </p>
        <Button
          class="mt-6"
          :disabled="loading"
          data-testid="local-vault-select"
          @click="selectVault"
        >
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          <FolderOpen v-else class="mr-2 h-4 w-4" />
          {{ t('repository.localVault.selectAction') }}
        </Button>
      </div>
    </div>

    <template v-else>
      <header class="flex min-h-11 min-w-0 flex-wrap items-center gap-3 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.82)] px-3 py-2 shadow-[0_1px_0_hsl(var(--border)/0.04)] backdrop-blur-sm @2xl/panel:px-4">
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
            <HardDrive class="h-3.5 w-3.5 shrink-0 text-[hsl(var(--foreground-subtle))]" />
            <h1 class="truncate text-[13px] font-semibold tracking-[-0.01em]">{{ binding?.displayName }}</h1>
            <Badge variant="secondary" class="shrink-0">{{ notes.length }}</Badge>
          </div>
          <p class="mt-0.5 truncate text-[11px] text-[hsl(var(--foreground-subtle))]" :title="binding?.rootPath">
            {{ binding?.rootPath }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 rounded-md text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--hover))] hover:text-foreground"
            :aria-label="t('repository.localVault.rescan')"
            :title="t('repository.localVault.rescan')"
            :disabled="loading"
            data-testid="local-vault-rescan"
            @click="scan"
          >
            <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 rounded-md text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--hover))] hover:text-foreground"
            :aria-label="t('repository.localVault.openRoot')"
            :title="t('repository.localVault.openRoot')"
            @click="openInObsidian()"
          >
            <ExternalLink class="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 rounded-md text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--hover))] hover:text-foreground"
            :aria-label="t('repository.localVault.changeVault')"
            :title="t('repository.localVault.changeVault')"
            @click="selectVault"
          >
            <FolderSync class="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 rounded-md text-destructive/75 hover:bg-destructive/10 hover:text-destructive"
            :aria-label="t('repository.localVault.detach')"
            :title="t('repository.localVault.detach')"
            data-testid="local-vault-detach"
            @click="confirmDetach"
          >
            <Unplug class="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div
        class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(12rem,38%)_minmax(0,1fr)] @3xl/panel:grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)] @3xl/panel:grid-rows-1"
      >
        <aside
          class="flex min-h-0 flex-col border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.55)] @3xl/panel:border-b-0 @3xl/panel:border-r"
        >
          <div class="border-b border-[hsl(var(--border-subtle))] px-2.5 py-2">
            <div class="relative w-full max-w-[15rem]">
              <Search
                class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                v-model="searchQuery"
                class="h-8 rounded-lg border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.5)] pl-8 pr-8 text-[12px] shadow-none"
                :placeholder="t('repository.localVault.searchPlaceholder')"
                data-testid="local-vault-search"
                @keyup.enter="search"
                @keyup.esc="clearSearch"
              />
              <button
                v-if="searchQuery"
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                :aria-label="t('common.clear')"
                @click="clearSearch"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-auto">
            <button
              v-for="note in displayedNotes"
              :key="note.relativePath"
              type="button"
              class="mx-1.5 my-0.5 block w-[calc(100%-0.75rem)] rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[hsl(var(--hover))]"
              :class="{
                'bg-[hsl(var(--selected)/0.82)] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.46)]':
                  activeNote?.relativePath === note.relativePath,
              }"
              :data-testid="`local-vault-note-${note.relativePath}`"
              @click="openNote(note)"
              @dblclick="openInObsidian(note.relativePath)"
            >
              <span class="block truncate text-sm font-medium">{{ note.title }}</span>
              <span class="mt-1 block truncate text-xs text-muted-foreground">{{
                note.relativePath
              }}</span>
              <span
                v-if="resultExcerpt(note.relativePath)"
                class="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground"
              >
                {{ resultExcerpt(note.relativePath) }}
              </span>
            </button>
            <div
              v-if="!loading && displayedNotes.length === 0"
              class="grid h-32 place-items-center px-4 text-center text-sm text-muted-foreground"
            >
              {{
                searchActive
                  ? t('repository.localVault.noSearchResults')
                  : t('repository.localVault.noNotes')
              }}
            </div>
          </div>
        </aside>

        <main class="min-h-0 overflow-hidden">
          <div v-if="activeNote" class="flex h-full min-h-0 flex-col">
            <div class="flex min-h-11 min-w-0 items-start gap-3 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.42)] px-4 py-2.5">
              <FileText class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div class="min-w-0 flex-1">
                <h2 class="truncate text-sm font-semibold">{{ activeNote.title }}</h2>
                <p class="mt-1 truncate text-xs text-muted-foreground">
                  {{ activeNote.relativePath }}
                </p>
                <div v-if="activeNote.tags.length" class="mt-2 flex flex-wrap gap-1">
                  <Badge v-for="tag in activeNote.tags" :key="tag" variant="outline">{{
                    tag
                  }}</Badge>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                class="h-8 shrink-0"
                data-testid="local-vault-open-note-obsidian"
                @click="openInObsidian(activeNote.relativePath)"
              >
                <ExternalLink class="mr-1.5 h-4 w-4" />
                {{ t('repository.localVault.openNote') }}
              </Button>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto" data-scroll-host="local-vault-preview">
              <KnowledgeMarkdownPreview
                :markdown="activeNote.contentMarkdown"
                :title="activeNote.title"
                data-testid="local-vault-preview"
                @vault-link="openWikiLink"
              />
            </div>
          </div>
          <div v-else class="grid h-full min-h-48 place-items-center px-6 text-center">
            <div>
              <BookOpen class="mx-auto h-8 w-8 text-muted-foreground" />
              <p class="mt-3 text-sm font-medium">{{ t('repository.localVault.selectNote') }}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ t('repository.localVault.selectNoteDescription') }}
              </p>
            </div>
          </div>
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
  FileText,
  FolderOpen,
  FolderSync,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  Unplug,
  X,
} from '@lucide/vue';
import { Badge, Button, Input, useConfirm } from '@memoflow/ui-vue-shadcn';
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
