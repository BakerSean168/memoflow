<template>
  <aside :class="sidebarClass">
    <!-- Header：新建会话为主操作；刷新/设置收进 ⋯ 菜单（§1-5） -->
    <div class="flex h-14 items-center border-b px-4">
      <div class="flex items-center gap-2 font-semibold">
        <MemoFlowAiIcon class="h-5 w-5 text-primary" />
        <span>{{ t('aiAssistant.title') }}</span>
      </div>

      <div class="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          :aria-label="t('aiAssistant.dialogs.chat.newConversation')"
          class="h-8 w-8"
          :title="t('aiAssistant.dialogs.chat.newConversation')"
          data-testid="ai-sidebar-new-conversation"
          @click="$emit('new-conversation')"
        >
          <Plus class="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              :aria-label="t('common.more')"
              class="h-8 w-8"
              data-testid="ai-sidebar-more"
            >
              <MoreHorizontal class="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44">
            <DropdownMenuItem :disabled="loading" @click="$emit('refresh')">
              <RefreshCcw class="mr-2 h-4 w-4" />
              {{ t('aiAssistant.dialogs.chat.refresh') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="$emit('open-settings')">
              <Settings2 class="mr-2 h-4 w-4" />
              {{ t('nav.settings') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          v-if="showClose"
          variant="ghost"
          size="icon"
          :aria-label="t('aiAssistant.chatPage.sidebar.close')"
          class="h-8 w-8"
          :title="t('aiAssistant.chatPage.sidebar.close')"
          data-testid="ai-sidebar-close"
          @click="$emit('close')"
        >
          <X class="h-4 w-4" />
        </Button>
      </div>
    </div>

    <Button
      variant="ghost"
      class="mx-2"
      :aria-pressed="showingArchive"
      @click="
        showingArchive = !showingArchive;
        $emit('refresh');
      "
    >
      {{ t(showingArchive ? 'shell.conversation.active' : 'shell.conversation.archived') }}
    </Button>
    <div class="min-h-0 flex-1 overflow-y-auto p-2">
      <!-- 固定状态图标位于标题行末端；已查看的普通成功会话不渲染状态。 -->
      <TooltipProvider>
        <div ref="conversationListRef" class="relative flex flex-col" role="list">
          <AIConversationSidebarRow
            v-for="item in visibleConversations"
            :key="item.id"
            :conversation="item"
            :active="activeConversationId === item.id"
            :status="conversationStatuses[item.id] ?? null"
            :showing-archive="showingArchive"
            :title-busy="titleBusy?.[item.id]"
            @select="$emit('select', $event)"
            @archive="$emit('archive', $event)"
            @restore="$emit('restore', $event)"
            @delete="$emit('delete', $event)"
            @rename="(id, name) => $emit('rename', id, name)"
            @regenerate-title="$emit('regenerate-title', $event)"
          />
        </div>
      </TooltipProvider>

      <div
        v-if="!visibleConversations.length && !loading"
        class="rounded-lg px-3 py-4 text-sm text-muted-foreground"
      >
        {{ t('aiAssistant.dialogs.chat.noSavedConversations') }}
      </div>

      <div v-if="showingArchive" class="flex justify-between px-2 text-xs">
        <Button
          variant="ghost"
          :disabled="(archivePage ?? 1) <= 1 || loading"
          @click="$emit('change-archive-page', -1)"
          >{{ t('shell.conversation.previousPage') }}</Button
        >
        <Button
          variant="ghost"
          :disabled="!archiveHasMore || loading"
          @click="$emit('change-archive-page', 1)"
          >{{ t('shell.conversation.nextPage') }}</Button
        >
      </div>
      <!-- Recent Goal / Knowledge shortcuts; runtime runs are Mastra-owned and are not listed here. -->
      <Collapsible v-model:open="recentGoalsOpen" class="mt-1">
        <CollapsibleTrigger
          class="flex w-full items-center justify-between rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          data-testid="ai-sidebar-section-recent-goals"
        >
          {{ t('aiAssistant.chatPage.sidebar.recentGoals') }}
          <ChevronDown
            class="h-3.5 w-3.5 transition-transform"
            :class="recentGoalsOpen ? 'rotate-180' : ''"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <button
            v-for="goal in recentGoals"
            :key="goal.id"
            type="button"
            class="mb-1 flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            data-testid="ai-sidebar-recent-goal"
            @click="$emit('select-goal', goal.id)"
          >
            <Target class="mt-0.5 h-4 w-4 shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium text-foreground">
                {{ goal.title || t('common.untitled') }}
              </span>
              <span class="block truncate text-xs">
                {{ formatGoalMeta(goal) }}
              </span>
            </span>
          </button>
          <div
            v-if="!recentGoals.length"
            class="rounded-lg px-3 py-2 text-sm text-muted-foreground"
          >
            {{ t('aiAssistant.chatPage.sidebar.noRecentGoals') }}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible v-model:open="recentNotesOpen" class="mt-1">
        <CollapsibleTrigger
          class="flex w-full items-center justify-between rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          data-testid="ai-sidebar-section-recent-notes"
        >
          {{ t('aiAssistant.chatPage.sidebar.recentKnowledgeNotes') }}
          <ChevronDown
            class="h-3.5 w-3.5 transition-transform"
            :class="recentNotesOpen ? 'rotate-180' : ''"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <button
            v-for="note in recentKnowledgeNotes"
            :key="note.id"
            type="button"
            class="mb-1 flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            data-testid="ai-sidebar-recent-note"
            @click="$emit('select-knowledge-note', note.id)"
          >
            <FileText class="mt-0.5 h-4 w-4 shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium text-foreground">
                {{ note.title || t('common.untitled') }}
              </span>
              <span class="block truncate text-xs">
                {{ note.path }}
              </span>
            </span>
          </button>
          <div
            v-if="recentKnowledgeNotesEmailVerificationRequired"
            class="space-y-1 rounded-lg px-3 py-2 text-sm"
            :class="aiUiHost.semanticToneStatusClass('warning')"
            data-testid="ai-sidebar-email-verification"
            role="status"
          >
            <p class="font-medium">
              {{ t(recentKnowledgeNotesErrorMessageKey || 'errors.EMAIL_VERIFICATION_REQUIRED') }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ t('common.emailVerificationRequiredHint') }}
            </p>
          </div>
          <div
            v-else-if="!recentKnowledgeNotes.length"
            class="rounded-lg px-3 py-2 text-sm text-muted-foreground"
            data-testid="ai-sidebar-no-recent-notes"
          >
            {{ t('aiAssistant.chatPage.sidebar.noRecentKnowledgeNotes') }}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { aiUiHost } from '../ai-ui-host';
import MemoFlowAiIcon from './MemoFlowAiIcon.vue';
import AIConversationSidebarRow from './AIConversationSidebarRow.vue';
import { useSidebarListMotion } from '../composables/sidebarListMotion';
import {
  ChevronDown,
  FileText,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Settings2,
  Target,
  X,
} from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TooltipProvider,
} from '@memoflow/ui-vue-shadcn';
import type { ConversationAttentionMap } from '../composables/useConversationAttention';
import type {
  AIWorkspaceRecentGoal,
  AIWorkspaceRecentKnowledgeNote,
  ConversationSummary,
} from '../composables/types';

const props = withDefaults(
  defineProps<{
    conversations: ConversationSummary[];
    archivePage?: number;
    archiveHasMore?: boolean;
    conversationStatuses?: ConversationAttentionMap;
    titleBusy?: Record<string, boolean>;
    recentGoals: AIWorkspaceRecentGoal[];
    recentKnowledgeNotes: AIWorkspaceRecentKnowledgeNote[];
    /** When true, show verification-required degrade instead of empty notes. */
    recentKnowledgeNotesEmailVerificationRequired?: boolean;
    /** i18n key for the degrade message (defaults to errors.EMAIL_VERIFICATION_REQUIRED). */
    recentKnowledgeNotesErrorMessageKey?: string | null;
    activeConversationId: string;
    loading: boolean;
    variant?: 'desktop' | 'mobile';
    showClose?: boolean;
  }>(),
  {
    variant: 'desktop',
    showClose: false,
    conversationStatuses: () => ({}),
    recentKnowledgeNotesEmailVerificationRequired: false,
    recentKnowledgeNotesErrorMessageKey: null,
  },
);

const emit = defineEmits<{
  rename: [id: string, name: string];
  'regenerate-title': [id: string];
  'new-conversation': [];
  refresh: [];
  'open-settings': [];
  close: [];
  select: [item: ConversationSummary];
  'select-goal': [id: string];
  'select-knowledge-note': [id: string];
  delete: [id: string];
  archive: [id: string];
  restore: [id: string];
  'change-archive-page': [direction: number];
}>();

const { t } = useI18n();

const showingArchive = ref(false);
const visibleConversations = computed(() =>
  props.conversations.filter((item) => (item.status === 'Archived') === showingArchive.value),
);

const conversationListRef = ref<HTMLElement | null>(null);
const { update: updateListMotion } = useSidebarListMotion(conversationListRef);

watch(showingArchive, () => {
  // When switching between Active and Archived tabs, update without FLIP travel animation
  updateListMotion(false);
});

// 折叠段默认收起（回溯/快捷入口非日常路径，§1-5）
const recentGoalsOpen = ref(false);
const recentNotesOpen = ref(false);

const sidebarClass =
  props.variant === 'mobile'
    ? 'flex h-full min-h-0 w-full flex-col bg-sidebar'
    : 'hidden min-h-0 w-64 shrink-0 flex-col border-r bg-sidebar md:flex';

function formatGoalMeta(goal: AIWorkspaceRecentGoal): string {
  const parts = [goal.status];
  if (typeof goal.progress === 'number') {
    parts.push(
      t('aiAssistant.chatPage.sidebar.goalProgress', {
        progress: Math.round(goal.progress),
      }),
    );
  }
  return parts.filter(Boolean).join(' · ');
}
</script>
