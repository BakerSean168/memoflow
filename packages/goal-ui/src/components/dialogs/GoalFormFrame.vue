<script setup lang="ts">
import { goalUiHost } from '../../goalUiHost';
const { PaneScopedDialog } = goalUiHost.components;
const { ProductDialogShell } = goalUiHost.components;
import { Dialog } from '@memoflow/ui-vue-shadcn';

defineProps<{ open: boolean; presentation: 'dialog' | 'panel'; closeDisabled?: boolean }>();
defineEmits<{ 'update:open': [boolean] }>();
</script>

<template>
  <PaneScopedDialog
    v-if="presentation === 'panel'"
    :open="open"
    test-id="goal-panel-form"
    title-id="goal-panel-title"
    close-test-id="goal-panel-close"
    :close-disabled="closeDisabled"
    size="wide"
    height-mode="workspace"
    @close="$emit('update:open', false)"
  >
    <template #title><slot name="title" /></template>
    <template #actions><slot name="actions" /></template>
    <slot />
    <template #footer><slot name="footer" /></template>
  </PaneScopedDialog>
  <Dialog
    v-else-if="presentation === 'dialog'"
    :open="open"
    @update:open="$emit('update:open', $event)"
  >
    <ProductDialogShell
      :open="open"
      test-id="goal-dialog"
      recipe="workspace"
      initial-focus-selector="[data-testid='goal-name-input']"
    >
      <template #title><slot name="title" /></template>
      <template #actions><slot name="actions" /></template>
      <slot />
      <template #footer><slot name="footer" /></template>
    </ProductDialogShell>
  </Dialog>
</template>
