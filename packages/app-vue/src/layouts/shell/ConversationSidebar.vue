<script setup lang="ts">
/**
 * ConversationSidebar (UI 重构 V2 壳)
 *
 * 左侧栏 = 纯 AI 会话列表（V2 §5 决策 #4，无 Projects 树、无业务对象）。
 * 结构：品牌 + 搜索 → 「新对话」→ 会话列表（按时间分组）→ 底部账户菜单。
 *
 * 账户入口（诊断修订 §9）：头像打开账户菜单，不再直达 Settings。
 */
import { useI18n } from 'vue-i18n';
import { Search, SquarePen, X } from '@lucide/vue';
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
  (e: 'open-search'): void;
  (e: 'open-settings'): void;
  (e: 'open-account'): void;
  (e: 'open-cloud-connection'): void;
  (e: 'logout'): void;
  (e: 'start-resize', event: MouseEvent): void;
  (e: 'resize-by', delta: number): void;
}>();

const { t } = useI18n();

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
    class="conversation-sidebar relative flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
  >
    <!-- 头：品牌 + 搜索 -->
    <div class="flex h-[50px] shrink-0 items-center justify-between px-4">
      <span class="truncate text-sm font-bold">{{ APP_NAME_ZH }}</span>
      <button
        type="button"
        class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        :title="t('shell.search')"
        :aria-label="t('shell.search')"
        @click="emit('open-search')"
      >
        <Search class="h-4 w-4" />
      </button>
    </div>

    <!-- 新对话 -->
    <div class="shrink-0 px-2.5 py-2">
      <button
        type="button"
        data-testid="shell-new-conversation"
        class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        @click="emit('new-conversation')"
      >
        <SquarePen class="h-4 w-4" />
        <span>{{ t('shell.newChat') }}</span>
      </button>
    </div>

    <!-- 会话列表（按时间分组） -->
    <nav class="flex-1 overflow-y-auto px-2 pb-4">
      <p v-if="loading && groups.length === 0" class="px-3 py-2 text-xs text-muted-foreground/60">
        {{ t('common.loading') }}
      </p>
      <div v-for="group in groups" :key="group.labelKey" class="mb-3">
        <p
          class="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/45"
        >
          {{ t(group.labelKey) }}
        </p>
        <div
          v-for="item in group.items"
          :key="item.id"
          class="group/item relative flex w-full items-center rounded-md transition-colors"
          :class="
            activeConversationId === item.id
              ? 'bg-sidebar-accent text-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
          "
        >
          <button
            type="button"
            class="min-w-0 flex-1 px-3 py-1.5 text-left text-[13px]"
            @click="emit('select-conversation', item.id)"
          >
            <span class="block truncate">{{ item.title }}</span>
          </button>
          <button
            type="button"
            class="mr-1 shrink-0 rounded p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-foreground group-hover/item:opacity-100"
            :aria-label="t('common.delete')"
            @click.stop="emit('delete-conversation', item.id)"
          >
            <X class="h-3 w-3" />
          </button>
        </div>
      </div>
    </nav>

    <!-- 底：账户菜单 -->
    <div class="flex h-[52px] shrink-0 items-center border-t border-sidebar-border/40 px-3.5">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            data-testid="shell-account-menu"
            class="flex min-w-0 items-center gap-2.5 rounded p-1 transition-colors hover:bg-sidebar-accent"
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
