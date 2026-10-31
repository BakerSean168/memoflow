<script setup lang="ts">
/**
 * ConversationSidebar (UI 重构 V2 壳)
 *
 * 左侧栏 = 纯 AI 会话列表（V2 §5 决策 #4，无 Projects 树、无业务对象）。
 * 结构：搜索 + 新对话同排 → 会话列表（按时间分组）→ 底部账户菜单。
 *
 * 账户入口（诊断修订 §9）：头像打开账户菜单，不再直达 Settings。
 *
 * 会话行交互按 T3 Code 源码对齐（pingdotgg/t3code @ 15fe2832，#767）：
 * - 行尾只有一个槽位：默认只显示状态；悬浮（仅 any-hover 设备）或键盘聚焦时，
 *   同一槽位淡入唯一的主操作（归档 / 恢复）。参考 SidebarThreadRow.tsx。
 * - 更多操作走右键菜单（ContextMenu 键、Shift+F10 也能打开），参考
 *   threadActionMenu.logic.ts 与 Sidebar.tsx handleThreadContextMenu。
 * - 多选没有“选择模式”：Ctrl/⌘+点击切换、Shift+点击范围选，Esc 清空；在选中行上
 *   右键得到带数量的批量菜单。参考 Sidebar.tsx handleThreadClick /
 *   handleMultiSelectContextMenu 与 threadSelectionStore.ts。
 */
import { vKeyboardList } from '../../shared/keyboard/list-adapter';
import { computed, inject, nextTick, ref, watch } from 'vue';
import {
  ConversationSelectionKey,
  createConversationSelectionStore,
} from './conversation-selection';
import { useI18n } from 'vue-i18n';
import {
  Archive,
  ArchiveRestore,
  Search,
  SquarePen,
  Trash2,
  X,
  Check,
  LockKeyhole,
  CircleAlert,
  CircleCheck,
  MessageCircleQuestion,
  ShieldAlert,
  LoaderCircle,
} from '@lucide/vue';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuTrigger,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@memoflow/ui-vue-shadcn';
import type { ProfileSummary, ProfileCloudState } from '@memoflow/desktop-contracts';
import type {
  ConversationAttentionStatus,
  ConversationAttentionMap,
} from '@memoflow/ai-ui/composables/useConversationAttention';

interface ConversationEntry {
  id: string;
  title: string;
}

interface ConversationGroup {
  /** 分组 i18n key（如 'shell.conversation.today'）。 */
  labelKey: string;
  items: ConversationEntry[];
}

const props = defineProps<{
  bulkAction?: (
    action: 'archive' | 'restore' | 'delete',
    ids: string[],
  ) => Promise<{ id: string; success: boolean }[]>;
  profiles?: ProfileSummary[];
  activeProfileId?: string;
  cloudState?: ProfileCloudState;
  groups: ConversationGroup[];
  archivedConversations?: ConversationEntry[];
  archivePage?: number;
  archiveHasMore?: boolean;
  conversationStatuses?: ConversationAttentionMap;
  titleBusy?: Record<string, boolean>;
  activeConversationId: string | null;
  userName?: string;
  /** 当前壳层展示的是哪一种身份，而不是含混的“是否登录”。 */
  identityKind?: 'guest' | 'registered-local' | 'cloud';
  /** 云端会话是否可用；只影响同步账号动作，不影响本地身份。 */
  cloudConnected?: boolean;
  /** 会话列表加载中。 */
  loading?: boolean;
  /** 桌面端顶部留出拖拽/窗控空间的高度补偿。 */
  isDesktop?: boolean;
}>();

const emit = defineEmits<{
  (e: 'rename-conversation', id: string, name: string): void;
  (e: 'regenerate-title', id: string): void;
  (e: 'new-conversation'): void;
  (e: 'select-conversation', id: string): void;
  (e: 'delete-conversation', id: string): void;
  (e: 'archive-conversation', id: string): void;
  (e: 'restore-conversation', id: string): void;
  (e: 'change-archive-page', direction: number): void;
  (e: 'refresh-conversations'): void;
  (e: 'open-settings'): void;
  (e: 'open-cloud-connection'): void;
  (e: 'logout'): void;
  (e: 'manage-profiles', trigger: HTMLButtonElement | null): void;
  (e: 'switch-profile', profileId: string): void;
  (e: 'refresh-profiles'): void;
}>();

