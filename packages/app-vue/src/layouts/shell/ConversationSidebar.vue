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
import { computed, inject, nextTick, onUnmounted, ref, watch } from 'vue';
import {
  ConversationSelectionKey,
  createConversationSelectionStore,
} from './conversation-selection';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  ChevronDown,
  Cloud,
  LogOut,
  Search,
  Settings,
  SquarePen,
  Trash2,
  UserPen,
  UserPlus,
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
import { useAccountAvatar, useAccountStore } from '@memoflow/account-ui';
import { PROFILE_EDITOR_INTENT_KEY } from '../../di/keys';
import type {
  ConversationAttentionStatus,
  ConversationAttentionMap,
} from '@memoflow/ai-ui/composables/useConversationAttention';

interface ConversationEntry {
  id: string;
  title: string;
}

/** 批量动作：单删、批删、归档、恢复共用同一条结果反馈通路。 */
type BulkAction = 'archive' | 'restore' | 'delete';

interface ConversationGroup {
  /** 分组 i18n key（如 'shell.conversation.today'）。 */
  labelKey: string;
  items: ConversationEntry[];
}

/** 归档分区条目：标题之外带一个已格式化的时间，避免侧栏重复时间规则。 */
export interface ArchivedConversationEntry extends ConversationEntry {
  time: string;
}

const props = defineProps<{
  bulkAction?: (action: BulkAction, ids: string[]) => Promise<{ id: string; success: boolean }[]>;
  profiles?: ProfileSummary[];
  activeProfileId?: string;
  cloudState?: ProfileCloudState;
  groups: ConversationGroup[];
  /** 已归档会话投影（与设置页共用同一份数据通路）。 */
  archivedConversations?: ArchivedConversationEntry[];
  archivePage?: number;
  archiveHasMore?: boolean;
  conversationStatuses?: ConversationAttentionMap;
  titleBusy?: Record<string, boolean>;
  activeConversationId: string | null;
  userName?: string;
  /** 云账户邮箱（本地账户没有）；账户块与个人卡片的小字行共用。 */
  accountEmail?: string | null;
  /** 当前壳层展示的是哪一种身份，而不是含混的“是否登录”。 */
  identityKind?: 'local' | 'registered-local' | 'cloud';
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
  (e: 'add-account'): void;
  (e: 'switch-profile', profileId: string): void;
  (e: 'refresh-profiles'): void;
}>();

const { t } = useI18n();
/** 卸载后的迟到结果不再弹出提示（切换 Profile 会让旧侧栏实例的批量操作过期）。 */
const sidebarAlive = ref(true);
onUnmounted(() => {
  sidebarAlive.value = false;
});
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

const searchOpen = ref(false);
const searchQuery = ref('');
/** 归档分区与置顶/会话列表一样是独立分区，默认收起，展开状态只属于本侧栏。 */
const archivedOpen = ref(false);
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
  const groups = props.groups;
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
  return !archiveBlocked(id);
}
function runRowAction(id: string) {
  if (selection.state.busy) return;
  if (!archiveBlocked(id)) emit('archive-conversation', id);
}
/**
 * 归档分区的恢复走批量结果通路（#831 的 toast/重试），没有 bulkAction 时退回 #830 的事件。
 */
