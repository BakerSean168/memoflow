<template>
  <div
    class="flex h-full min-h-0 flex-col overflow-hidden bg-background"
    data-testid="knowledge-projection-workspace"
  >
    <div
      v-if="errorMessage"
      class="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
      role="alert"
      data-testid="knowledge-projection-error"
    >
      <span class="min-w-0">{{ errorMessage }}</span>
      <Button variant="ghost" size="sm" @click="loadConnections">{{ t('common.retry') }}</Button>
    </div>

    <DocumentWorkspaceState v-if="loadingConnections" class="min-h-0 flex-1" kind="loading" />

    <div
      v-else-if="connections.length === 0"
      class="grid min-h-0 flex-1 place-items-center overflow-auto"
      data-testid="knowledge-projection-empty"
    >
      <DocumentWorkspaceState
        kind="empty"
        :title="t('repository.projection.connectTitle')"
        :description="t('repository.projection.connectDescription')"
      >
        <template #icon>
          <div
            class="grid h-12 w-12 place-items-center rounded-xl bg-[hsl(var(--surface-raised)/0.66)] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.58)]"
          >
            <CloudOff class="h-5 w-5 text-[hsl(var(--foreground-muted))]" />
          </div>
        </template>
        <template #actions>
          <Button data-testid="knowledge-projection-connect" @click="openRepositorySettings">
            <Link2 class="mr-2 h-4 w-4" />
            {{ t('repository.projection.connectAction') }}
          </Button>
        </template>
      </DocumentWorkspaceState>
    </div>

    <template v-else>
      <DocumentWorkspaceToolbar data-testid="knowledge-projection-document-toolbar">
        <template #leading>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 shrink-0 rounded-md text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--hover))] hover:text-foreground"
            :aria-label="
              isNarrow || !catalogVisible
                ? t('repository.projection.openCatalog')
                : t('repository.projection.hideCatalog')
            "
            :title="
              isNarrow || !catalogVisible
                ? t('repository.projection.openCatalog')
                : t('repository.projection.hideCatalog')
            "
            data-testid="knowledge-projection-toggle-catalog"
            @click="toggleCatalog"
          >
            <PanelLeftOpen v-if="isNarrow || !catalogVisible" class="h-4 w-4" />
            <PanelLeftClose v-else class="h-4 w-4" />
          </Button>
        </template>

        <template v-if="selectedNote">
          <h1 class="min-w-0 max-w-[46%] truncate text-[13px] font-semibold tracking-[-0.01em]">
            {{ selectedNote.title }}
          </h1>
          <span class="min-w-0 truncate text-[11px] text-[hsl(var(--foreground-subtle))]">
            {{ selectedNote.relativePath }}
          </span>
          <span class="shrink-0 text-[11px] text-[hsl(var(--foreground-subtle))]" aria-hidden="true"
            >·</span
          >
          <span class="shrink-0 text-[11px] text-[hsl(var(--foreground-subtle))]">
            {{ formatUpdatedAt(selectedNote.updatedAt) }}
          </span>
        </template>
        <span v-else class="truncate text-sm font-medium text-muted-foreground">
          {{ t('repository.projection.catalogTitle') }}
        </span>
        <Loader2
          v-if="loadingDetail"
          class="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
        />

        <template #actions>
          <template v-if="selectedNote">
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 shrink-0 rounded-md text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--hover))] hover:text-foreground"
              :class="
                contextOpen
                  ? 'bg-[hsl(var(--selected))] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.5)]'
                  : ''
              "
              :aria-label="t('repository.projection.contextTitle')"
              :title="t('repository.projection.contextTitle')"
              data-testid="knowledge-projection-context-toggle"
              @click="contextOpen = !contextOpen"
            >
              <PanelRight class="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 shrink-0 rounded-md text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--hover))] hover:text-foreground"
                  :aria-label="t('common.more')"
                  data-testid="knowledge-projection-more"
                >
                  <Ellipsis class="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-52">
                <DropdownMenuItem @click="copyNotePath">
                  <Copy class="mr-2 h-3.5 w-3.5" />
                  {{
                    pathCopied
                      ? t('repository.projection.pathCopied')
                      : t('repository.projection.copyPath')
                  }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  v-if="selectedNote.knowledgeDocumentId === null"
                  data-testid="knowledge-projection-adopt"
                  @click="openAdoptionDialog"
                >
                  <Link2 class="mr-2 h-3.5 w-3.5" />
                  {{ t('repository.projection.stableReferenceAction') }}
                </DropdownMenuItem>
                <DropdownMenuItem v-else disabled data-testid="knowledge-projection-document-id">
                  <Check class="mr-2 h-3.5 w-3.5" />
                  {{ t('repository.projection.stableReferenceReady') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </template>
        </template>
      </DocumentWorkspaceToolbar>

      <div class="flex min-h-0 flex-1 overflow-hidden">
        <aside
          v-if="catalogVisible && !isNarrow"
          class="w-[min(20rem,32%)] shrink-0 border-r border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.42)]"
          data-testid="knowledge-projection-catalog-inline"
        >
          <KnowledgeNoteCatalog
            v-model:search-query="searchQuery"
            :notes="notes"
            :tree-children="treeChildren"
            :expanded-directories="expandedDirectories"
            :loading-directories="loadingDirectories"
            :selected-note-id="selectedNoteId"
            :loaded-count-label="loadedCountLabel"
            :next-cursor="nextCursor"
            :loading="loadingNotes"
            :loading-more="loadingMore"
            :tree-loading="treeLoading"
            :syncing="projectionSyncing"
            :refreshing="loadingNotes || loadingConnections || treeLoading"
            :repository-name="repositoryShortName"
            :repository-display-name="
              selectedConnection ? repositoryDisplayName(selectedConnection) : ''
            "
            :default-branch="selectedConnection ? repositoryDefaultBranch(selectedConnection) : '—'"
            :note-count-label="noteCountLabel"
            :provider-needs-attention="providerNeedsAttention"
            :provider-warning-label="
              selectedConnection ? providerStateLabel(selectedConnection) : ''
            "
            :connections="connections"
            :selected-connection-id="selectedConnectionId"
            :hidden-directories="treeMetadata?.hiddenDirectories ?? []"
            :hidden-note-count="treeMetadata?.hiddenNoteCount ?? 0"
            :include-hidden="includeHiddenDirectories"
            @select="selectNote"
            @search="loadNotes()"
            @clear-search="clearSearch"
            @load-more="loadMoreNotes"
            @refresh="loadConnections"
            @connection-change="selectConnection"
            @toggle-directory="toggleDirectory"
            @toggle-hidden="toggleHiddenDirectories"
          />
        </aside>

        <main class="min-w-0 flex-1 overflow-hidden">
          <div
            v-if="loadingDetail && !selectedNote"
            class="grid h-full min-h-48 place-items-center text-muted-foreground"
          >
            <Loader2 class="h-5 w-5 animate-spin" />
          </div>

          <div v-else-if="selectedNote" class="h-full min-h-0">
            <div class="h-full min-h-0 overflow-y-auto" data-scroll-host="repository-preview">
              <KnowledgeMarkdownPreview
                :markdown="selectedNote.markdownContent"
                :title="selectedNote.title"
                data-testid="knowledge-projection-preview"
                @vault-link="openWikiLink"
              />
            </div>
          </div>

          <DocumentWorkspaceState
            v-else
            class="h-full"
            kind="empty"
            :title="t('repository.projection.selectNote')"
            :description="t('repository.projection.selectNoteDescription')"
          >
            <template #icon>
              <BookOpen class="h-8 w-8 text-muted-foreground" />
            </template>
          </DocumentWorkspaceState>
        </main>

        <aside
          v-if="contextOpen && selectedNote && !isNarrow"
          class="w-72 shrink-0 border-l border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.36)]"
          data-testid="knowledge-projection-context-inline"
        >
          <KnowledgeNoteContextPanel
            :note="selectedNote"
            @select="handleContextSelect"
            @close="contextOpen = false"
          />
        </aside>
      </div>

      <Sheet :open="catalogOpen && isNarrow" @update:open="catalogOpen = $event">
        <ProductSheetSurface
          side="left"
          width="sm"
          :title="t('repository.projection.catalogTitle')"
          test-id="knowledge-projection-catalog-sheet"
        >
          <KnowledgeNoteCatalog
            v-model:search-query="searchQuery"
            :notes="notes"
            :tree-children="treeChildren"
            :expanded-directories="expandedDirectories"
            :loading-directories="loadingDirectories"
            :selected-note-id="selectedNoteId"
            :loaded-count-label="loadedCountLabel"
            :next-cursor="nextCursor"
            :loading="loadingNotes"
            :loading-more="loadingMore"
            :tree-loading="treeLoading"
            :syncing="projectionSyncing"
            :refreshing="loadingNotes || loadingConnections || treeLoading"
            :repository-name="repositoryShortName"
            :repository-display-name="
              selectedConnection ? repositoryDisplayName(selectedConnection) : ''
            "
            :default-branch="selectedConnection ? repositoryDefaultBranch(selectedConnection) : '—'"
            :note-count-label="noteCountLabel"
            :provider-needs-attention="providerNeedsAttention"
            :provider-warning-label="
              selectedConnection ? providerStateLabel(selectedConnection) : ''
            "
            :connections="connections"
            :selected-connection-id="selectedConnectionId"
            :hidden-directories="treeMetadata?.hiddenDirectories ?? []"
            :hidden-note-count="treeMetadata?.hiddenNoteCount ?? 0"
            :include-hidden="includeHiddenDirectories"
            closable
            @select="selectFromCatalogSheet"
            @search="loadNotes()"
            @clear-search="clearSearch"
            @load-more="loadMoreNotes"
            @refresh="loadConnections"
            @close="catalogOpen = false"
            @connection-change="selectConnection"
            @toggle-directory="toggleDirectory"
            @toggle-hidden="toggleHiddenDirectories"
          />
        </ProductSheetSurface>
      </Sheet>

      <Sheet :open="contextOpen && isNarrow" @update:open="contextOpen = $event">
        <ProductSheetSurface
          side="right"
          width="md"
          :title="t('repository.projection.contextTitle')"
          test-id="knowledge-projection-context-sheet"
        >
          <KnowledgeNoteContextPanel
            v-if="selectedNote"
            :note="selectedNote"
            @select="handleContextSelect"
            @close="contextOpen = false"
          />
        </ProductSheetSurface>
      </Sheet>
    </template>

    <Dialog v-model:open="adoptionDialogOpen">
      <ProductDialogShell
        :open="adoptionDialogOpen"
        test-id="knowledge-projection-adopt-dialog"
        size="sm"
      >
        <template #title>{{ t('repository.projection.adoptTitle') }}</template>
        <template #description>{{ t('repository.projection.adoptDescription') }}</template>

        <div v-if="adoptionProposal" class="space-y-3 text-sm">
          <div
            class="rounded-lg bg-[hsl(var(--surface-raised)/0.34)] p-3 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.46)]"
          >
            <p class="text-xs text-muted-foreground">{{ t('repository.projection.notePath') }}</p>
            <p class="mt-1 font-mono text-xs">{{ adoptionProposal.relativePath }}</p>
          </div>
          <div
            class="rounded-lg bg-[hsl(var(--surface-raised)/0.34)] p-3 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.46)]"
          >
            <p class="text-xs text-muted-foreground">{{ t('repository.projection.adoptPatch') }}</p>
            <p class="mt-1 font-mono text-xs" data-testid="knowledge-projection-adopt-document-id">
              memoflow_id: {{ adoptionProposal.knowledgeDocumentId }}
            </p>
          </div>
          <p class="text-xs leading-5 text-muted-foreground">
            {{ t('repository.projection.adoptImmutable') }}
          </p>
        </div>

        <p
          v-if="adoptionError"
          class="text-sm text-destructive"
          role="alert"
          data-testid="knowledge-projection-adopt-error"
        >
          {{ adoptionError }}
        </p>
        <template #footer>
          <Button variant="ghost" :disabled="adopting" @click="closeAdoptionDialog">
            {{ t('common.cancel') }}
          </Button>
          <Button
            :disabled="adopting || !adoptionProposal"
            data-testid="knowledge-projection-adopt-confirm"
            @click="confirmAdoption"
          >
            <Loader2 v-if="adopting" class="mr-2 h-4 w-4 animate-spin" />
            <GitCommitHorizontal v-else class="mr-2 h-4 w-4" />
            {{ t('repository.projection.adoptConfirmAction') }}
          </Button>
        </template>
      </ProductDialogShell>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  BookOpen,
  Check,
  CloudOff,
  Copy,
  Ellipsis,
  GitCommitHorizontal,
  Link2,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
} from '@lucide/vue';
import {
  Button,
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
} from '@memoflow/ui-vue-shadcn';
import {
  AdoptKnowledgeDocumentSchema,
  KnowledgeDocumentIdSchema,
  type AdoptKnowledgeDocumentReq,
  type KnowledgeNoteProjectionClientDTO,
  type KnowledgeNoteProjectionSummaryDTO,
  type KnowledgeNoteTreeMetadataDTO,
  type KnowledgeNoteTreeNodeDTO,
  type KnowledgeRemoteBindingClientDTO,
} from '@memoflow/contracts/repository';
import { usePanelSurfaceStatus } from '../../../layouts/shell/usePanelSurfaceStatus';
import { usePanelWidth } from '../../../layouts/shell/usePanelWidth';
import type { PanelSurfaceStatus } from '../../../layouts/shell/useAppShellStore';
import { ProductDialogShell, ProductSheetSurface } from '../../../shared/components';
import { REPOSITORY_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import DocumentWorkspaceState from '../components/DocumentWorkspaceState.vue';
import DocumentWorkspaceToolbar from '../components/DocumentWorkspaceToolbar.vue';
import KnowledgeMarkdownPreview from '../components/KnowledgeMarkdownPreview.vue';
import KnowledgeNoteCatalog from '../components/KnowledgeNoteCatalog.vue';
import KnowledgeNoteContextPanel from '../components/KnowledgeNoteContextPanel.vue';

const { t, locale } = useI18n();
const router = useRouter();
const route = useRoute();
const service = useStrictInject(REPOSITORY_SERVICE_KEY, 'RepositoryService');
const { isNarrow } = usePanelWidth();

const PAGE_SIZE = 50;
const DETAIL_CACHE_LIMIT = 24;
const SEARCH_DEBOUNCE_MS = 220;
const PROJECTION_AUTO_REFRESH_MS = 1_500;

const connections = ref<KnowledgeRemoteBindingClientDTO[]>([]);
const selectedConnectionId = ref('');
const notes = ref<KnowledgeNoteProjectionSummaryDTO[]>([]);
const totalNotes = ref(0);
const repositoryTotalNotes = ref(0);
const nextCursor = ref<string | null>(null);
const treeChildren = ref<Record<string, KnowledgeNoteTreeNodeDTO[]>>({});
const expandedDirectories = ref<string[]>([]);
const loadingDirectories = ref<string[]>([]);
const treeMetadata = ref<KnowledgeNoteTreeMetadataDTO | null>(null);
const treeLoading = ref(false);
const includeHiddenDirectories = ref(false);
const selectedNoteId = ref('');
const selectedNote = ref<KnowledgeNoteProjectionClientDTO | null>(null);
const searchQuery = ref('');
const catalogOpen = ref(false);
const catalogVisible = ref(true);
const contextOpen = ref(false);
const pathCopied = ref(false);
const loadingConnections = ref(true);
const loadingNotes = ref(false);
const loadingMore = ref(false);
const loadingDetail = ref(false);
const errorMessage = ref('');
const adoptionDialogOpen = ref(false);
const adopting = ref(false);
const adoptionError = ref('');
const adoptionProposal = ref<(AdoptKnowledgeDocumentReq & { relativePath: string }) | null>(null);

const detailCache = new Map<
  string,
  { contentHash: string; note: KnowledgeNoteProjectionClientDTO }
>();
let noteLoadSequence = 0;
let detailLoadSequence = 0;
let noteListAbortController: AbortController | null = null;
let detailAbortController: AbortController | null = null;
const treeAbortControllers = new Map<string, AbortController>();
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let projectionRefreshTimer: ReturnType<typeof setTimeout> | null = null;

const surfaceStatus = computed<PanelSurfaceStatus>(() => {
  if (adopting.value) return 'busy';
  return adoptionDialogOpen.value ? 'dirty' : 'clean';
});
usePanelSurfaceStatus(surfaceStatus);

const selectedConnection = computed(
  () =>
    connections.value.find((connection) => connection.id === selectedConnectionId.value) ?? null,
);
const projectionSyncing = computed(() => {
  const state = selectedConnection.value?.projectionCheckpoint?.state;
  return state === 'Lagging' || state === 'Rebuilding';
});
const repositoryShortName = computed(() => {
  const fullName = selectedConnection.value ? repositoryDisplayName(selectedConnection.value) : '';
  const parts = fullName.split('/');
  return parts[parts.length - 1] || t('repository.projection.title');
});
const providerNeedsAttention = computed(
  () =>
    Boolean(selectedConnection.value) &&
    selectedConnection.value?.observation?.eligibility.state !== 'Ready',
);
const noteCountLabel = computed(() =>
  new Intl.NumberFormat(locale.value).format(repositoryTotalNotes.value),
);
const loadedCountLabel = computed(() =>
  t('repository.projection.loadedCount', {
    loaded: new Intl.NumberFormat(locale.value).format(notes.value.length),
    total: new Intl.NumberFormat(locale.value).format(totalNotes.value),
  }),
);

function noteQueryId(): string {
  const raw = route.query.note;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return '';
}

function normalizeLookup(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .toLocaleLowerCase();
}

function summaryFromDetail(
  note: KnowledgeNoteProjectionClientDTO,
): KnowledgeNoteProjectionSummaryDTO {
  return {
    id: note.id,
    connectionId: note.connectionId,
    knowledgeDocumentId: note.knowledgeDocumentId,
    relativePath: note.relativePath,
    title: note.title,
    contentHash: note.contentHash,
    updatedAt: note.updatedAt,
  };
}

function getCachedDetail(
  projectionId: string,
): { contentHash: string; note: KnowledgeNoteProjectionClientDTO } | undefined {
  const cached = detailCache.get(projectionId);
  if (!cached) return undefined;
  detailCache.delete(projectionId);
  detailCache.set(projectionId, cached);
  return cached;
}

function setCachedDetail(note: KnowledgeNoteProjectionClientDTO): void {
  detailCache.delete(note.id);
  detailCache.set(note.id, { contentHash: note.contentHash, note });
  while (detailCache.size > DETAIL_CACHE_LIMIT) {
    const oldestKey = detailCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    detailCache.delete(oldestKey);
  }
}

async function applyNoteQuerySelection(): Promise<void> {
  const requested = noteQueryId();
  const connectionId = selectedConnectionId.value;
  if (!requested || !connectionId) return;

  const listed = notes.value.find(
    (note) =>
      note.id === requested ||
      note.knowledgeDocumentId === requested ||
      note.relativePath === requested,
  );
  if (listed) {
    await selectNote(listed.id);
    return;
  }

  detailAbortController?.abort();
  const abortController = new AbortController();
  detailAbortController = abortController;
  const sequence = ++detailLoadSequence;
  loadingDetail.value = true;
  const result = await service.resolveKnowledgeNoteReference(
    { connectionId, reference: requested },
    { signal: abortController.signal },
  );
  if (sequence !== detailLoadSequence) return;
  if (detailAbortController === abortController) detailAbortController = null;
  loadingDetail.value = false;
  if (!result.ok || result.data.connectionId !== connectionId) {
    if (!result.ok && result.error.code !== 'NOT_FOUND') errorMessage.value = result.error.message;
    return;
  }

  selectedNoteId.value = result.data.id;
  selectedNote.value = result.data;
  setCachedDetail(result.data);
  if (!searchQuery.value.trim()) await revealTreePath(result.data.relativePath);
}

function createUuidV4(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createId(prefix: string): string {
  return `${prefix}-${createUuidV4()}`;
}

function createKnowledgeDocumentId(): AdoptKnowledgeDocumentReq['knowledgeDocumentId'] {
  return KnowledgeDocumentIdSchema.parse(`kdoc_${createUuidV4()}`);
}

function repositoryDisplayName(binding: KnowledgeRemoteBindingClientDTO): string {
  return binding.observation?.repositoryFullName ?? binding.repositoryFullNameSnapshot;
}

function repositoryDefaultBranch(binding: KnowledgeRemoteBindingClientDTO): string {
  return binding.observation?.defaultBranch ?? binding.historyFence?.defaultBranch ?? '—';
}

function providerStateLabel(binding: KnowledgeRemoteBindingClientDTO): string {
  return t(
    `repository.projection.providerStatus.${binding.observation?.eligibility.state ?? 'Unchecked'}`,
  );
}

function formatUpdatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function clearSearchTimer(): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = null;
}

function clearProjectionRefreshTimer(): void {
  if (projectionRefreshTimer) clearTimeout(projectionRefreshTimer);
  projectionRefreshTimer = null;
}

function resetTree(): void {
  for (const controller of treeAbortControllers.values()) controller.abort();
  treeAbortControllers.clear();
  treeChildren.value = {};
  expandedDirectories.value = [];
  loadingDirectories.value = [];
  treeMetadata.value = null;
  treeLoading.value = false;
}

async function loadTreeDirectory(parent: string, force = false): Promise<void> {
  const connectionId = selectedConnectionId.value;
  if (!connectionId) return;
  if (!force && treeChildren.value[parent]) return;

  treeAbortControllers.get(parent)?.abort();
  const abortController = new AbortController();
  treeAbortControllers.set(parent, abortController);
  loadingDirectories.value = [...new Set([...loadingDirectories.value, parent])];
  if (parent === '') treeLoading.value = true;
  errorMessage.value = '';

  const result = await service.listKnowledgeNoteTree(
    {
      connectionId,
      parent,
      includeHidden: includeHiddenDirectories.value,
    },
    { signal: abortController.signal },
  );
  if (treeAbortControllers.get(parent) !== abortController) return;
  treeAbortControllers.delete(parent);
  loadingDirectories.value = loadingDirectories.value.filter((path) => path !== parent);
  if (parent === '') treeLoading.value = false;

  if (!result.ok) {
    errorMessage.value = result.error.message;
    return;
  }

  treeChildren.value = {
    ...treeChildren.value,
    [parent]: result.data.nodes,
  };
  if (result.data.metadata) {
    treeMetadata.value = result.data.metadata;
    repositoryTotalNotes.value = result.data.metadata.total;
  }

  if (parent === '' && !selectedNote.value && !noteQueryId() && !searchQuery.value.trim()) {
    const firstRootNote = result.data.nodes.find((node) => node.kind === 'note');
    if (firstRootNote?.kind === 'note') await selectNote(firstRootNote.projectionId);
  }
}

async function revealTreePath(relativePath: string): Promise<void> {
  if (searchQuery.value.trim()) return;
  const segments = relativePath.split('/').filter(Boolean);
  if (segments.length <= 1) return;

  const hiddenDirectories = treeMetadata.value?.hiddenDirectories ?? [];
  const directoryPaths = segments
    .slice(0, -1)
    .map((_, index) => segments.slice(0, index + 1).join('/'));
  if (
    !includeHiddenDirectories.value &&
    directoryPaths.some(
      (path) =>
        path
          .split('/')
          .some(
            (segment) =>
              segment.startsWith('.') || segment === 'node_modules' || segment === 'generated',
          ) || hiddenDirectories.includes(path),
    )
  ) {
    return;
  }

  const directorySegments = segments.slice(0, -1);
  for (let index = 1; index <= directorySegments.length; index += 1) {
    const directory = directorySegments.slice(0, index).join('/');
    if (!expandedDirectories.value.includes(directory)) {
      expandedDirectories.value = [...expandedDirectories.value, directory];
    }
    await loadTreeDirectory(directory);
  }
}

async function toggleDirectory(relativePath: string): Promise<void> {
  if (expandedDirectories.value.includes(relativePath)) {
    expandedDirectories.value = expandedDirectories.value.filter(
      (directory) => directory !== relativePath,
    );
    return;
  }
  expandedDirectories.value = [...expandedDirectories.value, relativePath];
  await loadTreeDirectory(relativePath);
}

async function toggleHiddenDirectories(includeHidden: boolean): Promise<void> {
  includeHiddenDirectories.value = includeHidden;
  try {
    localStorage.setItem('memoflow:knowledge-tree:include-hidden', includeHidden ? '1' : '0');
  } catch {
    // Storage may be unavailable in hardened browser contexts.
  }
  resetTree();
  await loadTreeDirectory('', true);
  if (searchQuery.value.trim()) {
    await loadNotes();
    return;
  }
  if (selectedNote.value) await revealTreePath(selectedNote.value.relativePath);
}

async function loadCatalogRoot(force = false): Promise<void> {
  notes.value = [];
  totalNotes.value = 0;
  nextCursor.value = null;
  await loadTreeDirectory('', force);
  if (selectedNote.value) await revealTreePath(selectedNote.value.relativePath);
  const requested = noteQueryId();
  if (requested) await applyNoteQuerySelection();
  scheduleProjectionRefresh();
}

function scheduleProjectionRefresh(): void {
  clearProjectionRefreshTimer();
  const hasCatalogContent =
    searchQuery.value.trim().length > 0
      ? notes.value.length > 0
      : (treeChildren.value['']?.length ?? 0) > 0;
  if (!projectionSyncing.value || hasCatalogContent) {
    return;
  }
  projectionRefreshTimer = setTimeout(() => {
    projectionRefreshTimer = null;
    void refreshProjectionProgress();
  }, PROJECTION_AUTO_REFRESH_MS);
}

async function refreshProjectionProgress(): Promise<void> {
  const connectionId = selectedConnectionId.value;
  if (!connectionId) return;
  const result = await service.listKnowledgeRepositoryConnections();
  if (!result.ok) {
    scheduleProjectionRefresh();
    return;
  }
  connections.value = result.data.connections;
  if (!connections.value.some((connection) => connection.id === connectionId)) {
    await loadConnections();
    return;
  }
  if (searchQuery.value.trim()) await loadNotes();
  else await loadCatalogRoot(true);
}

async function loadConnections(): Promise<void> {
  loadingConnections.value = true;
  errorMessage.value = '';
  const result = await service.listKnowledgeRepositoryConnections();
  if (!result.ok) {
    connections.value = [];
    errorMessage.value = result.error.message;
    loadingConnections.value = false;
    return;
  }

  connections.value = result.data.connections;
  if (!connections.value.some((connection) => connection.id === selectedConnectionId.value)) {
    selectedConnectionId.value =
      connections.value.find((connection) => connection.observation?.eligibility.state === 'Ready')
        ?.id ??
      connections.value[0]?.id ??
      '';
  }
  loadingConnections.value = false;
  if (!selectedConnectionId.value) {
    noteLoadSequence += 1;
    notes.value = [];
    totalNotes.value = 0;
    repositoryTotalNotes.value = 0;
    nextCursor.value = null;
    selectedNoteId.value = '';
    selectedNote.value = null;
    loadingNotes.value = false;
    resetTree();
    return;
  }
  if (searchQuery.value.trim()) await loadNotes();
  else await loadCatalogRoot(true);
}

async function loadNotes(options: { append?: boolean } = {}): Promise<void> {
  const connectionId = selectedConnectionId.value;
  if (!connectionId) return;
  const append = options.append === true;
  const cursor = append ? (nextCursor.value ?? undefined) : undefined;
  if (append && !cursor) return;

  noteListAbortController?.abort();
  const abortController = new AbortController();
  noteListAbortController = abortController;
  const sequence = ++noteLoadSequence;
  if (append) loadingMore.value = true;
  else loadingNotes.value = true;
  errorMessage.value = '';

  const result = await service.listKnowledgeNoteProjections(
    {
      connectionId,
      query: searchQuery.value.trim() || undefined,
      cursor,
      ...(includeHiddenDirectories.value ? { includeHidden: true } : {}),
      limit: PAGE_SIZE,
    },
    { signal: abortController.signal },
  );
  if (sequence !== noteLoadSequence) return;
  if (noteListAbortController === abortController) noteListAbortController = null;
  if (!result.ok) {
    errorMessage.value = result.error.message;
    if (!append) {
      notes.value = [];
      totalNotes.value = 0;
      nextCursor.value = null;
    }
    loadingNotes.value = false;
    loadingMore.value = false;
    return;
  }

  const incoming = result.data.notes;
  if (append) {
    const existing = new Set(notes.value.map((note) => note.id));
    notes.value = [...notes.value, ...incoming.filter((note) => !existing.has(note.id))];
  } else {
    notes.value = incoming;
  }
  totalNotes.value = result.data.total;
  if (!searchQuery.value.trim()) repositoryTotalNotes.value = result.data.total;
  nextCursor.value = result.data.nextCursor;
  loadingNotes.value = false;
  loadingMore.value = false;

  const requested = noteQueryId();
  if (requested && !append) {
    const matched = notes.value.find(
      (note) =>
        note.id === requested ||
        note.knowledgeDocumentId === requested ||
        note.relativePath === requested,
    );
    if (matched) {
      await selectNote(matched.id);
    } else {
      await selectGraphNode(requested);
    }
  } else if (!append && !notes.value.some((note) => note.id === selectedNoteId.value)) {
    const first = notes.value[0];
    if (first) await selectNote(first.id);
    else {
      selectedNoteId.value = '';
      selectedNote.value = null;
    }
  } else if (!append && selectedNoteId.value) {
    const summary = notes.value.find((note) => note.id === selectedNoteId.value);
    if (summary) {
      const cached = getCachedDetail(summary.id);
      if (!cached || cached.contentHash !== summary.contentHash) {
        await selectNote(summary.id, true);
      }
    }
  }
  scheduleProjectionRefresh();
}

function loadMoreNotes(): void {
  void loadNotes({ append: true });
}

async function selectNote(projectionId: string, force = false): Promise<void> {
  if (!projectionId) return;
  selectedNoteId.value = projectionId;
  detailAbortController?.abort();
  detailAbortController = null;
  const sequence = ++detailLoadSequence;
  const summary = notes.value.find((note) => note.id === projectionId);
  const cached = getCachedDetail(projectionId);
  if (!force && cached && (!summary || cached.contentHash === summary.contentHash)) {
    selectedNote.value = cached.note;
    loadingDetail.value = false;
    return;
  }

  const abortController = new AbortController();
  detailAbortController = abortController;
  loadingDetail.value = true;
  const result = await service.getKnowledgeNoteProjection(projectionId, {
    signal: abortController.signal,
  });
  if (sequence !== detailLoadSequence) return;
  if (detailAbortController === abortController) detailAbortController = null;
  loadingDetail.value = false;
  if (!result.ok) {
    errorMessage.value = result.error.message;
    return;
  }
  selectedNote.value = result.data;
  setCachedDetail(result.data);
  if (!searchQuery.value.trim()) await revealTreePath(result.data.relativePath);
}

async function selectGraphNode(projectionId: string): Promise<void> {
  if (!projectionId) return;
  const listed = notes.value.find((note) => note.id === projectionId);
  if (listed) {
    await selectNote(listed.id);
    return;
  }

  detailAbortController?.abort();
  const abortController = new AbortController();
  detailAbortController = abortController;
  const sequence = ++detailLoadSequence;
  loadingDetail.value = true;
  const result = await service.getKnowledgeNoteProjection(projectionId, {
    signal: abortController.signal,
  });
  if (sequence !== detailLoadSequence) return;
  if (detailAbortController === abortController) detailAbortController = null;
  loadingDetail.value = false;
  if (!result.ok) {
    errorMessage.value = result.error.message;
    return;
  }
  if (result.data.connectionId !== selectedConnectionId.value) return;
  const summary = summaryFromDetail(result.data);
  notes.value = [summary, ...notes.value];
  setCachedDetail(result.data);
  selectedNoteId.value = result.data.id;
  selectedNote.value = result.data;
  if (!searchQuery.value.trim()) await revealTreePath(result.data.relativePath);
}

async function openWikiLink(target: string): Promise<void> {
  const connectionId = selectedConnectionId.value;
  if (!connectionId) return;
  const normalizedTarget = normalizeLookup(target);
  const result = await service.listKnowledgeNoteProjections({
    connectionId,
    query: target,
    ...(includeHiddenDirectories.value ? { includeHidden: true } : {}),
    limit: 25,
  });
  if (!result.ok) return;

  const matched =
    result.data.notes.find((note) => normalizeLookup(note.title) === normalizedTarget) ??
    result.data.notes.find((note) => normalizeLookup(note.relativePath) === normalizedTarget) ??
    result.data.notes.find((note) => {
      const segments = note.relativePath.split('/');
      const basename = segments[segments.length - 1] ?? note.relativePath;
      return normalizeLookup(basename) === normalizedTarget;
    }) ??
    result.data.notes[0];

  if (!matched) return;
  if (!notes.value.some((note) => note.id === matched.id)) {
    notes.value = [matched, ...notes.value];
  }
  await selectNote(matched.id);
}

async function selectFromCatalogSheet(projectionId: string): Promise<void> {
  catalogOpen.value = false;
  await selectNote(projectionId);
}

async function handleContextSelect(projectionId: string): Promise<void> {
  if (isNarrow.value) contextOpen.value = false;
  await selectGraphNode(projectionId);
}

function toggleCatalog(): void {
  if (isNarrow.value) {
    catalogOpen.value = true;
    return;
  }
  catalogVisible.value = !catalogVisible.value;
}

function selectConnection(connectionId: string): void {
  if (!connectionId || connectionId === selectedConnectionId.value) return;
  selectedConnectionId.value = connectionId;
  handleConnectionChange();
}

async function copyNotePath(): Promise<void> {
  const note = selectedNote.value;
  if (!note) return;
  try {
    await navigator.clipboard?.writeText(note.relativePath);
    pathCopied.value = true;
    window.setTimeout(() => {
      pathCopied.value = false;
    }, 1_500);
  } catch {
    pathCopied.value = false;
  }
}

function handleConnectionChange(): void {
  clearProjectionRefreshTimer();
  catalogOpen.value = false;
  contextOpen.value = false;
  selectedNoteId.value = '';
  selectedNote.value = null;
  notes.value = [];
  totalNotes.value = 0;
  repositoryTotalNotes.value = 0;
  nextCursor.value = null;
  resetTree();
  void loadCatalogRoot(true);
}

function clearSearch(): void {
  clearSearchTimer();
  if (!searchQuery.value) {
    void loadCatalogRoot();
    return;
  }
  searchQuery.value = '';
}

function openRepositorySettings(): void {
  void router.push({ path: '/settings', query: { tab: 'repository' } });
}

function openAdoptionDialog(): void {
  const note = selectedNote.value;
  if (!note || note.knowledgeDocumentId !== null) return;
  const parsed = AdoptKnowledgeDocumentSchema.safeParse({
    projectionId: note.id,
    knowledgeDocumentId: createKnowledgeDocumentId(),
    requestId: createId('adopt'),
    expectedBlobSha: note.blobSha,
  });
  if (!parsed.success) {
    adoptionError.value = parsed.error.issues[0]?.message ?? 'Invalid adoption request';
    return;
  }
  adoptionProposal.value = { ...parsed.data, relativePath: note.relativePath };
  adoptionError.value = '';
  adoptionDialogOpen.value = true;
}

function closeAdoptionDialog(): void {
  if (adopting.value) return;
  adoptionDialogOpen.value = false;
}

async function confirmAdoption(): Promise<void> {
  const proposal = adoptionProposal.value;
  if (!proposal) return;
  adopting.value = true;
  adoptionError.value = '';
  const { relativePath: _relativePath, ...request } = proposal;
  const result = await service.adoptKnowledgeDocument(request);
  if (!result.ok) {
    adoptionError.value = result.error.message;
    adopting.value = false;
    return;
  }

  adoptionDialogOpen.value = false;
  adopting.value = false;
  const selectedId = selectedNoteId.value;
  detailCache.delete(selectedId);
  if (searchQuery.value.trim()) await loadNotes();
  else await loadCatalogRoot(true);
  if (selectedId) await selectNote(selectedId, true);
}

onMounted(() => {
  try {
    includeHiddenDirectories.value =
      localStorage.getItem('memoflow:knowledge-tree:include-hidden') === '1';
  } catch {
    includeHiddenDirectories.value = false;
  }
  void loadConnections();
});

onBeforeUnmount(() => {
  noteLoadSequence += 1;
  detailLoadSequence += 1;
  noteListAbortController?.abort();
  detailAbortController?.abort();
  for (const controller of treeAbortControllers.values()) controller.abort();
  treeAbortControllers.clear();
  noteListAbortController = null;
  detailAbortController = null;
  clearSearchTimer();
  clearProjectionRefreshTimer();
});

watch(searchQuery, (query) => {
  clearSearchTimer();
  searchTimer = setTimeout(() => {
    searchTimer = null;
    if (query.trim()) void loadNotes();
    else void loadCatalogRoot();
  }, SEARCH_DEBOUNCE_MS);
});

watch(isNarrow, (narrow) => {
  if (!narrow) catalogOpen.value = false;
});

watch(selectedNote, (note) => {
  if (!note) return;
  const canonicalReference = note.knowledgeDocumentId ?? note.id;
  if (noteQueryId() === canonicalReference) return;
  void router.replace({
    query: { ...route.query, note: canonicalReference },
  });
});

watch(
  () => route.query.note,
  () => {
    void applyNoteQuerySelection();
  },
);
</script>
