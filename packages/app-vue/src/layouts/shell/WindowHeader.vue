<script setup lang="ts">
/**
 * WindowHeader (UI 重构 V2 壳)
 *
 * 桌面式壳的顶栏（h-48px）。三段式：
 * - 左：侧栏折叠按钮 · 返回/前进
 * - 中：全局模块复合胶囊
 * - 右：Schedule/Notification 复合胶囊 · 右侧面板 Toggle · 窗口控制
 *
 * 顶栏胶囊是全局模块启动器和摘要预览；BusinessPanel Tab 只表达当前业务上下文。
 * 桌面窗控复用既有 useDesktopWindowControls（apps/desktop 已落地 IPC）。
 * 交互逻辑不接业务数据，只 emit 给 AppShell。
 *
 * 契约：复合入口主按钮/预览按钮分别是 `capsule-nav-*` / `capsule-preview-*`；
 * Settings 模式复用同一顶栏的侧栏/历史控制，只替换中间场景内容。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Minus,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  Square,
  X,
} from '@lucide/vue';
import type { Component } from 'vue';
import ModuleCapsule from './ModuleCapsule.vue';

interface WindowControlsState {
  isMaximized: boolean;
  isMinimizable: boolean;
  isMaximizable: boolean;
  isClosable: boolean;
}

export interface WindowHeaderCapsule {
  id: string;
  label: string;
  route: string;
  icon: Component;
  placement?: 'primary' | 'utility';
  /** 未读/待办计数（如 notification unread）；null 表示不显示 badge（Phase 5 / UI-008）。 */
  badge?: number | null;
}

const props = defineProps<{
  /** workspace = 业务壳顶栏；settings = 独立设置场景（隐藏工作区入口）。 */
  mode?: 'workspace' | 'settings';
  /** 侧栏是否已折叠（控制折叠按钮图标）。 */
  sidebarCollapsed: boolean;
  /** 右侧面板是否打开（独立于业务 Tab 和左侧栏）。 */
  rightPanelOpen: boolean;
  /** 工作流等待用户查看时显示在右侧面板 Toggle 上。 */
  workflowAttentionCount?: number;
  /** 是否桌面环境（渲染窗控 + 拖拽区）。 */
  isDesktop?: boolean;
  /** macOS：原生交通灯占左上角——左侧留位、不渲染自绘窗控。 */
  isMac?: boolean;
  /** 桌面窗控状态（isDesktop 时由 AppShell 透传）。 */
  windowControls?: WindowControlsState;
  /** 全局模块启动器；主按钮跳转，预览按钮打开摘要浮层。 */
  capsules?: WindowHeaderCapsule[];
}>();

const emit = defineEmits<{
  (e: 'toggle-sidebar'): void;
  (e: 'toggle-right-panel'): void;
  (e: 'go-back'): void;
  (e: 'go-forward'): void;
  (e: 'open-module', payload: { id: string; route: string }): void;
  (e: 'window-minimize'): void;
  (e: 'window-toggle-maximize'): void;
  (e: 'window-close'): void;
}>();

const { t } = useI18n();

const primaryCapsules = computed(() =>
  (props.capsules ?? []).filter((entry) => entry.placement !== 'utility'),
);
const utilityCapsules = computed(() =>
  (props.capsules ?? []).filter((entry) => entry.placement === 'utility'),
);
</script>

