<script setup lang="ts">
/**
 * BusinessPanel (UI 重构 V2 壳)
 *
 * 多 Tab 业务工作区（V2 §2.3，参照 Codex 桌面端右侧面板）。
 * Tab 条 [模块图标 + 标题] ×N + 右侧 Focus/Exit Focus；
 * 内容区放 <router-view> + KeepAlive（由 AppShell 通过 slot 注入）。
 *
 * 面板两档（V2 §7）：内容区用 ResizeObserver 实测宽度并 provide
 * （usePanelWidth），同时挂 Tailwind 命名容器 `@container/panel`——
 * 结构性切换（第二侧栏 ↔ 下拉）走 JS 档位，纯样式（网格列数）走
 * CSS 容器查询（`@2xl/panel:` 等）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Bell,
  Calendar,
  FileText,
  House,
  ListTodo,
  Maximize2,
  Minimize2,
  Target,
  Workflow,
  X,
} from '@lucide/vue';
import type { Component } from 'vue';
import type { BusinessTab, PanelSurface, ShellLayout, ShellModule } from './useAppShellStore';
import { BUSINESS_HARD_MIN } from './panel-geometry';
import { providePanelWidth } from './usePanelWidth';

const props = defineProps<{
  tabs: BusinessTab[];
  activeTabId: string | null;
  layout: ShellLayout;
  panelSurface: PanelSurface;
  workflowAvailable?: boolean;
  workflowAttentionCount?: number;
}>();

const emit = defineEmits<{
  (e: 'activate-tab', id: string): void;
  (e: 'close-tab', id: string): void;
  (e: 'show-home'): void;
  (e: 'show-workflow'): void;
  (e: 'close-workflow'): void;
  (e: 'toggle-focus'): void;
  (e: 'start-resize', event: PointerEvent): void;
  (e: 'reset-width'): void;
  (e: 'resize-by', delta: number): void;
}>();

const { t } = useI18n();

// ── 面板宽度上下文（V2 §7 两档；面板内业务视图 usePanelWidth 消费） ──
const { width: panelContentWidth } = providePanelWidth();
const contentEl = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (!contentEl.value || typeof ResizeObserver === 'undefined') return;
  panelContentWidth.value = contentEl.value.clientWidth;
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (entry) panelContentWidth.value = entry.contentRect.width;
  });
  resizeObserver.observe(contentEl.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

const moduleIcons: Record<ShellModule, Component> = {
  goal: Target,
  task: ListTodo,
  note: FileText,
  notification: Bell,
  schedule: Calendar,
};

const isFocused = computed(() => props.layout === 'focus');
</script>

<template>
  <section
    class="business-panel relative flex h-full flex-col border-l border-border bg-background"
    data-testid="business-panel"
  >
    <!-- Tab 条 -->
    <div class="flex h-[40px] shrink-0 items-center border-b border-border pr-1">
      <button
        type="button"
        class="flex h-9 w-10 shrink-0 items-center justify-center border-r border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        :class="panelSurface === 'home' ? 'bg-accent text-foreground' : ''"
        data-testid="business-panel-home"
        :title="t('shell.panel.home')"
        :aria-label="t('shell.panel.home')"
        @click="emit('show-home')"
      >
        <House class="h-3.5 w-3.5" />
      </button>

      <div class="flex flex-1 items-stretch overflow-x-auto">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="group flex max-w-[200px] items-stretch border-r border-border text-xs transition-colors"
          :class="
            panelSurface === 'business' && activeTabId === tab.id
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          "
        >
          <button
            type="button"
            class="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 px-3"
            :aria-current="
              panelSurface === 'business' && activeTabId === tab.id ? 'page' : undefined
            "
            @click="emit('activate-tab', tab.id)"
          >
            <component :is="moduleIcons[tab.module]" class="h-3.5 w-3.5 shrink-0" />
            <span class="truncate">{{ tab.title }}</span>
          </button>
          <button
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center opacity-0 transition-opacity hover:bg-muted focus:opacity-100 group-hover:opacity-100"
            data-testid="business-panel-tab-close"
            :aria-label="t('shell.panel.closeTab')"
            @click.stop="emit('close-tab', tab.id)"
          >
            <X class="h-3 w-3" />
          </button>
        </div>

        <div
          v-if="workflowAvailable"
          class="group flex max-w-[200px] items-stretch border-r border-border text-xs transition-colors"
          :class="
            panelSurface === 'workflow'
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          "
        >
          <button
            type="button"
            class="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 px-3"
            data-testid="business-panel-workflow"
            :aria-current="panelSurface === 'workflow' ? 'page' : undefined"
            @click="emit('show-workflow')"
          >
            <Workflow class="h-3.5 w-3.5 shrink-0" />
            <span class="truncate">{{ t('shell.panel.workflow') }}</span>
            <span
              v-if="(workflowAttentionCount ?? 0) > 0"
              class="rounded-full bg-primary/15 px-1.5 text-[9px] font-semibold text-primary"
            >
              {{ workflowAttentionCount }}
            </span>
          </button>
          <button
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center opacity-0 transition-opacity hover:bg-muted focus:opacity-100 group-hover:opacity-100"
            :aria-label="t('shell.panel.closeWorkflow')"
            @click.stop="emit('close-workflow')"
          >
            <X class="h-3 w-3" />
          </button>
        </div>
      </div>

      <!-- 面板级控制 -->
      <div class="flex shrink-0 items-center gap-0.5 pl-1">
        <button
          type="button"
          data-testid="business-panel-focus-toggle"
          class="flex h-9 w-9 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          :title="isFocused ? t('shell.panel.exitFocus') : t('shell.panel.enterFocus')"
          :aria-label="isFocused ? t('shell.panel.exitFocus') : t('shell.panel.enterFocus')"
          @click="emit('toggle-focus')"
        >
          <component :is="isFocused ? Minimize2 : Maximize2" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- 内容区（router-view 由 AppShell slot 注入；命名容器供 CSS 容器查询）。
         Phase 2 单一滚动责任：surface wrapper 只负责尺寸与裁剪（overflow-hidden），
         滚动由每个 surface 内部唯一的主滚动宿主（data-scroll-host）承担，
         避免外层 wrapper 与模块页面重复声明滚动层。 -->
    <div ref="contentEl" class="@container/panel min-h-0 flex-1 overflow-hidden">
      <div v-show="panelSurface === 'home'" class="h-full overflow-hidden" data-surface-scroll-root="home">
        <slot name="home" />
      </div>
      <div v-show="panelSurface === 'business'" class="h-full overflow-hidden" data-surface-scroll-root="business">
        <slot />
      </div>
      <div v-show="panelSurface === 'workflow'" class="h-full overflow-hidden" data-surface-scroll-root="workflow">
        <slot name="workflow" />
      </div>
    </div>

    <!-- 拖宽把手（split 态左边缘；focus 态满屏不需要） -->
    <div
      v-if="!isFocused"
      data-testid="business-panel-resizer"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      :aria-label="t('shell.panel.resize')"
      :aria-valuemin="BUSINESS_HARD_MIN"
      :aria-valuenow="Math.round(panelContentWidth ?? 720)"
      class="absolute left-0 top-0 z-20 h-full w-2 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :title="t('shell.panel.resize')"
      @pointerdown="emit('start-resize', $event)"
      @dblclick.stop="emit('reset-width')"
      @keydown.left.prevent="emit('resize-by', 24)"
      @keydown.right.prevent="emit('resize-by', -24)"
    />
  </section>
</template>
