<template>
  <div
    class="flex h-full min-h-0 flex-col bg-[hsl(var(--surface)/0.5)]"
    data-testid="knowledge-note-catalog"
  >
    <div
      class="border-b border-[hsl(var(--border-subtle))] px-3 py-2.5"
      data-testid="knowledge-catalog-repository"
    >
      <DocumentSourceStatus
        :title="repositoryName"
        :subtitle="sourceSubtitle"
        :count-label="noteCountLabel"
        :status-label="providerNeedsAttention ? providerWarningLabel : undefined"
        :status-tone="providerNeedsAttention ? 'warning' : 'default'"
        status-test-id="knowledge-projection-provider-warning"
        :syncing="syncing"
        :syncing-label="t('repository.projection.syncing')"
        syncing-test-id="knowledge-projection-syncing-badge"
      >
        <template #icon>
          <BookOpen class="h-4 w-4" />
        </template>
        <template #actions>
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
                <p
                  v-if="hiddenNoteCount > 0 && !includeHidden"
                  class="pt-1 text-[10px] text-muted-foreground"
                >
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
        </template>
      </DocumentSourceStatus>

      <Select
        v-if="connections.length > 1"
        :model-value="selectedConnectionId"
        @update:model-value="handleConnectionChange"
      >
        <SelectTrigger
          class="mt-2 h-7 w-full bg-[hsl(var(--surface-raised)/0.5)] text-xs shadow-none"
          :aria-label="t('repository.projection.connectionLabel')"
          data-testid="knowledge-projection-connection-select"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="connection in connections" :key="connection.id" :value="connection.id">
            {{ connectionDisplayName(connection) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="px-2.5 pb-2 pt-2.5">
      <DocumentCatalogSearch
        :model-value="searchQuery"
        :placeholder="t('repository.projection.searchPlaceholder')"
        :clear-label="t('common.clear')"
        test-id="knowledge-projection-search"
        @update:model-value="emit('update:searchQuery', $event)"
        @submit="emit('search')"
        @clear="emit('clear-search')"
      />
    </div>

    <div class="min-h-0 flex-1 overflow-auto px-1.5 pb-1.5">
      <template v-if="searchMode">
        <div v-keyboard-list class="space-y-0.5">
          <DocumentCatalogRow
            v-for="note in notes"
            :key="note.id"
            :data-keyboard-item="note.id"
            :selected="selectedNoteId === note.id"
            :data-testid="`knowledge-projection-note-${note.id}`"
            @activate="emit('select', note.id)"
          >
            {{ note.title }}
            <template #meta>{{ note.relativePath }}</template>
          </DocumentCatalogRow>
        </div>

        <DocumentWorkspaceState
          v-if="!loading && notes.length === 0"
          kind="empty"
          :title="t('repository.projection.noSearchResults')"
        />

        <DocumentWorkspaceState v-if="loading && notes.length === 0" kind="loading" />

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

        <div
          v-else-if="treeRows.length"
          class="space-y-0.5 py-0.5"
          v-keyboard-list
          data-keyboard-tree
          data-testid="knowledge-file-tree"
        >
          <template v-for="row in treeRows" :key="row.node.relativePath">
            <button
              v-if="row.node.kind === 'directory'"
              type="button"
              class="flex h-7 w-full items-center gap-1 rounded-md pr-2 text-left text-sm text-[hsl(var(--foreground-muted))] transition-colors hover:bg-[hsl(var(--hover)/0.6)] hover:text-foreground"
              :style="{ paddingLeft: `${6 + row.depth * 16}px` }"
              :data-keyboard-item="row.node.relativePath"
              :data-keyboard-parent="row.node.relativePath.split('/').slice(0, -1).join('/')"
              :aria-expanded="expandedDirectories.includes(row.node.relativePath)"
              :aria-disabled="loadingDirectories.includes(row.node.relativePath)"
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

            <DocumentCatalogRow
              v-else
              class="h-7 py-0 pr-2"
              :selected="selectedNoteId === row.node.projectionId"
              :style="{ paddingLeft: `${9 + row.depth * 16}px` }"
              :data-keyboard-item="row.node.relativePath"
              :data-keyboard-parent="row.node.relativePath.split('/').slice(0, -1).join('/')"
              :data-testid="`knowledge-tree-note-${row.node.projectionId}`"
              @activate="emit('select', row.node.projectionId)"
            >
              <template #icon>
                <FileText class="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
              </template>
              {{ row.node.title }}
            </DocumentCatalogRow>
          </template>
        </div>

        <DocumentWorkspaceState
          v-else-if="!treeLoading && syncing"
          kind="loading"
          :title="t('repository.projection.syncing')"
          :description="t('repository.projection.syncingDescription')"
          data-testid="knowledge-projection-syncing-empty"
        />
        <DocumentWorkspaceState
          v-else-if="!treeLoading"
          kind="empty"
          :title="t('repository.projection.noNotes')"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { vKeyboardList } from '../../../shared/keyboard/list-adapter';
import { computed } from 'vue';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  EyeOff,
  FileText,
  Loader2,
  RefreshCw,
  X,
} from '@lucide/vue';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@memoflow/ui-vue-shadcn';
import type {
  KnowledgeNoteProjectionSummaryDTO,
  KnowledgeNoteTreeNodeDTO,
  KnowledgeRemoteBindingClientDTO,
} from '@memoflow/contracts/repository';
import { useI18n } from 'vue-i18n';
import DocumentCatalogRow from './DocumentCatalogRow.vue';
import DocumentCatalogSearch from './DocumentCatalogSearch.vue';
import DocumentSourceStatus from './DocumentSourceStatus.vue';
import DocumentWorkspaceState from './DocumentWorkspaceState.vue';

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
const sourceSubtitle = computed(() => `${props.repositoryDisplayName} · ${props.defaultBranch}`);

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

function handleConnectionChange(value: unknown): void {
  if (typeof value !== 'string' || !value || value === props.selectedConnectionId) return;
  emit('connection-change', value);
}
</script>
