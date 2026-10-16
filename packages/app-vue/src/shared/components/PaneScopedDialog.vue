<script setup lang="ts">
import { computed } from 'vue';
import { X } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

/**
 * A non-modal dialog whose containing block is the owning business surface.
 * Its sibling backdrop is purely visual; it never portals into document.body,
 * traps focus, dismisses on outside clicks, or intercepts the AI Chat column.
 *
 * The consumer must position its owning module root (relative + overflow-hidden)
 * and mark the underlying content inert while this editor is open.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    testId: string;
    titleId: string;
    closeTestId?: string;
    closeDisabled?: boolean;
    /** Freezes this pane (its owning form) while a nested picker surface is open. */
    inert?: boolean;
    size?: 'compact' | 'standard' | 'wide' | 'picker';
    heightMode?: 'content' | 'workspace';
  }>(),
  { closeDisabled: false, inert: false, size: 'wide', heightMode: 'workspace' },
);
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

const widthClass = computed(
  () =>
    ({
      compact: 'w-full max-w-[440px]',
      picker: 'w-full max-w-[368px]',
      standard: 'w-full max-w-[620px]',
      wide: 'w-[96%] max-w-[960px]',
    })[props.size],
);
const heightClass = computed(() =>
  // Occupy a stable fraction of the OWN business pane, capped on tall displays.
  // The form's content must never determine the workspace dialog's outer size.
  props.heightMode === 'workspace' ? 'h-[min(88%,900px)]' : 'max-h-full',
);
</script>

<template>
  <div
    v-if="open"
    :inert="inert"
    class="absolute inset-0 z-20 isolate flex min-h-0 min-w-0 items-center justify-center overflow-hidden p-4 @2xl/panel:p-6"
    data-testid="pane-scoped-dialog-host"
    data-dialog-scope="business-content"
  >
    <!-- Deliberate visual treatment: dim the original business view within this
         pane only. The backdrop is not a dismissal target. -->
    <div
      class="pointer-events-auto absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      aria-hidden="true"
      data-testid="pane-scoped-dialog-backdrop"
    />
    <section
      :class="[widthClass, heightClass]"
      class="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-overlay))] shadow-[0_24px_72px_-30px_rgba(0,0,0,0.85),0_8px_28px_-15px_rgba(0,0,0,0.55)]"
      role="dialog"
      aria-modal="false"
      @keydown.esc.stop.prevent="!closeDisabled && emit('close')"
      :aria-labelledby="titleId"
      data-editor-presentation="pane"
      :data-testid="testId"
    >
      <header
        class="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.65)] px-4 py-3 @2xl/panel:px-5"
      >
        <div class="min-w-0">
          <h2 :id="titleId" class="truncate text-sm font-semibold tracking-[-0.01em]">
            <slot name="title" />
          </h2>
          <p v-if="$slots.description" class="mt-1 text-xs leading-5 text-muted-foreground">
            <slot name="description" />
          </p>
        </div>
        <div class="flex min-w-0 shrink-0 items-center gap-1">
          <slot name="actions" />
          <button
            type="button"
            class="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            :aria-label="t('common.close')"
            :disabled="closeDisabled"
            :data-testid="closeTestId"
            @click="emit('close')"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div v-if="$slots.status" class="shrink-0 px-4 pt-3 @2xl/panel:px-5">
        <slot name="status" />
      </div>
      <div
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 @2xl/panel:px-5"
        data-scroll-host="pane-dialog"
      >
        <slot />
      </div>
      <footer
        class="flex shrink-0 justify-end gap-2 border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.65)] px-4 py-3 @2xl/panel:px-5"
      >
        <slot name="footer" />
      </footer>
    </section>
  </div>
</template>
