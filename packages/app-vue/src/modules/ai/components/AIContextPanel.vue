<script setup lang="ts">
/** Canonical AI workflow workbench container. Runtime state is injected via slot. */
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import { X } from '@lucide/vue';

defineProps<{
  hasWorkflowContext: boolean;
  open: boolean;
  toolLabel: string;
  embedded?: boolean;
}>();

defineEmits<{ close: [] }>();
const { t } = useI18n();
</script>

<template>
  <aside
    v-if="hasWorkflowContext"
    class="min-h-0 flex-col bg-background"
    :class="
      embedded
        ? 'flex h-full w-full'
        : [
            'fixed inset-x-0 bottom-0 z-40 max-h-[72vh] border-t shadow-xl md:static md:z-auto md:max-h-none md:w-96 md:shrink-0 md:border-l md:border-t-0 md:shadow-none',
            open ? 'flex' : 'hidden md:flex',
          ]
    "
    data-testid="ai-context-panel"
  >
    <div class="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
      <div class="min-w-0">
        <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {{ t('aiAssistant.chatPage.workbench.title') }}
        </p>
        <p class="truncate text-sm font-medium text-foreground">{{ toolLabel }}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('aiAssistant.chatPage.workbench.hide')"
        :class="embedded ? 'h-8 w-8' : 'h-8 w-8 md:hidden'"
        :title="t('aiAssistant.chatPage.workbench.hide')"
        data-testid="ai-context-panel-close"
        @click="$emit('close')"
      >
        <X class="h-4 w-4" />
      </Button>
    </div>

    <slot name="action-bar" />
    <div class="min-h-0 flex-1 overflow-y-auto p-4" data-scroll-host="workflow">
      <div class="space-y-4"><slot /></div>
    </div>
  </aside>
</template>
