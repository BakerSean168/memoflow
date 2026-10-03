<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import type { Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronDown } from '@lucide/vue';
import { Popover, PopoverAnchor, PopoverContent } from '@memoflow/ui-vue-shadcn';

const props = defineProps<{
  id: string;
  label: string;
  route: string;
  icon: Component;
  /** 未读/待办计数；null/0 不显示（Phase 5 / UI-008）。 */
  badge?: number | null;
  previewSize?: 'compact' | 'default' | 'wide';
}>();

const emit = defineEmits<{
  (e: 'open', payload: { id: string; route: string }): void;
}>();

defineSlots<{
  default?: (props: { closePreview: () => void }) => unknown;
}>();

const { t } = useI18n();

type CapsuleOpenMode = 'closed' | 'hover' | 'pinned';

const previewButton = ref<HTMLButtonElement | null>(null);
const openMode = ref<CapsuleOpenMode>('closed');
const open = computed(() => openMode.value !== 'closed');
const previewWidthClass = computed(() => {
  if (props.previewSize === 'compact') return 'w-72';
  if (props.previewSize === 'wide') return 'w-[24rem]';
  return 'w-[22rem]';
});
// Match the app-wide tooltip dwell so capsule previews feel consistent with other hover affordances.
const HOVER_OPEN_DELAY_MS = 300;
let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function clearOpenTimer(): void {
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }
}

function clearCloseTimer(): void {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function keepHoverPreviewOpen(): void {
  clearOpenTimer();
  clearCloseTimer();
  if (openMode.value === 'closed') openMode.value = 'hover';
}

function scheduleHoverOpen(): void {
  if (openMode.value !== 'closed' || openTimer) return;
  clearCloseTimer();
  openTimer = setTimeout(() => {
    openTimer = null;
    if (openMode.value === 'closed') openMode.value = 'hover';
  }, HOVER_OPEN_DELAY_MS);
}

function previewHasFocus(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  const content = [
    ...document.querySelectorAll<HTMLElement>('[data-capsule-preview-content]'),
  ].find((entry) => entry.dataset.capsulePreviewContent === props.id);
  return Boolean(content?.contains(active));
}

function scheduleClose(): void {
  clearOpenTimer();
  if (openMode.value !== 'hover') return;
  clearCloseTimer();
  // Always defer the focus check. A focusout event can fire while document.activeElement
  // still points at the old control; checking only at event time can leave hover-open
  // workspaces stranded after the user tabs/clicks away.
  closeTimer = setTimeout(() => {
    if (openMode.value === 'hover' && !previewHasFocus()) {
      openMode.value = 'closed';
    }
    closeTimer = null;
  }, 180);
}

function focusPreviewContent(): void {
  const content = [
    ...document.querySelectorAll<HTMLElement>('[data-capsule-preview-content]'),
  ].find((entry) => entry.dataset.capsulePreviewContent === props.id);
  const target = content?.querySelector<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  target?.focus({ preventScroll: true });
}

function togglePinned(event: MouseEvent): void {
  clearOpenTimer();
  clearCloseTimer();
  openMode.value = openMode.value === 'pinned' ? 'closed' : 'pinned';
  if (openMode.value === 'pinned' && event.detail === 0) {
    void nextTick(focusPreviewContent);
  }
}

function handleOpenChange(value: boolean): void {
  // The capsule owns opening (hover vs pinned). Reka still owns outside/Escape
  // dismissal and may request a close through the controlled Popover root.
  if (!value) dismissPreview();
}

function handleEscape(): void {
  const restoreFocus = previewHasFocus();
  dismissPreview();
  if (restoreFocus) void nextTick(() => previewButton.value?.focus({ preventScroll: true }));
}

function dismissPreview(): void {
  clearOpenTimer();
  clearCloseTimer();
  openMode.value = 'closed';
}

function enterModule(): void {
  dismissPreview();
  emit('open', { id: props.id, route: props.route });
}

onBeforeUnmount(() => {
  clearOpenTimer();
  clearCloseTimer();
});
</script>

<template>
  <Popover :open="open" @update:open="handleOpenChange">
    <div
      class="module-capsule flex shrink-0 items-center overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.72)] text-[hsl(var(--foreground-muted))] shadow-[inset_0_1px_0_hsl(var(--foreground)/0.025)] transition-[background-color,border-color,color] duration-150 hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--hover))]"
      :data-testid="`capsule-${id}`"
    >
      <button
        type="button"
        class="module-capsule-main flex h-8 min-w-8 items-center gap-1.5 px-2.5 text-[12px] font-medium leading-none text-[hsl(var(--foreground-muted))] transition-colors hover:bg-[hsl(var(--selected)/0.72)] hover:text-foreground focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        :data-testid="`capsule-nav-${id}`"
        :title="label"
        :aria-label="label"
        @click="enterModule"
      >
        <component :is="icon" class="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden="true" />
        <span class="module-capsule-label">{{ label }}</span>
        <span
          v-if="typeof badge === 'number' && badge > 0"
          class="ml-0.5 flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white"
          :data-testid="`capsule-badge-${id}`"
          :aria-label="t('shell.moduleWithCount', { name: label, count: badge })"
        >
          {{ badge > 99 ? '99+' : badge }}
        </span>
      </button>

      <PopoverAnchor as-child>
        <button
          ref="previewButton"
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center border-l border-[hsl(var(--border-subtle))] text-[hsl(var(--foreground-subtle))] transition-colors hover:bg-[hsl(var(--selected)/0.72)] hover:text-foreground focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          :data-testid="`capsule-preview-${id}`"
          :aria-label="t('shell.previewModule', { name: label })"
          :aria-expanded="open"
          aria-haspopup="dialog"
          @mouseenter="scheduleHoverOpen"
          @mouseleave="scheduleClose"
          @click="togglePinned"
        >
          <ChevronDown class="h-3 w-3" aria-hidden="true" />
        </button>
      </PopoverAnchor>
    </div>

    <PopoverContent
      class="z-50 max-w-[calc(100vw-1rem)] rounded-xl border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-overlay))] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.28),0_2px_8px_rgba(0,0,0,0.18)]"
      :class="previewWidthClass"
      align="start"
      :side-offset="8"
      :data-capsule-preview-content="id"
      @mouseenter="keepHoverPreviewOpen"
      @mouseleave="scheduleClose"
      @focusin="keepHoverPreviewOpen"
      @focusout="scheduleClose"
      @open-auto-focus.prevent
      @close-auto-focus.prevent
      @escape-key-down="handleEscape"
      @pointer-down-outside="dismissPreview"
    >
      <slot :close-preview="dismissPreview" />
    </PopoverContent>
  </Popover>
</template>

<style scoped>
@container window-header (max-width: 1120px) {
  .module-capsule-main {
    padding-inline: 0.45rem;
  }
}

@container window-header (max-width: 900px) {
  .module-capsule-main {
    width: 2rem;
    justify-content: center;
    padding-inline: 0;
  }

  .module-capsule-label {
    display: none;
  }
}
</style>
