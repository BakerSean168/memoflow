<script setup lang="ts">
import { nextTick, watch } from 'vue';
import { Dialog } from '@memoflow/ui-vue-shadcn';
import PaneScopedDialog from './PaneScopedDialog.vue';
import ProductDialogShell from './ProductDialogShell.vue';

/**
 * Reuse Goal's established business-pane editor behavior without changing the
 * form's fields, validation or owner-specific close guard.
 * Global presentation remains available for independent/legacy callers.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    presentation?: 'dialog' | 'panel';
    testId: string;
    titleId: string;
    initialFocusSelector?: string;
    returnFocusSelector?: string;
    closeDisabled?: boolean;
    /**
     * Owners with nested pane pickers set this while a picker is open so only
     * the owning form goes inert; the sibling picker surface stays interactive.
     */
    inert?: boolean;
    recipe?: 'form' | 'inspect' | 'config' | 'workspace';
    bodyClass?: string;
    contentClass?: string;
    paneSize?: 'compact' | 'standard' | 'wide' | 'picker';
    paneHeightMode?: 'content' | 'workspace';
  }>(),
  {
    presentation: 'dialog',
    initialFocusSelector: undefined,
    returnFocusSelector: undefined,
    closeDisabled: false,
    inert: false,
    recipe: 'workspace',
    bodyClass: undefined,
    contentClass: undefined,
    paneSize: 'wide',
    paneHeightMode: 'workspace',
  },
);
const emit = defineEmits<{ 'update:open': [boolean] }>();

let returnFocus: HTMLElement | null = null;
function canRestoreFocus(target: HTMLElement | null): target is HTMLElement {
  if (
    !target?.isConnected ||
    target === document.body ||
    target.closest('[inert], [aria-hidden="true"], [role="menu"][data-state="closed"]')
  )
    return false;
  for (let element: HTMLElement | null = target; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}
watch(
  () => props.open,
  async (open, wasOpen) => {
    if (props.presentation !== 'panel') return;
    if (open && !wasOpen) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      if (!props.open || !props.initialFocusSelector) return;
      const pane = document.querySelector<HTMLElement>(
        '[data-testid="' + props.testId + '"][data-editor-presentation="pane"]',
      );
      pane?.querySelector<HTMLElement>(props.initialFocusSelector)?.focus({ preventScroll: true });
    } else if (!open && wasOpen) {
      await nextTick();
      if (props.open) return;
      const target = canRestoreFocus(returnFocus)
        ? returnFocus
        : props.returnFocusSelector
          ? document.querySelector<HTMLElement>(props.returnFocusSelector)
          : null;
      returnFocus = null;
      if (canRestoreFocus(target)) {
        target.focus({ preventScroll: true });
      }
    }
  },
  { flush: 'post', immediate: true },
);
</script>

<template>
  <PaneScopedDialog
    v-if="presentation === 'panel'"
    :open="open"
    :test-id="testId"
    :title-id="titleId"
    :close-disabled="closeDisabled"
    :inert="inert"
    :size="paneSize"
    :height-mode="paneHeightMode"
    @close="emit('update:open', false)"
  >
    <template #title><slot name="title" /></template>
    <template v-if="$slots.description" #description><slot name="description" /></template>
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    <template v-if="$slots.status" #status><slot name="status" /></template>
    <slot />
    <template #footer><slot name="footer" /></template>
  </PaneScopedDialog>
  <Dialog v-else :open="open" @update:open="emit('update:open', $event)">
    <ProductDialogShell
      :open="open"
      :test-id="testId"
      :recipe="recipe"
      :body-class="bodyClass"
      :content-class="contentClass"
      :initial-focus-selector="initialFocusSelector"
    >
      <template v-if="$slots.icon" #icon><slot name="icon" /></template>
      <template #title><slot name="title" /></template>
      <template v-if="$slots.description" #description><slot name="description" /></template>
      <template v-if="$slots.actions" #actions><slot name="actions" /></template>
      <template v-if="$slots.status" #status><slot name="status" /></template>
      <slot />
      <template #footer><slot name="footer" /></template>
    </ProductDialogShell>
  </Dialog>
</template>
