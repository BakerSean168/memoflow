<script setup lang="ts">
import { Dialog } from '@memoflow/ui-vue-shadcn';
import { X } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { ProductDialogShell } from '../../../../shared/components';

defineProps<{ open: boolean; presentation: 'dialog' | 'panel'; closeDisabled?: boolean }>();
const { t } = useI18n();
defineEmits<{ 'update:open': [boolean] }>();
</script>

<template>
  <section
    v-if="presentation === 'panel' && open"
    class="flex h-full min-h-0 w-full flex-col overflow-hidden"
    role="region"
    data-editor-presentation="pane"
    data-testid="goal-panel-form"
    aria-labelledby="goal-panel-title"
  >
    <header
      class="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b px-4 py-3 @2xl/panel:px-5"
    >
      <h2 id="goal-panel-title" class="min-w-0 truncate text-sm font-semibold">
        <slot name="title" />
      </h2>
      <div class="flex min-w-0 shrink-0 items-center gap-1">
        <slot name="actions" />
        <button
          type="button"
          class="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          :aria-label="t('common.close')"
          :disabled="closeDisabled"
          data-testid="goal-panel-close"
          @click="$emit('update:open', false)"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </div>
    </header>
    <div
      class="min-h-0 flex-1 overflow-y-auto px-4 py-4 @2xl/panel:px-5"
      data-scroll-host="goal-form"
    >
      <slot />
    </div>
    <footer class="flex shrink-0 justify-end gap-2 border-t px-4 py-3 @2xl/panel:px-5">
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
