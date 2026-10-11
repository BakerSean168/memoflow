<script setup lang="ts">
import { Dialog } from '@memoflow/ui-vue-shadcn';
import { ProductDialogShell } from '../../../../shared/components';

defineProps<{ open: boolean; presentation: 'dialog' | 'panel' }>();
defineEmits<{ 'update:open': [boolean] }>();
</script>

<template>
  <section
    v-if="presentation === 'panel' && open"
    class="flex h-full min-h-0 flex-col"
    data-testid="goal-panel-form"
    aria-labelledby="goal-panel-title"
  >
    <header class="flex shrink-0 items-center justify-between border-b px-5 py-4">
      <h2 id="goal-panel-title" class="font-semibold"><slot name="title" /></h2>
      <slot name="actions" />
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-scroll-host="goal-form">
      <slot />
    </div>
    <footer class="flex shrink-0 justify-end gap-2 border-t px-5 py-3.5">
      <slot name="footer" />
    </footer>
  </section>
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
