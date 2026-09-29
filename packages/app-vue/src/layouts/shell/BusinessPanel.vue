<script setup lang="ts">
/**
 * BusinessPanel (UI 重构 V2 壳)
 *
 * 多 Tab 业务工作区（V2 §2.3，参照桌面 IDE / Linear 的工作区 Chrome）。
 *
 * Tab strip 采用自适应密度而不是原生横向滚动：
 * - comfortable：图标 + 标题 + close；
 * - compact：压缩标题宽度；
 * - icon：非活动 Tab 退化为模块图标，活动 Tab 继续保留最小上下文。
 *
 * 内容区放 <router-view> + KeepAlive（由 AppShell 通过 slot 注入）。
 *
 * 面板两档（V2 §7）：内容区用 ResizeObserver 实测宽度并 provide
 * （usePanelWidth），同时挂 Tailwind 命名容器 `@container/panel`。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Bell,
  Calendar,
  FileText,
  House,
  ListTodo,
  Maximize2,
  Minimize2,
  Repeat2,
  Target,
  Workflow,
  X,
} from '@lucide/vue';
import type { Component } from 'vue';
import type { BusinessTab, PanelSurface, ShellLayout, ShellModule } from './useAppShellStore';
import { BUSINESS_HARD_MIN } from './panel-geometry';
import { providePanelWidth } from './usePanelWidth';
import {
  resolveBusinessTabDensity,
  type BusinessTabDensity,
} from './business-tab-layout';

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
const tabListEl = ref<HTMLElement | null>(null);
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
  routine: Repeat2,
  note: FileText,
  notification: Bell,
  schedule: Calendar,
};

const isFocused = computed(() => props.layout === 'focus');

const tabDensity = computed<BusinessTabDensity>(() =>
  resolveBusinessTabDensity(
    panelContentWidth.value ?? 720,
    props.tabs.length,
    Boolean(props.workflowAvailable),
  ),
);

function isActiveTab(tab: BusinessTab): boolean {
  return props.panelSurface === 'business' && props.activeTabId === tab.id;
}

function showTabLabel(tab: BusinessTab): boolean {
  return tabDensity.value !== 'icon' || isActiveTab(tab);
}

function tabWidthClass(tab: BusinessTab): string {
  if (tabDensity.value === 'comfortable') {
    return 'min-w-0 flex-[1_1_7rem] max-w-[12rem]';
  }
  if (tabDensity.value === 'compact') {
    return isActiveTab(tab)
      ? 'min-w-0 flex-[1.35_1_5rem] max-w-[9rem]'
      : 'min-w-0 flex-[1_1_3.5rem] max-w-[7.5rem]';
  }
  return isActiveTab(tab)
    ? 'min-w-[4.5rem] flex-[1.6_1_4.5rem] max-w-[6.5rem]'
    : 'min-w-8 flex-[0_1_2.25rem] max-w-10';
}

function focusTab(tabId: string): void {
  void nextTick(() => {
    tabListEl.value
      ?.querySelector<HTMLButtonElement>(`[data-business-tab-id="${tabId}"]`)
      ?.focus({ preventScroll: true });
  });
}

function handleTabKeydown(event: KeyboardEvent, tabId: string): void {
  const index = props.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0 || props.tabs.length === 0) return;

  let nextIndex = index;
  if (event.key === 'ArrowRight') nextIndex = (index + 1) % props.tabs.length;
  else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + props.tabs.length) % props.tabs.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = props.tabs.length - 1;
  else if (event.key === 'Delete') {
    event.preventDefault();
    const fallback = props.tabs[index + 1] ?? props.tabs[index - 1];
    emit('close-tab', tabId);
    if (fallback) focusTab(fallback.id);
    return;
  } else {
    return;
  }

  event.preventDefault();
  const nextTab = props.tabs[nextIndex];
  if (!nextTab) return;
  emit('activate-tab', nextTab.id);
  focusTab(nextTab.id);
}
</script>

<template>
  <section
    class="business-panel relative flex h-full flex-col border-l border-[hsl(var(--border-subtle))] bg-background"
    data-testid="business-panel"
    :data-tab-density="tabDensity"
  >
    <!-- Shell chrome / Tab strip -->
    <div
      class="flex h-9 shrink-0 items-center gap-1 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.9)] px-1 shadow-[0_1px_0_hsl(var(--border)/0.05)]"
      data-testid="business-panel-tab-strip"
    >
      <button
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[hsl(var(--foreground-subtle))] transition-[background-color,color,box-shadow] duration-150 hover:bg-[hsl(var(--hover))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        :class="
          panelSurface === 'home'
            ? 'bg-[hsl(var(--surface-raised))] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-subtle))]'
            : ''
        "
        data-testid="business-panel-home"
        :title="t('shell.panel.home')"
        :aria-label="t('shell.panel.home')"
        @click="emit('show-home')"
      >
        <House class="h-3.5 w-3.5" />
      </button>

      <div class="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <div
          ref="tabListEl"
          class="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden"
          role="tablist"
          :aria-label="t('shell.moduleNav')"
          data-testid="business-panel-tab-list"
        >
          <div
            v-for="tab in tabs"
            :key="tab.id"
            class="group relative flex h-7 items-center overflow-hidden rounded-md text-[12px] transition-[flex-basis,max-width,background-color,color,box-shadow] duration-150 ease-out motion-reduce:transition-none"
            :class="[
              tabWidthClass(tab),
              isActiveTab(tab)
                ? 'bg-[hsl(var(--surface-raised))] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)),inset_0_1px_0_hsl(var(--foreground)/0.025)]'
                : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--hover))] hover:text-foreground',
            ]"
            :data-testid="`business-panel-tab-${tab.id}`"
          >
            <button
              type="button"
              role="tab"
              class="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md pl-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
              :class="[
                showTabLabel(tab) ? 'pr-7' : 'justify-center px-0',
                tabDensity === 'comfortable' ? 'font-medium' : 'font-normal',
              ]"
              :data-business-tab-id="tab.id"
              :aria-selected="isActiveTab(tab)"
              :tabindex="isActiveTab(tab) ? 0 : -1"
              :title="tab.title"
              @click="emit('activate-tab', tab.id)"
              @keydown="handleTabKeydown($event, tab.id)"
            >
              <component
                :is="moduleIcons[tab.module]"
                class="h-3.5 w-3.5 shrink-0 transition-opacity duration-150"
                :class="
                  tabDensity === 'icon' && !isActiveTab(tab)
                    ? 'group-hover:opacity-0 group-focus-within:opacity-0'
                    : ''
                "
                aria-hidden="true"
              />
              <span v-if="showTabLabel(tab)" class="min-w-0 flex-1 truncate leading-none">
                {{ tab.title }}
              </span>
            </button>

            <button
              type="button"
              class="absolute top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[hsl(var(--foreground-subtle))] transition-[opacity,background-color,color] duration-150 hover:bg-[hsl(var(--selected))] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              :class="[
                tabDensity === 'icon' && !isActiveTab(tab)
                  ? 'right-1/2 translate-x-1/2'
                  : 'right-1',
                isActiveTab(tab)
                  ? 'opacity-60 hover:opacity-100'
                  : 'opacity-0 group-hover:opacity-70 group-focus-within:opacity-100 hover:!opacity-100',
              ]"
              data-testid="business-panel-tab-close"
              tabindex="-1"
              :aria-label="`${t('shell.panel.closeTab')}: ${tab.title}`"
              @click.stop="emit('close-tab', tab.id)"
            >
              <X class="h-3 w-3" />
            </button>
          </div>
        </div>

        <div
          v-if="workflowAvailable"
          class="group relative flex h-7 shrink-0 items-center overflow-hidden rounded-md text-[12px] transition-[background-color,color,box-shadow] duration-150"
          :class="[
            panelSurface === 'workflow'
              ? 'bg-[hsl(var(--surface-raised))] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)),inset_0_1px_0_hsl(var(--foreground)/0.025)]'
              : 'text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--hover))] hover:text-foreground',
            tabDensity === 'comfortable' ? 'max-w-36' : tabDensity === 'compact' ? 'max-w-24' : 'w-8',
          ]"
        >
          <button
            type="button"
            class="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md pl-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
            :class="tabDensity === 'icon' ? 'justify-center px-0' : 'pr-7'"
            data-testid="business-panel-workflow"
            :aria-current="panelSurface === 'workflow' ? 'page' : undefined"
            :title="t('shell.panel.workflow')"
            @click="emit('show-workflow')"
          >
            <Workflow
              class="h-3.5 w-3.5 shrink-0 transition-opacity duration-150"
              :class="tabDensity === 'icon' ? 'group-hover:opacity-0' : ''"
            />
            <span v-if="tabDensity !== 'icon'" class="truncate">{{ t('shell.panel.workflow') }}</span>
            <span
              v-if="(workflowAttentionCount ?? 0) > 0 && tabDensity !== 'icon'"
              class="rounded-full bg-primary/15 px-1.5 text-[9px] font-semibold text-primary"
            >
              {{ workflowAttentionCount }}
            </span>
          </button>
          <button
            type="button"
            class="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[hsl(var(--foreground-subtle))] opacity-0 transition-[opacity,background-color,color] duration-150 hover:bg-[hsl(var(--selected))] hover:text-foreground group-hover:opacity-70 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            :class="tabDensity === 'icon' ? 'right-1/2 translate-x-1/2' : ''"
            :aria-label="t('shell.panel.closeWorkflow')"
            @click.stop="emit('close-workflow')"
          >
            <X class="h-3 w-3" />
          </button>
        </div>
      </div>

      <!-- 面板级控制 -->
      <div class="flex shrink-0 items-center">
        <button
          type="button"
          data-testid="business-panel-focus-toggle"
          class="flex h-7 w-7 items-center justify-center rounded-md text-[hsl(var(--foreground-subtle))] transition-[background-color,color] duration-150 hover:bg-[hsl(var(--hover))] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
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
         滚动由每个 surface 内部唯一的主滚动宿主（data-scroll-host）承担。 -->
    <div ref="contentEl" class="@container/panel min-h-0 flex-1 overflow-hidden">
      <div
        v-show="panelSurface === 'home'"
        class="h-full overflow-hidden"
        data-surface-scroll-root="home"
      >
        <slot name="home" />
      </div>
      <div
        v-show="panelSurface === 'business'"
        class="h-full overflow-hidden"
        data-surface-scroll-root="business"
      >
        <slot />
      </div>
      <div
        v-show="panelSurface === 'workflow'"
        class="h-full overflow-hidden"
        data-surface-scroll-root="workflow"
      >
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