const { t } = useI18n();
const editingId = ref<string | null>(null);
const titleDraft = ref('');
const titleInput = ref<HTMLInputElement | null>(null);
async function editTitle(item: ConversationEntry, fromMenu = false) {
  editingId.value = item.id;
  titleDraft.value = item.title;
  if (fromMenu) return;
  await nextTick();
  titleInput.value?.focus();
  titleInput.value?.select();
}
async function focusTitleInput(event: Event) {
  if (!editingId.value) return;
  event.preventDefault();
  // Reka's modal focus trap has unmounted at close-auto-focus, so the editor can receive focus.
  await nextTick();
  titleInput.value?.focus();
  titleInput.value?.select();
}
function saveTitle() {
  const id = editingId.value;
  const name = titleDraft.value.trim();
  if (!id || !name) return;
  editingId.value = null;
  emit('rename-conversation', id, name);
}
watch(
  () => props.activeProfileId,
  () => {
    editingId.value = null;
  },
);

const stateIcons = {
  failed: CircleAlert,
  input: MessageCircleQuestion,
  approval: ShieldAlert,
  working: LoaderCircle,
  done: CircleCheck,
} as const;
const stateColors: Record<ConversationAttentionStatus, string> = {
  failed: 'text-[#F87171]',
  input: 'text-[#A5B4FC]',
  approval: 'text-[#FBBF24]',
  working: 'text-[#7DD3FC]',
  done: 'text-[#6EE7B7]',
};
function stateOf(id: string): ConversationAttentionStatus | undefined {
  return props.conversationStatuses?.[id];
}

const accountMenuTrigger = ref<HTMLButtonElement | null>(null);
// In a nested dropdown Reka can defer focus restoration until after the
// submenu has unmounted. Own the return-to-trigger on the root close event.
async function restoreAccountMenuFocus(event: Event): Promise<void> {
  if (!accountMenuTrigger.value?.isConnected) return;
  event.preventDefault();
  await nextTick();
  accountMenuTrigger.value?.focus({ preventScroll: true });
}

const showingArchive = ref(false);
const searchOpen = ref(false);
const searchQuery = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const searchToggle = ref<HTMLButtonElement | null>(null);
const selection = inject(ConversationSelectionKey, null) ?? createConversationSelectionStore();
const { selectedIds } = selection;
const contextIds = ref<string[]>([]);
const contextOpen = ref(false);
const contextRow = ref<string | null>(null);
const sidebarRoot = ref<HTMLElement | null>(null);

const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLocaleLowerCase());
const filteredGroups = computed(() => {
  const groups = showingArchive.value
    ? [
        {
          labelKey: 'shell.conversation.archived',
          items: props.archivedConversations ?? [],
        },
      ]
    : props.groups;
  if (!normalizedSearchQuery.value) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.title.toLocaleLowerCase().includes(normalizedSearchQuery.value),
      ),
    }))
    .filter((group) => group.items.length > 0);
});
const visibleIds = computed(() =>
  filteredGroups.value.flatMap((group) => group.items.map((item) => item.id)),
);
watch(
  [visibleIds, () => props.activeProfileId],
  ([ids, profileId]) => {
    selection.reconcile(ids, profileId ?? '');
    contextOpen.value = false;
  },
  { immediate: true, flush: 'sync' },
);
const keyboardSelection = {
  hasSelection: () => selectedIds.value.length > 0,
  toggle: selection.toggle,
  focus: selection.focus,
  rangeTo: selection.rangeTo,
  clear: selection.clear,
};
function exitSelection() {
  selection.clear();
}
/** 运行中 / 等待输入 / 等待审批的会话不能归档（与 useAIChatSession 的阻断规则一致）。 */
function archiveBlocked(id: string): boolean {
  return ['working', 'input', 'approval'].includes(stateOf(id) ?? '');
}
/** 行尾槽位的唯一主操作：活跃视图归档，归档视图恢复；被阻断时不出现，保留状态图标。 */
function hasRowAction(id: string): boolean {
  return showingArchive.value || !archiveBlocked(id);
}
function runRowAction(id: string) {
  if (selection.state.busy) return;
  if (showingArchive.value) emit('restore-conversation', id);
  else if (!archiveBlocked(id)) emit('archive-conversation', id);
}
function selectRow(id: string, event: MouseEvent) {
  if (selection.state.busy) return;
  const multi = event.ctrlKey || event.metaKey || event.shiftKey;
  selection.click(id, {
    toggle: event.ctrlKey || event.metaKey,
    range: event.shiftKey,
  });
  if (!multi) {
    if (showingArchive.value) emit('restore-conversation', id);
    else emit('select-conversation', id);
  }
}
function openContext(id: string) {
  contextRow.value = id;
  contextIds.value = selection.isSelected(id) ? [...selectedIds.value] : [id];
  contextOpen.value = true;
}
function handleContextKey(event: KeyboardEvent, item: ConversationEntry) {
  if (editingId.value === item.id) return;
  if (event.key === 'F2' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (selection.state.busy) return;
    event.preventDefault();
    void editTitle(item);
    return;
  }
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
  event.preventDefault();
  openContext(item.id);
}
/**
 * 右键菜单（单个 / 批量）统一走批量路径：结果提示、失败保留选择、删除确认、Ctrl+Z 撤销都沿用。
 * 单个会话时菜单不显示数量（T3 Code buildThreadActionMenuItems 同款），多选时显示。
 */