function restoreArchived(id: string) {
  if (props.bulkAction) void emitBulk('restore', [id]);
  else emit('restore-conversation', id);
}
function selectRow(id: string, event: MouseEvent) {
  if (selection.state.busy) return;
  const multi = event.ctrlKey || event.metaKey || event.shiftKey;
  selection.click(id, {
    toggle: event.ctrlKey || event.metaKey,
    range: event.shiftKey,
  });
  if (!multi) {
    emit('select-conversation', id);
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
  void emitBulk('archive', [...contextIds.value]);
}
function contextDeleteAction() {
  void emitBulk('delete', [...contextIds.value]);
}
const contextStatusDisabled = computed(
  () =>
    selection.state.busy || (contextIds.value.length === 1 && archiveBlocked(contextIds.value[0]!)),
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
/**
 * 批量结果只走全局浮层 toast（#831）：成功与失败都不在列表流内留常驻行，
 * 失败 toast 在存续期间带「重试」，点击后按同一动作重跑失败的那批会话。
 */
function bulkToastMessage(key: 'bulkSucceeded' | 'bulkFailed', action: BulkAction, count: number) {
  return t(`shell.conversation.${key}`, {
    action: t(`shell.conversation.${action}`),
    count,
  });
}
function showBulkSuccess(action: BulkAction, count: number) {
  toast.success(bulkToastMessage('bulkSucceeded', action, count), {
    id: 'conversation-bulk-success',
    duration: 4000,
  });
}
function showBulkFailure(action: BulkAction, ids: string[]) {
  toast.error(bulkToastMessage('bulkFailed', action, ids.length), {
    id: 'conversation-bulk-failure',
    duration: 8000,
    action: {
      label: t('shell.conversation.retry'),
      onClick: () => {
        // 按原动作重跑本次失败的 ids（整批抛错时即原 ids 全集）；toast 点击后自动关闭，零残留。
        void emitBulk(action, ids);
      },
    },
  });
}

async function emitBulk(action: BulkAction, ids = [...selectedIds.value]) {
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
    if (!sidebarAlive.value || !selection.isOperationCurrent(operation)) return;
    // 仅作内部记录，不再驱动列表流内的任何渲染。
    selection.state.results = results.map((result) => ({
      ...result,
      title: titles.get(result.id) ?? result.id,
      action,
    }));
    const succeeded = results.filter((result) => result.success).map((result) => result.id);
    const failed = results.filter((result) => !result.success).map((result) => result.id);
    selection.complete(succeeded);
    for (const id of failed) {
      if (visibleIds.value.includes(id) && !selection.isSelected(id)) selection.toggle(id);
    }
    // 取消的危险删除返回空结果：既没有成功也没有失败，不给任何提示。
    // 归档成功沿用会话层带 Undo 的那条 toast，避免同一次批量操作出现两条成功提示。
    if (succeeded.length && action !== 'archive') showBulkSuccess(action, succeeded.length);
    if (failed.length) showBulkFailure(action, failed);
  } catch {
    if (sidebarAlive.value && selection.isOperationCurrent(operation)) {
      selection.state.results = ids.map((id) => ({
        id,
        title: titles.get(id) ?? id,
        success: false,
        action,
      }));
      for (const id of ids) {
        if (visibleIds.value.includes(id) && !selection.isSelected(id)) selection.toggle(id);
      }
      showBulkFailure(action, ids);
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
// Local avatar for the current account; the legacy profile URL is only the
// one-time compatibility fallback (Issue #858).
const accountStore = useAccountStore();
const { avatarUrl: accountAvatarUrl } = useAccountAvatar(
  () => accountStore.currentAccount?.profile?.avatarUrl ?? null,
);

function profileLabel(profile: ProfileSummary): string {
  return [
    profile.displayName,
    profile.identifierHint || profile.profileId,
    t(
      profile.profileKind === 'local'
        ? 'auth.profileAccess.local'
        : 'auth.profileAccess.registered',
    ),
    profile.hasCredential ? t('auth.profileAccess.unlock') : '',
    profile.profileId === props.activeProfileId ? t('shell.account.currentProfile') : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const identityLabel = () => {
  if (props.identityKind === 'cloud') return t('shell.account.signedIn');
  if (props.identityKind === 'registered-local') return t('shell.account.localProfile');
  return t('shell.account.localIdentity');
};

/**
 * 卡面头像状态点：只投影已有的 identityKind/cloudState，不新增状态来源。
 * 色调沿用同步指示器的约定（离线弱化、需重新授权用 destructive、进行中用琥珀）。
 */
const cloudStatusTone = computed<string | null>(() => {
  if (props.identityKind !== 'cloud') return null;
  switch (props.cloudState) {
    case 'ONLINE':
      return 'bg-emerald-500';
    case 'CHECKING':
      return 'bg-amber-500';
    case 'OFFLINE':
      return 'bg-[hsl(var(--foreground-subtle))]';
    case 'REAUTH_REQUIRED':
      return 'bg-destructive';
    default:
      return null;
  }
});

/**
 * 「编辑个人资料」只发出意图（#856）；对话框本体由 #857 实现，读取同一个
 * intent 的 `open`。宿主未接线时（独立挂载的组件测试）点击是安全的空操作。
 */
const profileEditorIntent = inject(PROFILE_EDITOR_INTENT_KEY, null);
function requestEditProfile(): void {
  profileEditorIntent?.request();
}
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
                        data-testid="conversation-archive"
                        class="pointer-events-none absolute inset-0 flex h-6 w-6 items-center justify-center rounded-md text-[hsl(var(--foreground-subtle))] opacity-0 transition-opacity duration-150 hover:bg-[hsl(var(--hover))] hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-any-hover/item:pointer-events-auto group-any-hover/item:opacity-100 group-has-[:focus-visible]/item:pointer-events-auto group-has-[:focus-visible]/item:opacity-100 disabled:opacity-40"
                        :aria-label="t('shell.conversation.archive')"
                        :disabled="selection.state.busy"
                        @click.stop="runRowAction(item.id)"
                      >
                        <component :is="Archive" class="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" class="text-xs">
                      {{ t('shell.conversation.archive') }}
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
              <component :is="Archive" class="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              {{ t('shell.conversation.archive')
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
    </nav>

    <!-- 已归档专属分区：与置顶/会话列表并列，标题行折叠，空归档保留分区与空态文案。 -->
    <section
      class="shrink-0 border-t border-[hsl(var(--border-subtle))] px-2 py-1"
      data-testid="conversation-archived-section"
    >
      <button
        type="button"
        data-testid="conversation-archived-toggle"
        class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[10px] font-medium tracking-[0.025em] text-[hsl(var(--foreground-subtle))] transition-colors hover:bg-[hsl(var(--hover))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :aria-expanded="archivedOpen"
        aria-controls="conversation-archived-list"
        @click="archivedOpen = !archivedOpen"
      >
        <ChevronDown
          class="h-3 w-3 shrink-0 transition-transform"
          :class="archivedOpen ? '' : '-rotate-90'"
          aria-hidden="true"
        />
        <span>{{ t('shell.conversation.archived') }}</span>
        <span class="ml-auto tabular-nums" data-testid="conversation-archived-count">{{
          archivedConversations?.length ?? 0
        }}</span>
      </button>
      <div v-if="archivedOpen" id="conversation-archived-list">
        <p
          v-if="!archivedConversations?.length"
          class="px-2 py-3 text-center text-[11px] leading-5 text-muted-foreground/65"
          data-testid="conversation-archived-empty"
        >
          {{ t('shell.conversation.noArchivedConversations') }}
        </p>
        <ul v-else class="max-h-60 overflow-y-auto" data-testid="conversation-archived-list-items">
          <li
            v-for="item in archivedConversations"
            :key="item.id"
            class="group/archived flex items-center gap-2 rounded-md px-2 py-1.5 text-[hsl(var(--foreground-muted))] transition-colors hover:bg-[hsl(var(--hover))] hover:text-foreground"
            data-testid="archived-conversation-row"
          >
            <span class="min-w-0 flex-1 truncate text-[12.5px] leading-5" :title="item.title">{{
              item.title
            }}</span>
            <span
              class="shrink-0 text-[10px] tabular-nums text-[hsl(var(--foreground-subtle))]"
              data-testid="archived-conversation-time"
              >{{ item.time }}</span
            >
            <button
              type="button"
              data-testid="archived-conversation-restore"
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[hsl(var(--foreground-subtle))] transition-colors hover:bg-[hsl(var(--hover))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              :aria-label="t('shell.conversation.restore')"
              :title="t('shell.conversation.restore')"
              :disabled="loading || selection.state.busy"
              @click="restoreArchived(item.id)"
            >
              <ArchiveRestore class="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <div class="flex items-center justify-between gap-2 px-2 py-1 text-[10px]">
          <button
            type="button"
            data-testid="archived-conversation-previous-page"
            class="rounded px-1 py-0.5 transition-colors hover:bg-[hsl(var(--hover))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            :disabled="(archivePage ?? 1) <= 1 || loading"
            @click="emit('change-archive-page', -1)"
          >
            {{ t('shell.conversation.previousPage') }}
          </button>
          <button
            type="button"
            data-testid="archived-conversation-next-page"
            class="rounded px-1 py-0.5 transition-colors hover:bg-[hsl(var(--hover))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            :disabled="!archiveHasMore || loading"
            @click="emit('change-archive-page', 1)"
          >
            {{ t('shell.conversation.nextPage') }}
          </button>
        </div>
      </div>
    </section>

    <!-- 底：账户块（左）+ 独立设置入口（右），见 #856。 -->
    <div
      class="flex h-11 shrink-0 items-center gap-1 border-t border-[hsl(var(--border-subtle))] px-2.5"
      data-testid="shell-account-footer"
    >
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
            data-testid="shell-account-card"
            :title="t('shell.account.menu')"
            :aria-label="t('shell.account.menu')"
            class="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-[hsl(var(--hover))] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span
              class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/90 text-[10px] font-semibold text-primary-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.18)]"
              data-testid="shell-account-avatar"
            >
              <img
                v-if="accountAvatarUrl"
                :src="accountAvatarUrl"
                alt=""
                class="h-full w-full object-cover"
                data-testid="shell-account-avatar-image"
              />
              <template v-else>{{ displayName().slice(0, 1).toUpperCase() }}</template>
            </span>
            <span class="flex min-w-0 flex-1 flex-col justify-center">
              <span
                data-testid="shell-account-name"
                class="block min-w-0 truncate text-[11.5px] font-medium leading-4"
                >{{ displayName() }}</span
              >
              <span
                v-if="accountEmail"
                data-testid="shell-account-email"
                class="block min-w-0 truncate text-[10px] leading-[13px] text-[hsl(var(--foreground-subtle))]"
                >{{ accountEmail }}</span
              >
            </span>
          </button>
        </DropdownMenuTrigger>
        <!-- 个人卡片：#801 的菜单语义（子菜单、键盘导航、关闭后焦点归还）保留，
             外观改为卡片；卡面自身不设滚动容器，长内容靠 truncate 裁剪。 -->
        <DropdownMenuContent
          align="start"
          side="top"
          :side-offset="6"
          class="w-64 max-w-[calc(100vw-1rem)] rounded-xl p-1.5"
          @close-auto-focus="restoreAccountMenuFocus"
        >
          <!-- data-testid 只能落在真实元素上：Reka 的内容根是 portal/fragment。 -->
          <div data-testid="shell-account-card-panel" class="min-w-0">
            <!-- 横幅贴住卡片上缘/两侧（抵消 content 的 p-1.5），圆角由卡片 overflow-hidden 收口。 -->
            <div
              class="-mx-1.5 -mt-1.5 h-16 rounded-t-md bg-gradient-to-br from-[hsl(var(--primary)/0.22)] to-[hsl(var(--primary)/0.06)]"
              data-testid="shell-account-card-banner"
              aria-hidden="true"
            />
            <div class="px-1.5 pb-1.5" data-testid="shell-account-identity">
              <div class="relative -mt-7 mb-1.5 h-14 w-14">
                <span
                  class="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-primary text-base font-semibold text-primary-foreground ring-2 ring-[hsl(var(--surface-overlay))]"
                  data-testid="shell-account-card-avatar"
                  aria-hidden="true"
                >
                  <img
                    v-if="accountAvatarUrl"
                    :src="accountAvatarUrl"
                    alt=""
                    class="h-full w-full object-cover"
                  />
                  <template v-else>{{ displayName().slice(0, 2).toUpperCase() }}</template>
                </span>
                <span
                  v-if="cloudStatusTone"
                  class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-[hsl(var(--surface-overlay))]"
                  :class="cloudStatusTone"
                  data-testid="shell-account-card-status"
                  aria-hidden="true"
                />
              </div>
              <div class="min-w-0">
                <p
                  class="truncate text-[15px] font-semibold leading-5"
                  data-testid="shell-account-card-name"
                >
                  {{ displayName() }}
                </p>
                <p
                  v-if="identityKind !== 'cloud'"
                  class="truncate text-[11px] leading-4 text-muted-foreground"
                  data-testid="shell-account-card-kind"
                >
                  {{ identityLabel() }}
                </p>
                <p
                  v-if="accountEmail"
                  class="truncate text-[11px] leading-4 text-muted-foreground/80"
                  data-testid="shell-account-card-email"
                >
                  {{ accountEmail }}
                </p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="shell-edit-profile" @select="requestEditProfile">
              <UserPen class="mr-2 h-4 w-4" aria-hidden="true" />
              {{ t('shell.account.editProfile') }}
            </DropdownMenuItem>
            <DropdownMenuSub v-if="isDesktop">
              <DropdownMenuSubTrigger data-testid="shell-switch-account">
                <ArrowLeftRight class="mr-2 h-4 w-4" aria-hidden="true" />
                {{ t('shell.account.switchAccount') }}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                data-testid="shell-profile-switcher"
                class="w-72 max-w-[calc(100vw-1rem)]"
                :collision-padding="8"
                :avoid-collisions="true"
              >
                <div
                  class="max-h-[min(60vh,24rem)] overflow-y-auto"
                  data-testid="shell-profile-list"
                >
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
                      class="mr-2 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs"
                      aria-hidden="true"
                    >
                      <img
                        v-if="profile.avatarUrl"
                        :src="profile.avatarUrl"
                        alt=""
                        class="h-full w-full object-cover"
                      />
                      <template v-else>{{
                        profile.displayName.slice(0, 2).toUpperCase()
                      }}</template>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate" :title="profile.displayName">{{
                        profile.displayName
                      }}</span>
                      <small class="block truncate text-muted-foreground">
                        {{
                          profile.profileKind === 'local'
                            ? t('auth.profileAccess.local')
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
                      v-if="profile.hasCredential"
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
                <DropdownMenuItem data-testid="shell-add-account" @select="emit('add-account')">
                  <UserPlus class="mr-2 h-4 w-4" aria-hidden="true" />
                  {{ t('shell.account.menuAddAccount') }}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              v-if="isDesktop || cloudConnected"
              data-testid="shell-logout"
              class="text-destructive focus:text-destructive"
              @click="emit('logout')"
            >
              <LogOut class="mr-2 h-4 w-4" aria-hidden="true" />
              {{ t('shell.account.logout') }}
            </DropdownMenuItem>
            <DropdownMenuItem
              v-else
              data-testid="shell-open-cloud-connection"
              @click="emit('open-cloud-connection')"
            >
              <Cloud class="mr-2 h-4 w-4" aria-hidden="true" />
              {{
                identityKind === 'registered-local'
                  ? t('shell.account.reauthenticate')
                  : t('shell.account.connectCloud')
              }}
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <slot name="footer-actions" />
      <button
        type="button"
        data-testid="shell-open-settings"
        :title="t('shell.account.settings')"
        :aria-label="t('shell.account.settings')"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[hsl(var(--foreground-subtle))] transition-colors hover:bg-[hsl(var(--hover))] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        @click="emit('open-settings')"
      >
        <Settings class="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  </aside>
</template>
