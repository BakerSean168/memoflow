<template>
  <div class="flex h-full min-h-0 flex-col bg-[hsl(var(--surface)/0.5)]" data-testid="knowledge-note-catalog">
    <div class="border-b border-[hsl(var(--border-subtle))] px-3 py-2.5" data-testid="knowledge-catalog-repository">
      <div class="flex min-w-0 items-center gap-2">
        <BookOpen class="h-4 w-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0 truncate text-sm font-semibold">{{ repositoryName }}</span>
        <Badge variant="secondary" class="shrink-0 px-1.5 text-[10px]">
          {{ noteCountLabel }}
        </Badge>

        <div class="ml-auto flex shrink-0 items-center gap-0.5">
          <Badge
            v-if="providerNeedsAttention"
            variant="outline"
            class="mr-1 max-w-32 truncate px-1.5 text-[10px]"
            data-testid="knowledge-projection-provider-warning"
          >
            {{ providerWarningLabel }}
          </Badge>
          <Loader2
            v-if="syncing"
            class="mr-1 h-3.5 w-3.5 animate-spin text-muted-foreground"
            :title="t('repository.projection.syncing')"
            data-testid="knowledge-projection-syncing-badge"
          />

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7"
                :aria-label="t('repository.projection.hiddenDirectories')"
                :title="t('repository.projection.hiddenDirectories')"
                data-testid="knowledge-tree-hidden-menu"
              >
                <EyeOff class="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-56">
              <DropdownMenuLabel>
                {{ t('repository.projection.hiddenDirectories') }}
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                :checked="includeHidden"
                data-testid="knowledge-tree-include-hidden"
                @update:checked="emit('toggle-hidden', Boolean($event))"
              >
                {{ t('repository.projection.showHiddenDirectories') }}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <div class="space-y-1 px-2 py-1.5">
                <div
                  v-for="directory in hiddenDirectories"
                  :key="directory"
                  class="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                >
                  <span class="truncate font-mono">{{ directory }}</span>
                </div>
                <p v-if="hiddenNoteCount > 0 && !includeHidden" class="pt-1 text-[10px] text-muted-foreground">
                  {{ t('repository.projection.hiddenNoteCount', { count: hiddenNoteCount }) }}
                </p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            :aria-label="t('repository.projection.refresh')"
            :title="t('repository.projection.refresh')"
            :disabled="refreshing"
            data-testid="knowledge-projection-refresh"
            @click="emit('refresh')"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': refreshing }" />
          </Button>
          <Button
            v-if="closable"
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            :aria-label="t('common.close')"
            data-testid="knowledge-catalog-close"
            @click="emit('close')"
          >
            <X class="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div class="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
        <span class="min-w-0 truncate">{{ repositoryDisplayName }}</span>
        <span aria-hidden="true">·</span>
        <span class="shrink-0">{{ defaultBranch }}</span>
      </div>

      <select
        v-if="connections.length > 1"
        :value="selectedConnectionId"
        class="mt-2 h-7 w-full rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.5)] px-2 text-xs text-foreground outline-none focus:border-primary/35 focus:ring-2 focus:ring-ring/25"
        :aria-label="t('repository.projection.connectionLabel')"
        data-testid="knowledge-projection-connection-select"
        @change="handleConnectionChange"
      >
        <option v-for="connection in connections" :key="connection.id" :value="connection.id">
          {{ connectionDisplayName(connection) }}
        </option>
      </select>
    </div>

    <div class="px-2.5 pb-2 pt-2.5">
      <div class="relative w-full">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="text"
          autocomplete="off"
          :model-value="searchQuery"
          class="h-8 rounded-md border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.5)] pl-8 pr-8 text-sm shadow-none"
          :placeholder="t('repository.projection.searchPlaceholder')"
          data-testid="knowledge-projection-search"
          @update:model-value="emit('update:searchQuery', String($event ?? ''))"
          @keyup.enter="emit('search')"
          @keyup.esc="emit('clear-search')"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-sm text-[hsl(var(--foreground-subtle))] transition-colors hover:bg-[hsl(var(--hover))] hover:text-foreground"
          :aria-label="t('common.clear')"
          data-testid="knowledge-projection-search-clear"
          @click="emit('clear-search')"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto px-1.5 pb-1.5">
      <template v-if="searchMode">
        <div class="space-y-0.5">
          <button
            v-for="note in notes"
            :key="note.id"
            type="button"
            class="group block w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[hsl(var(--hover)/0.6)]"
            :class="
              selectedNoteId === note.id
                ? 'bg-[hsl(var(--selected)/0.82)] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.42)]'
                : 'text-foreground'
            "
            :data-testid="`knowledge-projection-note-${note.id}`"
            @click="emit('select', note.id)"
          >
            <span class="block truncate text-sm font-medium leading-5">{{ note.title }}</span>
            <span class="mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground">
              {{ note.relativePath }}
            </span>
          </button>
        </div>

        <div
          v-if="!loading && notes.length === 0"
          class="grid h-32 place-items-center px-4 text-center text-sm text-muted-foreground"
        >
          {{ t('repository.projection.noSearchResults') }}
        </div>

        <div
          v-if="loading && notes.length === 0"
          class="grid h-32 place-items-center text-muted-foreground"
        >
          <Loader2 class="h-4 w-4 animate-spin" />
        </div>

        <div v-if="notes.length > 0" class="px-2 py-3 text-center">
          <p class="text-[11px] text-muted-foreground">{{ loadedCountLabel }}</p>
          <Button
            v-if="nextCursor"
            size="sm"
            variant="ghost"
            class="mt-1 h-7 px-2 text-xs"
            :disabled="loadingMore"
            data-testid="knowledge-projection-load-more"
            @click="emit('load-more')"
          >
            <Loader2 v-if="loadingMore" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
            {{ t('repository.projection.loadMore') }}
          </Button>
        </div>
      </template>

      <template v-else>
        <div v-if="treeLoading && treeRows.length === 0" class="grid h-32 place-items-center">
          <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
        </div>

        <div v-else-if="treeRows.length" class="space-y-0.5 py-0.5" data-testid="knowledge-file-tree">
          <template v-for="row in treeRows" :key="row.node.relativePath">
            <button
              v-if="row.node.kind === 'directory'"
              type="button"
              class="flex h-7 w-full items-center gap-1 rounded-md pr-2 text-left text-sm text-[hsl(var(--foreground-muted))] transition-colors hover:bg-[hsl(var(--hover)/0.6)] hover:text-foreground"
              :style="{ paddingLeft: `${6 + row.depth * 16}px` }"
              :data-testid="`knowledge-tree-directory-${row.node.relativePath}`"
              @click="emit('toggle-directory', row.node.relativePath)"
            >
              <Loader2
                v-if="loadingDirectories.includes(row.node.relativePath)"
                class="h-3.5 w-3.5 shrink-0 animate-spin"
              />
              <ChevronDown
                v-else-if="expandedDirectories.includes(row.node.relativePath)"
                class="h-3.5 w-3.5 shrink-0"
              />
              <ChevronRight v-else class="h-3.5 w-3.5 shrink-0" />
              <span class="min-w-0 flex-1 truncate">{{ row.node.name }}</span>
              <span class="shrink-0 text-[10px] tabular-nums text-muted-foreground/80">
                {{ row.node.noteCount }}
              </span>
            </button>

            <button
              v-else
              type="button"
              class="flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-sm transition-colors hover:bg-[hsl(var(--hover)/0.6)]"
              :class="
                selectedNoteId === row.node.projectionId
                  ? 'bg-[hsl(var(--selected)/0.82)] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.42)]'
                  : 'text-foreground/90'
              "
              :style="{ paddingLeft: `${9 + row.depth * 16}px` }"
              :data-testid="`knowledge-tree-note-${row.node.projectionId}`"
              @click="emit('select', row.node.projectionId)"
            >
              <FileText class="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
              <span class="min-w-0 flex-1 truncate">{{ row.node.title }}</span>
            </button>
          </template>
        </div>

        <div
          v-else-if="!treeLoading"
          class="grid h-32 place-items-center px-4 text-center text-sm text-muted-foreground"
        >
          <div v-if="syncing" data-testid="knowledge-projection-syncing-empty">
            <Loader2 class="mx-auto mb-2 h-4 w-4 animate-spin" />
            <p class="font-medium text-foreground">{{ t('repository.projection.syncing') }}</p>
            <p class="mt-1 text-xs leading-5">{{ t('repository.projection.syncingDescription') }}</p>
          </div>
          <template v-else>
            {{ t('repository.projection.noNotes') }}
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  EyeOff,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  X,
} from '@lucide/vue';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from '@memoflow/ui-vue-shadcn';
import type {
  KnowledgeNoteProjectionSummaryDTO,
  KnowledgeNoteTreeNodeDTO,
  KnowledgeRemoteBindingClientDTO,
} from '@memoflow/contracts/repository';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  notes: KnowledgeNoteProjectionSummaryDTO[];
  treeChildren: Record<string, KnowledgeNoteTreeNodeDTO[]>;
  expandedDirectories: string[];
  loadingDirectories: string[];
  selectedNoteId: string;
  searchQuery: string;
  loadedCountLabel: string;
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  treeLoading: boolean;
  syncing: boolean;
  refreshing: boolean;
  repositoryName: string;
  repositoryDisplayName: string;
  defaultBranch: string;
  noteCountLabel: string;
  providerNeedsAttention: boolean;
  providerWarningLabel: string;
  connections: KnowledgeRemoteBindingClientDTO[];
  selectedConnectionId: string;
  hiddenDirectories: string[];
  hiddenNoteCount: number;
  includeHidden: boolean;
  closable?: boolean;
}>();