<template>
  <header
    class="window-header flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 text-xs"
    :class="[isDesktop ? 'window-header--drag' : '', isMac ? 'pl-20' : '']"
    data-testid="window-header"
    :data-header-mode="props.mode ?? 'workspace'"
  >
    <!-- 左：所有场景共享侧栏 + history 控件；Settings 只替换中间内容。 -->
    <div class="flex shrink-0 items-center gap-2">
      <button
        type="button"
        class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        :title="sidebarCollapsed ? t('common.expand') : t('common.collapse')"
        :aria-label="sidebarCollapsed ? t('common.expand') : t('common.collapse')"
        data-testid="shell-sidebar-toggle"
        @click="emit('toggle-sidebar')"
      >
        <PanelLeftClose v-if="!sidebarCollapsed" class="h-4 w-4" />
        <PanelLeft v-else class="h-4 w-4" />
      </button>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
          :title="t('shell.back')"
          :aria-label="t('shell.back')"
          @click="emit('go-back')"
        >
          <ArrowLeft class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
          :title="t('shell.forward')"
          :aria-label="t('shell.forward')"
          @click="emit('go-forward')"
        >
          <ArrowRight class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <div
      v-if="props.mode !== 'settings'"
      class="window-header__drag-surface flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-hidden"
      data-testid="window-header-drag-surface"
    >
      <nav
        v-if="primaryCapsules.length"
        class="no-drag flex min-w-0 items-center gap-1 overflow-x-auto py-1"
        :aria-label="t('shell.moduleNav')"
        data-testid="shell-primary-capsules"
      >
        <ModuleCapsule
          v-for="entry in primaryCapsules"
          :key="entry.id"
          :id="entry.id"
          :label="entry.label"
          :route="entry.route"
          :icon="entry.icon"
          :badge="entry.badge"
          @open="emit('open-module', $event)"
          v-slot="{ closePreview }"
        >
          <slot :name="`capsule-preview-${entry.id}`" :close-preview="closePreview" />
        </ModuleCapsule>
      </nav>
    </div>
    <div
      v-else
      class="window-header__drag-surface flex min-w-0 flex-1 items-center justify-center"
      data-testid="settings-window-header-title"
    >
      <span class="truncate rounded-md bg-muted/50 px-3 py-1 text-xs font-medium text-foreground">{{
        t('setting.title')
      }}</span>
    </div>

    <!-- 右：日程/通知入口、面板与桌面窗控。 -->
    <div class="flex shrink-0 items-center gap-3">
      <nav
        v-if="props.mode !== 'settings' && utilityCapsules.length"
        class="no-drag flex max-w-[35vw] items-center gap-1 overflow-x-auto"
        :aria-label="t('shell.moduleNav')"
        data-testid="shell-utility-capsules"
      >
        <ModuleCapsule
          v-for="entry in utilityCapsules"
          :key="entry.id"
          :id="entry.id"
          :label="entry.label"
          :route="entry.route"
          :icon="entry.icon"
          :badge="entry.badge"
          @open="emit('open-module', $event)"
          v-slot="{ closePreview }"
        >
          <slot :name="`capsule-preview-${entry.id}`" :close-preview="closePreview" />
        </ModuleCapsule>
      </nav>
      <button
        v-if="props.mode !== 'settings'"
        type="button"
        class="relative rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        data-testid="shell-right-panel-toggle"
        :title="rightPanelOpen ? t('shell.hideSidePanel') : t('shell.showSidePanel')"
        :aria-label="rightPanelOpen ? t('shell.hideSidePanel') : t('shell.showSidePanel')"
        :aria-pressed="rightPanelOpen"
        @click="emit('toggle-right-panel')"
      >
        <PanelRightClose v-if="rightPanelOpen" class="h-4 w-4" />
        <PanelRight v-else class="h-4 w-4" />
        <span
          v-if="(workflowAttentionCount ?? 0) > 0"
          class="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-semibold leading-4 text-primary-foreground"
          data-testid="shell-workflow-attention-badge"
        >
          {{ workflowAttentionCount }}
        </span>
      </button>

      <div v-if="isDesktop && !isMac" class="flex items-center gap-1">
        <button
          type="button"
          class="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          :disabled="windowControls && !windowControls.isMinimizable"
          :title="t('shell.window.minimize')"
          :aria-label="t('shell.window.minimize')"
          @click="emit('window-minimize')"
        >
          <Minus class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          :disabled="windowControls && !windowControls.isMaximizable"
          :title="t('shell.window.maximize')"
          :aria-label="t('shell.window.maximize')"
          @click="emit('window-toggle-maximize')"
        >
          <Copy v-if="windowControls?.isMaximized" class="h-3 w-3" />
          <Square v-else class="h-3 w-3" />
        </button>
        <button
          type="button"
          class="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
          :disabled="windowControls && !windowControls.isClosable"
          :title="t('shell.window.close')"
          :aria-label="t('shell.window.close')"
          @click="emit('window-close')"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.window-header--drag {
  -webkit-app-region: drag;
  user-select: none;
}

/*
 * Keep the header itself draggable and opt only real interaction surfaces out.
 * Marking a flex-1 wrapper as no-drag effectively erases the entire titlebar
 * drag target, especially in the centered capsule region.
 */
.window-header--drag button,
.window-header--drag a,
.window-header--drag input,
.window-header--drag select,
.window-header--drag textarea,
.window-header--drag [role='button'],
.no-drag {
  -webkit-app-region: no-drag;
}
</style>
