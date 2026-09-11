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

    <div
      v-if="loadingConnections"
      class="grid min-h-0 flex-1 place-items-center text-sm text-muted-foreground"
      aria-busy="true"
    >
      <Loader2 class="h-5 w-5 animate-spin" />
    </div>

    <div
      v-else-if="connections.length === 0"
      class="grid min-h-0 flex-1 place-items-center overflow-auto px-6 py-10"
      data-testid="knowledge-projection-empty"
    >
      <div class="max-w-md text-center">
        <CloudOff class="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 class="mt-4 text-xl font-semibold">{{ t('repository.projection.connectTitle') }}</h1>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">
          {{ t('repository.projection.connectDescription') }}
        </p>
        <Button
          class="mt-5"
          data-testid="knowledge-projection-connect"
          @click="openRepositorySettings"
        >
          <Link2 class="mr-2 h-4 w-4" />
          {{ t('repository.projection.connectAction') }}
        </Button>
      </div>
    </div>

    <template v-else>
      <header class="flex min-w-0 flex-wrap items-center gap-3 border-b px-4 py-3">
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
            <BookOpen class="h-4 w-4 shrink-0 text-muted-foreground" />
            <h1 class="truncate text-sm font-semibold">{{ t('repository.projection.title') }}</h1>
            <Badge variant="secondary">{{ notes.length }}</Badge>
          </div>
          <p class="mt-1 truncate text-xs text-muted-foreground">
            {{ selectedConnection ? repositoryDisplayName(selectedConnection) : '' }} ·
            {{ selectedConnection ? repositoryDefaultBranch(selectedConnection) : '—' }}
            <span v-if="selectedConnection?.projectionCheckpoint?.projectedCommitSha">
              ·
              {{
                t('repository.projection.commit', {
                  sha: selectedConnection.projectionCheckpoint!.projectedCommitSha!.slice(0, 8),
                })
              }}
            </span>
          </p>
        </div>

        <select
          v-if="connections.length > 1"
          v-model="selectedConnectionId"
          class="h-8 max-w-[18rem] rounded-md border bg-background px-2 text-sm"
          :aria-label="t('repository.projection.connectionLabel')"
          data-testid="knowledge-projection-connection-select"
          @change="handleConnectionChange"
        >
          <option v-for="connection in connections" :key="connection.id" :value="connection.id">
            {{ repositoryDisplayName(connection) }}
          </option>
        </select>
        <Badge
          :variant="
            selectedConnection?.observation?.eligibility.state === 'Ready' ? 'secondary' : 'outline'
          "
        >
          {{
            selectedConnection
              ? providerStateLabel(selectedConnection)
              : t('repository.projection.providerStatus.Unchecked')
          }}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8"
          :aria-label="t('repository.projection.refresh')"
          :title="t('repository.projection.refresh')"
          :disabled="loadingNotes"
          data-testid="knowledge-projection-refresh"
          @click="loadNotes"
        >
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loadingNotes }" />
        </Button>
        <Button
          size="sm"
          :disabled="selectedConnection?.observation?.eligibility.state !== 'Ready'"
          data-testid="knowledge-projection-create"
          @click="openCreateDialog"
        >
          <FilePlus class="mr-2 h-4 w-4" />
          {{ t('repository.projection.createAction') }}
        </Button>
      </header>

      <div
        class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(14rem,38%)_minmax(0,1fr)] @3xl/panel:grid-cols-[minmax(15rem,22rem)_minmax(0,1fr)] @3xl/panel:grid-rows-1"
      >
        <aside
          class="flex min-h-0 flex-col border-b bg-sidebar @3xl/panel:border-b-0 @3xl/panel:border-r"
        >
          <div class="flex items-center gap-2 border-b p-3">
            <div class="relative min-w-0 flex-1">
              <Search
                class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                v-model="searchQuery"
                class="h-8 pl-8 pr-8"
                :placeholder="t('repository.projection.searchPlaceholder')"
                data-testid="knowledge-projection-search"
                @keyup.enter="loadNotes"
              />
              <button
                v-if="searchQuery"
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                :aria-label="t('common.clear')"
                @click="clearSearch"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </div>
            <Button
              size="icon"
              variant="secondary"
              class="h-8 w-8"
              :aria-label="t('common.search')"
              data-testid="knowledge-projection-search-submit"
              @click="loadNotes"
            >
              <Search class="h-4 w-4" />
            </Button>
          </div>

          <div class="min-h-0 flex-1 overflow-auto">
            <button
              v-for="note in notes"
              :key="note.id"
              type="button"
              class="block w-full border-b px-3 py-2.5 text-left hover:bg-accent/60"
              :class="{ 'bg-accent': selectedNote?.id === note.id }"
              :data-testid="`knowledge-projection-note-${note.id}`"
              @click="selectedNoteId = note.id"
            >
              <span class="block truncate text-sm font-medium">{{ note.title }}</span>
              <span class="mt-1 block truncate text-xs text-muted-foreground">{{
                note.relativePath
              }}</span>
              <span class="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <span>{{ indexStatusLabel(note.indexStatus) }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ note.commitSha.slice(0, 8) }}</span>
              </span>
            </button>
            <div
              v-if="!loadingNotes && notes.length === 0"
              class="grid h-32 place-items-center px-4 text-center text-sm text-muted-foreground"
            >
              {{
                searchQuery
                  ? t('repository.projection.noSearchResults')
                  : t('repository.projection.noNotes')
              }}
            </div>
            <div v-if="loadingNotes" class="grid h-32 place-items-center text-muted-foreground">
              <Loader2 class="h-4 w-4 animate-spin" />
            </div>
          </div>
        </aside>

        <main class="min-h-0 overflow-hidden">
          <div v-if="selectedNote" class="flex h-full min-h-0 flex-col">
            <div class="flex min-w-0 flex-wrap items-start gap-3 border-b px-4 py-3">
              <FileText class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div class="min-w-0 flex-1">
                <h2 class="truncate text-sm font-semibold">{{ selectedNote.title }}</h2>
                <p class="mt-1 truncate text-xs text-muted-foreground">
                  {{ selectedNote.relativePath }}
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{{ indexStatusLabel(selectedNote.indexStatus) }}</Badge>
                  <span>{{
                    t('repository.projection.commit', { sha: selectedNote.commitSha.slice(0, 8) })
                  }}</span>
                </div>
              </div>
              <div
                class="inline-flex h-8 shrink-0 items-center rounded-md border bg-muted/30 p-0.5"
                role="tablist"
                :aria-label="t('repository.projection.noteViews')"
              >
                <button
                  type="button"
                  role="tab"
                  class="flex h-7 items-center gap-1.5 rounded px-2 text-xs"
                  :class="
                    noteView === 'preview'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground'
                  "
                  :aria-selected="noteView === 'preview'"
                  data-testid="knowledge-projection-preview-tab"
                  @click="noteView = 'preview'"
                >
                  <FileText class="h-3.5 w-3.5" />
                  {{ t('repository.projection.previewTab') }}
                </button>
                <button
                  type="button"
                  role="tab"
                  class="flex h-7 items-center gap-1.5 rounded px-2 text-xs"
                  :class="
                    noteView === 'relations'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground'
                  "
                  :aria-selected="noteView === 'relations'"
                  data-testid="knowledge-projection-relations-tab"
                  @click="noteView = 'relations'"
                >
                  <Network class="h-3.5 w-3.5" />
                  {{ t('repository.projection.relationsTab') }}
                </button>
              </div>
              <Badge variant="outline">{{ t('repository.projection.readOnly') }}</Badge>
            </div>
            <div
              v-if="noteView === 'preview'"
              class="min-h-0 flex-1 overflow-y-auto"
              data-scroll-host="repository-preview"
            >
              <article
                class="preview-content mx-auto max-w-3xl px-5 py-5"
                data-testid="knowledge-projection-preview"
                v-html="renderedMarkdown"
              />
            </div>
            <KnowledgeProjectionRelationsView
              v-else
              :projection-id="selectedNote.id"
              @select="selectGraphNode"
            />
          </div>
          <div v-else class="grid h-full min-h-48 place-items-center px-6 text-center">
            <div>
              <BookOpen class="mx-auto h-8 w-8 text-muted-foreground" />
              <p class="mt-3 text-sm font-medium">{{ t('repository.projection.selectNote') }}</p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ t('repository.projection.selectNoteDescription') }}
              </p>
            </div>
          </div>
        </main>
      </div>
    </template>

    <Dialog v-model:open="createDialogOpen">
      <DialogContent class="sm:max-w-2xl" data-testid="knowledge-projection-create-dialog">
        <DialogHeader>
          <DialogTitle>{{
            stage === 'draft'
              ? t('repository.projection.createTitle')
              : t('repository.projection.confirmTitle')
          }}</DialogTitle>
          <DialogDescription>
            {{
              stage === 'draft'
                ? t('repository.projection.createDescription')
                : t('repository.projection.confirmDescription')
            }}
          </DialogDescription>
        </DialogHeader>

        <div v-if="stage === 'draft'" class="space-y-4">
          <div class="grid gap-2 @sm/panel:grid-cols-2">
            <div class="space-y-2">
              <Label for="projection-note-title">{{ t('repository.projection.noteTitle') }}</Label>
              <Input
                id="projection-note-title"
                v-model="draft.title"
                data-testid="knowledge-projection-title"
              />
            </div>
            <div class="space-y-2">
              <Label for="projection-note-path">{{ t('repository.projection.notePath') }}</Label>
              <Input
                id="projection-note-path"
                v-model="draft.proposedPath"
                placeholder="notes/example.md"
                data-testid="knowledge-projection-path"
              />
            </div>
          </div>
          <div class="space-y-2">
            <Label for="projection-note-content">{{
              t('repository.projection.noteContent')
            }}</Label>
            <Textarea
              id="projection-note-content"
              v-model="draft.content"
              rows="12"
              class="resize-y font-mono text-sm"
              data-testid="knowledge-projection-content"
            />
          </div>
          <div class="space-y-2">
            <Label for="projection-note-reason">{{ t('repository.projection.noteReason') }}</Label>
            <Input
              id="projection-note-reason"
              v-model="draft.reason"
              data-testid="knowledge-projection-reason"
            />
          </div>
        </div>

        <div v-else class="space-y-4">
          <div class="grid gap-3 rounded-md border bg-muted/20 p-3 text-sm @sm/panel:grid-cols-2">
            <div>
              <span class="text-muted-foreground">{{ t('repository.projection.noteTitle') }}</span>
              <p class="font-medium">{{ draft.title }}</p>
            </div>
            <div>
              <span class="text-muted-foreground">{{ t('repository.projection.notePath') }}</span>
              <p class="font-mono text-xs">{{ draft.proposedPath }}</p>
            </div>
            <div class="sm:col-span-2">
              <span class="text-muted-foreground">{{ t('repository.projection.noteReason') }}</span>
              <p>{{ draft.reason }}</p>
            </div>
          </div>
          <div class="max-h-72 overflow-auto rounded-md border bg-muted/10 p-4">
            <article class="preview-content" v-html="draftPreview" />
          </div>
          <p class="text-xs text-muted-foreground">
            {{ t('repository.projection.confirmImmutable') }}
          </p>
        </div>

        <p
          v-if="createError"
          class="text-sm text-destructive"
          role="alert"
          data-testid="knowledge-projection-create-error"
        >
          {{ createError }}
        </p>
        <DialogFooter>
          <Button variant="outline" :disabled="creating" @click="closeCreateDialog">{{
            t('common.cancel')
          }}</Button>
          <Button
            v-if="stage === 'review'"
            variant="outline"
            :disabled="creating"
            data-testid="knowledge-projection-edit"
            @click="editDraft"
          >
            {{ t('common.back') }}
          </Button>
          <Button
            v-if="stage === 'draft'"
            :disabled="!canReview || creating"
            data-testid="knowledge-projection-review"
            @click="reviewDraft"
          >
            <CheckCircle class="mr-2 h-4 w-4" />{{ t('repository.projection.reviewAction') }}
          </Button>
          <Button
            v-else
            :disabled="creating"
            data-testid="knowledge-projection-confirm"
            @click="confirmCreate"
          >
            <Loader2 v-if="creating" class="mr-2 h-4 w-4 animate-spin" />
            <GitCommitHorizontal v-else class="mr-2 h-4 w-4" />
            {{ t('repository.projection.confirmAction') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { usePanelSurfaceStatus } from '../../../layouts/shell/usePanelSurfaceStatus';
import type { PanelSurfaceStatus } from '../../../layouts/shell/useAppShellStore';
import {
  BookOpen,
  CheckCircle,
  CloudOff,
  FilePlus,
  FileText,
  GitCommitHorizontal,
  Link2,
  Loader2,
  Network,
  RefreshCw,
  Search,
  X,
} from '@lucide/vue';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@memoflow/ui-vue-shadcn';
import {
  CreateConfirmedKnowledgeNoteSchema,
  type CreateConfirmedKnowledgeNoteReq,
  type KnowledgeNoteProjectionClientDTO,
  type KnowledgeRemoteBindingClientDTO,
} from '@memoflow/contracts/repository';
import { renderSafeMarkdown } from '../../../shared/utils/safe-markdown';
import { REPOSITORY_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import KnowledgeProjectionRelationsView from '../components/KnowledgeProjectionRelationsView.vue';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const service = useStrictInject(REPOSITORY_SERVICE_KEY, 'RepositoryService');

const connections = ref<KnowledgeRemoteBindingClientDTO[]>([]);
const selectedConnectionId = ref('');
const notes = ref<KnowledgeNoteProjectionClientDTO[]>([]);
const selectedNoteId = ref('');

function noteQueryId(): string {
  const raw = route.query.note;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return '';
}

async function applyNoteQuerySelection(): Promise<void> {
  const requested = noteQueryId();
  if (!requested) return;
  if (selectedNoteId.value === requested) return;
  const listed = notes.value.find(
    (note) => note.id === requested || note.relativePath === requested,
  );
  if (listed) {
    selectedNoteId.value = listed.id;
    return;
  }
  await selectGraphNode(requested);
}

const noteView = ref<'preview' | 'relations'>('preview');
const searchQuery = ref('');
const loadingConnections = ref(true);
const loadingNotes = ref(false);
const errorMessage = ref('');
const createDialogOpen = ref(false);
const stage = ref<'draft' | 'review'>('draft');
const creating = ref(false);
const createError = ref('');
const proposal = ref({ proposalId: '', requestId: '', revision: 1 });
const draft = ref({ title: '', proposedPath: '', content: '', reason: '' });
const reviewedProposal = ref<{
  fingerprint: string;
  request: CreateConfirmedKnowledgeNoteReq;
} | null>(null);
let noteLoadSequence = 0;

// Phase 0 / UI-004：知识库创建确认流打开即视为未完成操作——统一离开协议
// （设置场景守卫 / Tab 切换 / 关面板）要求确认；创建提交中标记 busy 禁止离开。
// 每次求值都读取两个源，避免提前 return 清空响应式依赖。
const surfaceStatus = computed<PanelSurfaceStatus>(() => {
  const creatingNow = creating.value;
  const dialogOpen = createDialogOpen.value;
  if (creatingNow) return 'busy';
  return dialogOpen ? 'dirty' : 'clean';
});
usePanelSurfaceStatus(surfaceStatus);

const selectedConnection = computed(
  () =>
    connections.value.find((connection) => connection.id === selectedConnectionId.value) ?? null,
);
const selectedNote = computed(
  () => notes.value.find((note) => note.id === selectedNoteId.value) ?? null,
);
const renderedMarkdown = computed(() =>
  renderSafeMarkdown(selectedNote.value?.markdownContent ?? ''),
);
const draftPreview = computed(() => renderSafeMarkdown(draft.value.content));
const canReview = computed(
  () =>
    Boolean(selectedConnection.value?.id) &&
    draft.value.title.trim().length > 0 &&
    draft.value.proposedPath.trim().length > 0 &&
    draft.value.content.trim().length > 0 &&
    draft.value.reason.trim().length > 0,
);

function createId(prefix: string): string {
  const uuid =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
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

function indexStatusLabel(status: KnowledgeNoteProjectionClientDTO['indexStatus']): string {
  return t(`repository.projection.indexStatus.${status}`);
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
    selectedNoteId.value = '';
    loadingNotes.value = false;
    return;
  }
  await loadNotes();
}

async function loadNotes(): Promise<void> {
  const connectionId = selectedConnectionId.value;
  if (!connectionId) return;
  const sequence = ++noteLoadSequence;
  loadingNotes.value = true;
  errorMessage.value = '';
  const result = await service.listKnowledgeNoteProjections({
    connectionId,
    query: searchQuery.value.trim() || undefined,
    limit: 100,
  });
  if (sequence !== noteLoadSequence) return;
  if (!result.ok) {
    errorMessage.value = result.error.message;
    notes.value = [];
    loadingNotes.value = false;
    return;
  }

  notes.value = result.data.notes;
  const requested = noteQueryId();
  if (requested) {
    const matched = notes.value.find(
      (note) => note.id === requested || note.relativePath === requested,
    );
    if (matched) {
      selectedNoteId.value = matched.id;
    } else {
      loadingNotes.value = false;
      await selectGraphNode(requested);
      return;
    }
  } else if (!notes.value.some((note) => note.id === selectedNoteId.value)) {
    selectedNoteId.value = notes.value[0]?.id ?? '';
  }
  loadingNotes.value = false;
}

async function selectGraphNode(projectionId: string): Promise<void> {
  if (projectionId === selectedNoteId.value) return;
  let target = notes.value.find((note) => note.id === projectionId);
  if (!target) {
    const result = await service.getKnowledgeNoteProjection(projectionId);
    if (!result.ok) {
      errorMessage.value = result.error.message;
      return;
    }
    if (result.data.connectionId !== selectedConnectionId.value) return;
    target = result.data;
    notes.value = [target, ...notes.value];
  }
  selectedNoteId.value = target.id;
}

function handleConnectionChange(): void {
  selectedNoteId.value = '';
  void loadNotes();
}

function clearSearch(): void {
  searchQuery.value = '';
  void loadNotes();
}

function openRepositorySettings(): void {
  void router.push({ path: '/settings', query: { tab: 'repository' } });
}

function openCreateDialog(): void {
  stage.value = 'draft';
  createError.value = '';
  proposal.value = {
    proposalId: createId('proposal'),
    requestId: createId('request'),
    revision: 1,
  };
  draft.value = { title: '', proposedPath: '', content: '', reason: '' };
  reviewedProposal.value = null;
  createDialogOpen.value = true;
}

function closeCreateDialog(): void {
  if (creating.value) return;
  createDialogOpen.value = false;
}

function editDraft(): void {
  stage.value = 'draft';
  createError.value = '';
}

function reviewDraft(): void {
  createError.value = '';
  const parsed = CreateConfirmedKnowledgeNoteSchema.safeParse({
    connectionId: selectedConnectionId.value,
    proposalId: proposal.value.proposalId,
    revision: proposal.value.revision,
    requestId: proposal.value.requestId,
    proposedPath: draft.value.proposedPath,
    title: draft.value.title,
    frontmatter: {},
    content: draft.value.content,
    reason: draft.value.reason,
  });
  if (!parsed.success) {
    createError.value = parsed.error.issues[0]?.message ?? t('repository.projection.invalidDraft');
    return;
  }

  const fingerprint = JSON.stringify({
    connectionId: parsed.data.connectionId,
    proposedPath: parsed.data.proposedPath,
    title: parsed.data.title,
    frontmatter: parsed.data.frontmatter,
    content: parsed.data.content,
    reason: parsed.data.reason,
  });
  const metadata =
    reviewedProposal.value && reviewedProposal.value.fingerprint !== fingerprint
      ? {
          proposalId: proposal.value.proposalId,
          revision: proposal.value.revision + 1,
          requestId: createId('request'),
        }
      : proposal.value;

  proposal.value = metadata;
  draft.value = {
    title: parsed.data.title,
    proposedPath: parsed.data.proposedPath,
    content: parsed.data.content,
    reason: parsed.data.reason,
  };
  reviewedProposal.value = {
    fingerprint,
    request: { ...parsed.data, ...metadata },
  };
  stage.value = 'review';
}

async function confirmCreate(): Promise<void> {
  const reviewedRequest = reviewedProposal.value?.request;
  if (!reviewedRequest || stage.value !== 'review') return;
  creating.value = true;
  createError.value = '';
  const result = await service.createConfirmedKnowledgeNote(reviewedRequest);
  if (!result.ok) {
    createError.value = result.error.message;
    creating.value = false;
    return;
  }

  createDialogOpen.value = false;
  creating.value = false;
  await loadConnections();
  const created = notes.value.find((note) => note.relativePath === result.data.relativePath);
  if (created) selectedNoteId.value = created.id;
}

onMounted(() => {
  void loadConnections();
});

watch(
  () => route.query.note,
  () => {
    void applyNoteQuerySelection();
  },
);
</script>

<style scoped>
.preview-content :deep(pre) {
  overflow-x: auto;
  border-radius: 0.375rem;
  background: hsl(var(--muted));
  padding: 0.75rem;
}

.preview-content :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.875em;
}

.preview-content :deep(.internal-link) {
  color: hsl(var(--primary));
}

.preview-content :deep(.callout) {
  margin: 1rem 0;
  border-left: 3px solid hsl(var(--primary));
  border-radius: 0.25rem;
  background: hsl(var(--muted) / 0.45);
  padding: 0.75rem 1rem;
}

.preview-content :deep(.callout-title) {
  display: inline-block;
  margin-bottom: 0.35rem;
  font-weight: 600;
}

.preview-content :deep(mark) {
  border-radius: 0.125rem;
  background: hsl(var(--accent));
  padding: 0 0.125rem;
}

.preview-content :deep(.vault-embed) {
  border-bottom: 1px dashed hsl(var(--primary) / 0.7);
}

.preview-content :deep(.contains-task-list) {
  list-style: none;
  padding-left: 1.25rem;
}

.preview-content :deep(.task-list-item) {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
}

.preview-content :deep(.task-list-item-checkbox) {
  flex: 0 0 auto;
}
</style>