function contextStatusAction() {
  void emitBulk(showingArchive.value ? 'restore' : 'archive', [...contextIds.value]);
}
function contextDeleteAction() {
  void emitBulk('delete', [...contextIds.value]);
}
const contextStatusDisabled = computed(
  () =>
    selection.state.busy ||
    (!showingArchive.value &&
      contextIds.value.length === 1 &&
      archiveBlocked(contextIds.value[0]!)),
);
async function restoreContextFocus(event: Event) {
  if (editingId.value) {
    await focusTitleInput(event);
    return;
  }
  const id = contextRow.value;
  event.preventDefault();
  await nextTick();
  if (contextOpen.value || contextRow.value !== id) return;
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active !== document.body &&
    active.isConnected &&
    !active.closest('[role="menu"]')
  )
    return;
  const row = [
    ...(sidebarRoot.value?.querySelectorAll<HTMLElement>('[data-keyboard-item]') ?? []),
  ].find((item) => item.dataset.keyboardItem === id);
  row?.focus({ preventScroll: true });
}
async function emitBulk(action: 'archive' | 'restore' | 'delete', ids = [...selectedIds.value]) {
  if (!ids.length || selection.state.busy) return;
  contextOpen.value = false;
  if (!props.bulkAction) return;
  const operation = selection.startOperation();
  if (!operation) return;
  const titles = new Map(
    filteredGroups.value.flatMap((group) => group.items.map((item) => [item.id, item.title])),
  );
  try {
    const results = await props.bulkAction(action, ids);
    if (!selection.isOperationCurrent(operation)) return;
    selection.state.results = results.map((result) => ({
      ...result,
      title: titles.get(result.id) ?? result.id,
      action,
    }));
    selection.complete(results.filter((item) => item.success).map((item) => item.id));
    for (const item of results.filter((item) => !item.success)) {
      if (visibleIds.value.includes(item.id) && !selection.isSelected(item.id))
        selection.toggle(item.id);
    }
  } catch {
    if (selection.isOperationCurrent(operation)) {
      selection.state.results = ids.map((id) => ({
        id,
        title: titles.get(id) ?? id,
        success: false,
        action,
      }));
      for (const id of ids) {
        if (visibleIds.value.includes(id) && !selection.isSelected(id)) selection.toggle(id);
      }
    }
  } finally {
    selection.finishOperation(operation);
  }
}

async function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (!searchOpen.value) {
    searchQuery.value = '';
    return;
  }
  await nextTick();
  searchInput.value?.focus();
}

async function closeSearch() {
  searchOpen.value = false;
  searchQuery.value = '';
  await nextTick();
  searchToggle.value?.focus();
}

const orderedProfiles = computed(() =>
  [...(props.profiles ?? [])].sort(
    (a, b) =>
      Number(b.profileId === props.activeProfileId) -
        Number(a.profileId === props.activeProfileId) || b.lastActiveAt - a.lastActiveAt,
  ),
);
const displayName = () => props.userName || t('shell.guest');