const emit = defineEmits<{
  'update:searchQuery': [value: string];
  select: [projectionId: string];
  search: [];
  'clear-search': [];
  'load-more': [];
  refresh: [];
  close: [];
  'connection-change': [connectionId: string];
  'toggle-directory': [relativePath: string];
  'toggle-hidden': [includeHidden: boolean];
}>();

const { t } = useI18n();

const searchMode = computed(() => props.searchQuery.trim().length > 0);

const treeRows = computed(() => {
  const expanded = new Set(props.expandedDirectories);
  const rows: Array<{ node: KnowledgeNoteTreeNodeDTO; depth: number }> = [];

  const visit = (parent: string, depth: number) => {
    for (const node of props.treeChildren[parent] ?? []) {
      rows.push({ node, depth });
      if (node.kind === 'directory' && expanded.has(node.relativePath)) {
        visit(node.relativePath, depth + 1);
      }
    }
  };

  visit('', 0);
  return rows;
});

function connectionDisplayName(connection: KnowledgeRemoteBindingClientDTO): string {
  return connection.observation?.repositoryFullName ?? connection.repositoryFullNameSnapshot;
}

function handleConnectionChange(event: Event): void {
  const select = event.currentTarget as HTMLSelectElement | null;
  if (!select?.value) return;
  emit('connection-change', select.value);
}
</script>
