<script setup lang="ts">
/**
 * ConversationSidebar (UI 重构 V2 壳)
 *
 * 左侧栏 = 纯 AI 会话列表（V2 §5 决策 #4，无 Projects 树、无业务对象）。
 * 结构：搜索 + 新对话同排 → 会话列表（按时间分组）→ 底部账户菜单。
 *
 * 账户入口（诊断修订 §9）：头像打开账户菜单，不再直达 Settings。
 */
import { vKeyboardList } from '../../shared/keyboard/list-adapter';
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  MoreHorizontal,
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
import type { ProfileSummary, ProfileCloudState } from '@memoflow/contracts/electron';
import type {
  ConversationAttentionStatus,
  ConversationAttentionMap,
} from '../../modules/ai/composables/useConversationAttention';

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
  profiles?: ProfileSummary[];
  activeProfileId?: string;
  cloudState?: ProfileCloudState;
  groups: ConversationGroup[];
  conversationStatuses?: ConversationAttentionMap;
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
  (e: 'new-conversation'): void;
  (e: 'select-conversation', id: string): void;
  (e: 'delete-conversation', id: string): void;
  (e: 'open-settings'): void;
  (e: 'open-cloud-connection'): void;
  (e: 'logout'): void;
  (e: 'manage-profiles', trigger: HTMLButtonElement | null): void;
  (e: 'switch-profile', profileId: string): void;
  (e: 'refresh-profiles'): void;
}>();

const { t } = useI18n();

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
const searchInput = ref<HTMLInputElement | null>(null);
const searchToggle = ref<HTMLButtonElement | null>(null);

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
    data-testid="conversation-sidebar"
    class="conversation-sidebar relative flex h-full flex-col bg-transparent text-sidebar-foreground"
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

    <!-- 会话列表（按时间分组） -->
    <nav v-keyboard-list class="flex-1 overflow-y-auto px-2 pb-3 pt-1">
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
        <div
          v-for="item in group.items"
          :key="item.id"
          class="group/item relative flex w-full items-center rounded-md transition-colors"
          :class="
            activeConversationId === item.id
              ? 'bg-[hsl(var(--selected)/0.82)] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.46)]'
              : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--hover))] hover:text-foreground'
          "
        >
          <button
            type="button"
            class="min-w-0 w-full flex-1 px-2 py-1.5 text-left text-[12.5px] leading-5"
            :class="stateOf(item.id) ? 'pr-16' : 'pr-9'"
            :data-keyboard-item="item.id"
            @click="emit('select-conversation', item.id)"
          >
            <span class="block min-w-0 truncate whitespace-nowrap">{{ item.title }}</span>
          </button>
          <TooltipProvider v-if="stateOf(item.id)">
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  type="button"
                  class="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  :aria-label="t(`aiAssistant.chatPage.sidebar.attention.${stateOf(item.id)}`)"
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
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button
                type="button"
                class="absolute top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[hsl(var(--foreground-subtle))] opacity-0 transition-[opacity,background-color,color] hover:bg-[hsl(var(--hover))] hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100"
                :class="stateOf(item.id) ? 'right-8' : 'right-0.5'"
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