function profileLabel(profile: ProfileSummary): string {
  return [
    profile.displayName,
    profile.identifierHint || profile.profileId,
    t(
      profile.profileKind === 'guest'
        ? 'auth.profileAccess.guest'
        : 'auth.profileAccess.registered',
    ),
    profile.hasPin ? t('auth.profileAccess.unlock') : '',
    profile.profileId === props.activeProfileId ? t('shell.account.currentProfile') : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const identityLabel = () => {
  if (props.identityKind === 'cloud') return t('shell.account.signedIn');
  if (props.identityKind === 'registered-local') return t('shell.account.localProfile');
  return t('shell.account.guestIdentity');
};
</script>

<template>
  <aside
    ref="sidebarRoot"
    data-testid="conversation-sidebar"
    class="conversation-sidebar relative flex h-full min-w-0 flex-col bg-transparent text-sidebar-foreground"
    @keydown.escape="exitSelection"
  >
    <!-- 搜索与新会话保持同一工具行，搜索展开时高度不变 -->
    <div class="flex h-11 shrink-0 items-center gap-1.5 px-2" data-testid="conversation-toolbar">
      <div
        class="flex h-8 min-w-0 flex-1 items-center rounded-md bg-[hsl(var(--surface-raised)/0.35)] transition-colors hover:bg-[hsl(var(--hover))]"
        data-testid="conversation-search"
      >
        <button
          ref="searchToggle"
          type="button"
          class="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] text-[hsl(var(--foreground-subtle))] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="searchOpen ? 'w-8 shrink-0 justify-center p-0' : 'w-full flex-1'"
          :title="t('shell.search')"
          :aria-label="t('shell.search')"
          :aria-pressed="searchOpen"
          data-testid="conversation-search-toggle"
          @click="toggleSearch"
        >
          <Search class="h-4 w-4 shrink-0" />
          <span v-if="!searchOpen" class="min-w-0 truncate">{{
            t('shell.conversation.searchPlaceholder')
          }}</span>
        </button>
        <template v-if="searchOpen">
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="search"
            autocomplete="off"
            class="h-8 min-w-0 flex-1 border-0 bg-transparent pr-1 text-xs text-foreground outline-none placeholder:text-muted-foreground/55 focus-visible:outline-none"
            :placeholder="t('shell.conversation.searchPlaceholder')"
            :aria-label="t('shell.conversation.searchPlaceholder')"
            data-testid="conversation-search-input"
            @keydown.escape.stop.prevent="closeSearch"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="t('shell.conversation.clearSearch')"
            :title="t('shell.conversation.clearSearch')"
            data-testid="conversation-search-clear"
            @click="searchQuery = ''"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </template>
      </div>
      <button
        type="button"
        data-testid="conversation-archive-toggle"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[hsl(var(--hover))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :class="
          showingArchive
            ? 'bg-[hsl(var(--selected)/0.82)] text-foreground'
            : 'text-[hsl(var(--foreground-subtle))]'
        "
        :aria-label="t('shell.conversation.archived')"
        :title="t(showingArchive ? 'shell.conversation.active' : 'shell.conversation.archived')"
        :aria-pressed="showingArchive"
        @click="
          showingArchive = !showingArchive;
          exitSelection();
          emit('refresh-conversations');
        "
      >
        <Archive class="h-4 w-4" />
      </button>
      <button
        type="button"
        data-testid="shell-new-conversation"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[hsl(var(--foreground-subtle))] transition-colors hover:bg-[hsl(var(--hover))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="t('shell.newChat')"
        :title="t('shell.newChat')"
        @click="emit('new-conversation')"
      >
        <SquarePen class="h-4 w-4" />
      </button>
    </div>

    <!-- 多选没有常驻工具栏（T3 Code 同款）：数量只给读屏播报，操作在右键菜单里。 -->
    <span class="sr-only" aria-live="polite" data-testid="conversation-selection-count">{{
      selectedIds.length ? t('shell.conversation.selectedCount', { count: selectedIds.length }) : ''
    }}</span>
    <ul
      v-if="selection.state.results.length"
      class="max-h-28 overflow-y-auto break-words px-3 text-xs"
      aria-live="polite"
      data-testid="conversation-bulk-results"
    >
      <li
        v-for="result in selection.state.results"
        :key="result.id"
        :class="result.success ? '' : 'text-destructive'"
      >
        {{ result.title }} · {{ t(`shell.conversation.${result.action}`) }} ·
        {{
          t(
            result.success
              ? 'shell.conversation.operationSucceeded'
              : 'shell.conversation.operationFailed',
          )
        }}
      </li>
    </ul>
    <!-- 会话列表（按时间分组） -->
    <nav
      v-keyboard-list="{ selectable: true, selection: keyboardSelection }"
      class="flex-1 overflow-y-auto px-2 pb-3 pt-1"
      role="listbox"
      aria-multiselectable="true"
      :aria-busy="selection.state.busy ? true : undefined"
      :aria-label="t('shell.conversation.select')"
      @click="
        (event) => {
          if (!(event.target as HTMLElement).closest('button')) exitSelection();
        }
      "
    >
      <p v-if="loading && groups.length === 0" class="px-3 py-2 text-xs text-muted-foreground/60">
        {{ t('common.loading') }}
      </p>
      <p
        v-if="searchOpen && normalizedSearchQuery && filteredGroups.length === 0"
        class="px-2.5 py-6 text-center text-xs leading-5 text-muted-foreground/65"
        data-testid="conversation-search-empty"
      >
        {{ t('shell.conversation.noMatches') }}
      </p>
      <div v-for="group in filteredGroups" :key="group.labelKey" class="mb-2.5">
        <p
          class="px-2 pb-1 pt-2 text-[10px] font-medium tracking-[0.025em] text-[hsl(var(--foreground-subtle))]"
        >
          {{ t(group.labelKey) }}
        </p>
        <ContextMenu
          v-for="item in group.items"
          :key="item.id"
          :open="contextOpen && contextRow === item.id"
          @update:open="
            (open) => {
              if (!open) contextOpen = false;
            }
          "
        >
          <ContextMenuTrigger
            as-child
            @contextmenu.capture="openContext(item.id)"
            @keydown="handleContextKey($event, item)"
          >
            <!--
              T3 Code SidebarThreadRow：行是 group，行尾一个固定槽位。默认只显示状态；
              悬浮（仅 any-hover 设备）或键盘聚焦时状态淡出，同一槽位淡入唯一主操作。
            -->
            <div
              class="group/item relative flex w-full items-center rounded-md transition-colors"
              :data-testid="'conversation-row'"
              :data-has-action="hasRowAction(item.id) ? 'true' : undefined"
              :class="
                selection.isSelected(item.id) || activeConversationId === item.id
                  ? 'bg-[hsl(var(--selected)/0.82)] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.46)]'
                  : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--hover))] hover:text-foreground'
              "
            >
              <input
                v-if="editingId === item.id"
                :ref="(element) => (titleInput = element as HTMLInputElement | null)"
                v-model="titleDraft"
                class="m-1 min-w-0 flex-1 rounded border bg-background px-1.5 py-1 text-xs"
                data-testid="conversation-title-input"
                maxlength="80"
                :aria-label="t('shell.conversation.rename')"
                @keydown.enter.prevent="saveTitle"
                @keydown.esc.stop.prevent="editingId = null"
                @blur="editingId = null"
                @click.stop
              />
              <button
                v-else
                type="button"
                @dblclick.stop="!selection.state.busy && editTitle(item)"
                class="min-w-0 w-full flex-1 px-2 py-1.5 text-left text-[12.5px] leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                :class="stateOf(item.id) || hasRowAction(item.id) ? 'pr-9' : 'pr-2'"
                :data-keyboard-item="item.id"
                role="option"
                :aria-selected="selection.isSelected(item.id)"
                @click="selectRow(item.id, $event)"
              >
                <span class="block min-w-0 truncate whitespace-nowrap"
                  ><LoaderCircle
                    v-if="titleBusy?.[item.id]"
                    class="mr-1 inline h-3 w-3 animate-spin"
                    aria-hidden="true"
                  />{{ item.title }}</span
                >
                <span v-if="titleBusy?.[item.id]" class="sr-only" role="status">{{
                  t('shell.conversation.generatingTitle')
                }}</span>
              </button>
              <div
                v-if="editingId !== item.id && (stateOf(item.id) || hasRowAction(item.id))"
                class="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                data-testid="conversation-row-slot"
              >
                <TooltipProvider v-if="stateOf(item.id)">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <button
                        type="button"
                        class="flex h-6 w-6 items-center justify-center rounded-md transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        :class="
                          hasRowAction(item.id)
                            ? 'group-any-hover/item:pointer-events-none group-any-hover/item:opacity-0 group-has-[:focus-visible]/item:pointer-events-none group-has-[:focus-visible]/item:opacity-0'
                            : ''
                        "
                        :aria-label="
                          t(`aiAssistant.chatPage.sidebar.attention.${stateOf(item.id)}`)
                        "
                        data-testid="shell-conversation-status"
                        @click.stop="emit('select-conversation', item.id)"
                      >
                        <component
                          :is="stateIcons[stateOf(item.id)!]"
                          class="h-4 w-4 shrink-0"
                          :class="stateColors[stateOf(item.id)!]"
                          aria-hidden="true"
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" class="text-xs">
                      {{ t(`aiAssistant.chatPage.sidebar.attention.${stateOf(item.id)}`) }}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider v-if="hasRowAction(item.id)">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <button
                        type="button"
                        :data-testid="
                          showingArchive ? 'conversation-restore' : 'conversation-archive'
                        "
                        class="pointer-events-none absolute inset-0 flex h-6 w-6 items-center justify-center rounded-md text-[hsl(var(--foreground-subtle))] opacity-0 transition-opacity duration-150 hover:bg-[hsl(var(--hover))] hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-any-hover/item:pointer-events-auto group-any-hover/item:opacity-100 group-has-[:focus-visible]/item:pointer-events-auto group-has-[:focus-visible]/item:opacity-100 disabled:opacity-40"
                        :aria-label="
                          t(
                            showingArchive
                              ? 'shell.conversation.restore'
                              : 'shell.conversation.archive',
                          )
                        "
                        :disabled="selection.state.busy"
                        @click.stop="runRowAction(item.id)"
                      >
                        <component
                          :is="showingArchive ? ArchiveRestore : Archive"
                          class="h-3.5 w-3.5"
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" class="text-xs">
                      {{
                        t(
                          showingArchive
                            ? 'shell.conversation.restore'
                            : 'shell.conversation.archive',
                        )
                      }}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-44" @close-auto-focus="restoreContextFocus">
            <template v-if="contextIds.length === 1">
              <ContextMenuItem
                data-testid="conversation-context-rename"
                :disabled="selection.state.busy"
                @select="editTitle(item, true)"
              >
                {{ t('shell.conversation.rename') }}
                <span class="ml-auto pl-3 text-[11px] text-muted-foreground" aria-hidden="true"
                  >F2</span
                >
              </ContextMenuItem>
              <ContextMenuItem
                data-testid="conversation-context-regenerate"
                :disabled="selection.state.busy || titleBusy?.[item.id]"
                @select="emit('regenerate-title', item.id)"
              >
                {{
                  t(
                    titleBusy?.[item.id]
                      ? 'shell.conversation.generatingTitle'
                      : 'shell.conversation.regenerateTitle',
                  )
                }}
              </ContextMenuItem>
              <ContextMenuSeparator />
            </template>
            <ContextMenuItem
              :disabled="contextStatusDisabled"
              data-testid="conversation-context-status"
              @select="contextStatusAction"
            >
              <component
                :is="showingArchive ? ArchiveRestore : Archive"
                class="mr-2 h-3.5 w-3.5"
                aria-hidden="true"
              />
              {{ t(showingArchive ? 'shell.conversation.restore' : 'shell.conversation.archive')
              }}<template v-if="contextIds.length > 1"> ({{ contextIds.length }})</template>
            </ContextMenuItem>
            <ContextMenuItem
              :disabled="selection.state.busy"
              class="text-destructive focus:text-destructive"
              data-testid="conversation-context-delete"
              @select="contextDeleteAction"
            >
              <Trash2 class="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              {{ t('common.delete')
              }}<template v-if="contextIds.length > 1"> ({{ contextIds.length }})</template>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
      <div v-if="showingArchive" class="flex items-center justify-between gap-2 px-2 py-2 text-xs">
        <button
          type="button"
          :disabled="(archivePage ?? 1) <= 1 || loading"
          @click="emit('change-archive-page', -1)"
        >
          {{ t('shell.conversation.previousPage') }}
        </button>
        <button
          type="button"
          :disabled="!archiveHasMore || loading"
          @click="emit('change-archive-page', 1)"
        >
          {{ t('shell.conversation.nextPage') }}
        </button>
      </div>
    </nav>

    <!-- 底：账户菜单 -->
    <div class="flex h-11 shrink-0 items-center border-t border-[hsl(var(--border-subtle))] px-2.5">
      <DropdownMenu
        @update:open="
          (open) => {
            if (open && isDesktop) emit('refresh-profiles');
          }
        "
      >
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            ref="accountMenuTrigger"
            data-testid="shell-account-menu"
            class="flex h-8 w-full min-w-0 items-center justify-start gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-[hsl(var(--hover))] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            :title="t('shell.account.menu')"
          >
            <span
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/90 text-[10px] font-semibold text-primary-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.18)]"
            >
              {{ displayName().slice(0, 1).toUpperCase() }}
            </span>
            <span
              data-testid="shell-account-name"
              class="min-w-0 truncate text-[11.5px] font-medium"
              >{{ displayName() }}</span
            >
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          class="w-52"
          @close-auto-focus="restoreAccountMenuFocus"
        >
          <div class="flex items-center gap-2 px-2 py-1.5" data-testid="shell-account-identity">
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
              aria-hidden="true"
              >{{ displayName().slice(0, 2).toUpperCase() }}</span
            >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ displayName() }}</p>
              <p class="text-[11px] text-muted-foreground">
                {{ identityLabel() }}
              </p>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="shell-open-settings" @select="emit('open-settings')">
            {{ t('shell.account.settings') }}
          </DropdownMenuItem>
          <DropdownMenuSub v-if="isDesktop">
            <DropdownMenuSubTrigger data-testid="shell-switch-account">
              {{ t('shell.account.switchAccount') }}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              data-testid="shell-profile-switcher"
              class="w-72 max-w-[calc(100vw-1rem)]"
              :collision-padding="8"
              :avoid-collisions="true"
            >
              <div class="max-h-[min(60vh,24rem)] overflow-y-auto" data-testid="shell-profile-list">
                <DropdownMenuItem
                  v-for="profile in orderedProfiles"
                  :key="profile.profileId"
                  :data-testid="`shell-switch-profile-${profile.profileId}`"
                  :aria-label="profileLabel(profile)"
                  :aria-current="profile.profileId === activeProfileId ? 'true' : undefined"
                  @select="
                    profile.profileId !== activeProfileId &&
                    emit('switch-profile', profile.profileId)
                  "
                >
                  <span
                    class="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs"
                    aria-hidden="true"
                  >
                    {{ profile.displayName.slice(0, 2).toUpperCase() }}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate" :title="profile.displayName">{{
                      profile.displayName
                    }}</span>
                    <small class="block truncate text-muted-foreground">
                      {{
                        profile.profileKind === 'guest'
                          ? t('auth.profileAccess.guest')
                          : t('auth.profileAccess.registered')
                      }}
                      · {{ profile.identifierHint || profile.profileId }} ·
                      {{
                        profile.profileId === activeProfileId && cloudState
                          ? t('shell.account.connection.' + cloudState)
                          : t('shell.account.connection.unknown')
                      }}
                    </small>
                  </span>
                  <LockKeyhole
                    v-if="profile.hasPin"
                    class="ml-1 h-3 w-3 shrink-0"
                    :aria-label="t('auth.profileAccess.unlock')"
                  />
                  <Check
                    v-if="profile.profileId === activeProfileId"
                    class="ml-1 h-3 w-3 shrink-0"
                    :aria-label="t('shell.account.currentProfile')"
                  />
                </DropdownMenuItem>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="shell-manage-profiles"
                @select="emit('manage-profiles', accountMenuTrigger)"
              >
                {{ t('shell.account.manageProfiles') }}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            v-if="cloudConnected"
            data-testid="shell-logout"
            class="text-destructive focus:text-destructive"
            @click="emit('logout')"
          >
            {{ t('shell.account.logout') }}
          </DropdownMenuItem>
          <DropdownMenuItem
            v-else
            data-testid="shell-open-cloud-connection"
            @click="emit('open-cloud-connection')"
          >
            {{
              identityKind === 'registered-local'
                ? t('shell.account.reauthenticate')
                : t('shell.account.connectCloud')
            }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </aside>
</template>
