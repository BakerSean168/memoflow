<script setup lang="ts">
/**
 * ConversationSidebar (UI 重构 V2 壳)
 *
 * 左侧栏 = 纯 AI 会话列表（V2 §5 决策 #4，无 Projects 树、无业务对象）。
 * 结构：品牌 + 搜索 → 「新对话」→ 会话列表（按时间分组）→ 底部账户菜单。
 *
 * 账户入口（诊断修订 §9）：头像打开账户菜单，不再直达 Settings。
 */
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MoreHorizontal, Search, SquarePen, Trash2, X } from '@lucide/vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@memoflow/ui-vue-shadcn';
import { APP_NAME_ZH } from '@memoflow/assets';

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
  groups: ConversationGroup[];
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
  /** Current persisted width for the accessible resize separator. */
  width?: number;
}>();

const emit = defineEmits<{
  (e: 'new-conversation'): void;
  (e: 'select-conversation', id: string): void;
  (e: 'delete-conversation', id: string): void;
  (e: 'open-settings'): void;
  (e: 'open-account'): void;
  (e: 'open-cloud-connection'): void;
  (e: 'logout'): void;
  (e: 'start-resize', event: MouseEvent): void;
  (e: 'resize-by', delta: number): void;
}>();

const { t } = useI18n();

const searchOpen = ref(false);
const searchQuery = ref('');
const searchInput = ref<HTMLInputElement | null>(null);

const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLocaleLowerCase());
const filteredGroups = computed(() => {
  if (!normalizedSearchQuery.value) return props.groups;
  return props.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.title.toLocaleLowerCase().includes(normalizedSearchQuery.value),
      ),
    }))
    .filter((group) => group.items.length > 0);
});

async function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (!searchOpen.value) {
    searchQuery.value = '';
    return;
  }
  await nextTick();
  searchInput.value?.focus();
}

function closeSearch() {
  searchOpen.value = false;
  searchQuery.value = '';
}

const displayName = () => props.userName || t('shell.guest');

const identityLabel = () => {
  if (props.identityKind === 'cloud') return t('shell.account.signedIn');
  if (props.identityKind === 'registered-local') return t('shell.account.localProfile');
  return t('shell.account.guestIdentity');
};
</script>

<template>
  <aside
    data-testid="conversation-sidebar"
    class="conversation-sidebar relative flex h-full flex-col border-r border-sidebar-border/60 bg-sidebar text-sidebar-foreground"
  >
    <!-- 头：品牌 + 搜索 -->
    <div class="flex h-12 shrink-0 items-center justify-between px-3.5">
      <span class="truncate text-[13px] font-semibold tracking-[-0.01em]">{{ APP_NAME_ZH }}</span>
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        :class="searchOpen ? 'bg-sidebar-accent text-foreground' : ''"
        :title="t('shell.search')"
        :aria-label="t('shell.search')"
        :aria-pressed="searchOpen"
        data-testid="conversation-search-toggle"
        @click="toggleSearch"
      >
        <Search class="h-4 w-4" />
      </button>
    </div>

    <div v-if="searchOpen" class="shrink-0 px-2 pb-1.5" data-testid="conversation-search">
      <div class="relative">
        <Search
          class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/65"
        />
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="search"
          autocomplete="off"
          class="h-8 w-full rounded-md border border-sidebar-border/60 bg-background/45 pl-8 pr-8 text-xs text-foreground outline-none placeholder:text-muted-foreground/55 focus:border-ring/55 focus:ring-1 focus:ring-ring/20"
          :placeholder="t('shell.conversation.searchPlaceholder')"
          :aria-label="t('shell.conversation.searchPlaceholder')"
          data-testid="conversation-search-input"
          @keydown.escape.stop.prevent="closeSearch"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          :aria-label="t('shell.conversation.clearSearch')"
          :title="t('shell.conversation.clearSearch')"
          data-testid="conversation-search-clear"
          @click="searchQuery = ''"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- 新对话 -->
    <div class="shrink-0 px-2 py-1.5">
      <button
        type="button"
        data-testid="shell-new-conversation"
        class="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-sidebar-accent"
        @click="emit('new-conversation')"
      >
        <SquarePen class="h-4 w-4" />
        <span>{{ t('shell.newChat') }}</span>
      </button>
    </div>

    <!-- 会话列表（按时间分组） -->
    <nav class="flex-1 overflow-y-auto px-2 pb-4 pt-1">
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
      <div v-for="group in filteredGroups" :key="group.labelKey" class="mb-3">
        <p class="px-2.5 pb-1 pt-2 text-[11px] font-medium text-muted-foreground/55">
          {{ t(group.labelKey) }}
        </p>
        <div
          v-for="item in group.items"
          :key="item.id"
          class="group/item relative flex w-full items-center rounded-md transition-colors"
          :class="
            activeConversationId === item.id
              ? 'bg-sidebar-accent/80 text-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/55 hover:text-foreground'
          "
        >
          <button
            type="button"
            class="min-w-0 flex-1 px-2.5 py-1.5 text-left text-[13px] leading-5"
            @click="emit('select-conversation', item.id)"
          >
            <span class="block truncate">{{ item.title }}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button
                type="button"
                class="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-[opacity,background-color,color] hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100"
                :aria-label="t('common.more')"
                @click.stop
              >
                <MoreHorizontal class="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" class="w-36">
              <DropdownMenuItem
                class="text-destructive focus:text-destructive"
                @click="emit('delete-conversation', item.id)"
              >
                <Trash2 class="mr-2 h-3.5 w-3.5" />
                {{ t('common.delete') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>

    <!-- 底：账户菜单 -->
    <div class="flex h-[50px] shrink-0 items-center border-t border-sidebar-border/30 px-3">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            data-testid="shell-account-menu"
            class="flex min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-sidebar-accent"
            :title="t('shell.account.menu')"
          >
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
            >
              {{ displayName().slice(0, 1).toUpperCase() }}
            </span>
            <span data-testid="shell-account-name" class="truncate text-xs font-semibold">{{
              displayName()
            }}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" class="w-52">
          <div class="px-2 py-1.5">
            <p class="truncate text-sm font-medium">{{ displayName() }}</p>
            <p class="text-[11px] text-muted-foreground">
              {{ identityLabel() }}
            </p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="shell-open-account" @click="emit('open-account')">
            {{ t('shell.account.accountAndPrivacy') }}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="shell-open-settings" @click="emit('open-settings')">
            {{ t('shell.account.settings') }}
          </DropdownMenuItem>
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
            {{ t('shell.account.connectCloud') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <!-- 拖宽把手 -->
    <div
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      :aria-label="t('shell.conversation.resize')"
      aria-valuemin="200"
      :aria-valuenow="width ?? 260"
      class="absolute right-0 top-0 h-full w-[3px] cursor-col-resize bg-transparent transition-colors hover:bg-primary/40"
      @mousedown="emit('start-resize', $event)"
      @keydown.left.prevent="emit('resize-by', -24)"
      @keydown.right.prevent="emit('resize-by', 24)"
    />
  </aside>
</template>
