<template>
  <DialogContent
    :class="
      cn(
        'flex max-h-[min(90vh,760px)] min-h-0 flex-col gap-0 overflow-hidden rounded-xl border-border/80 bg-card p-0',
        sizeClass,
        contentClass,
      )
    "
    :data-testid="testId"
    @open-auto-focus="handleOpenAutoFocus"
    @interact-outside="handleInteractOutside"
  >
    <DialogHeader class="shrink-0 border-b px-6 py-5 text-left">
      <div class="flex min-w-0 items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <slot name="icon" />
          <div class="min-w-0" :class="$slots.description ? 'space-y-1' : ''">
            <DialogTitle class="text-lg font-semibold">
              <slot name="title" />
            </DialogTitle>
            <DialogDescription
              v-if="$slots.description"
              class="text-sm text-muted-foreground"
              data-testid="product-dialog-description"
            >
              <slot name="description" />
            </DialogDescription>
            <DialogDescription v-else class="sr-only">
              <slot name="title" />
            </DialogDescription>
          </div>
        </div>
        <div
          v-if="$slots.actions"
          class="mr-7 flex shrink-0 items-center gap-2"
          data-testid="product-dialog-header-actions"
        >
          <slot name="actions" />
        </div>
      </div>
    </DialogHeader>

    <slot name="status" />

    <div
      :class="cn('min-h-0 flex-1 overflow-y-auto px-6 py-4', bodyClass)"
      data-testid="product-dialog-body"
    >
      <slot />
    </div>

    <DialogFooter
      class="sticky bottom-0 z-10 shrink-0 gap-2 border-t bg-card px-6 py-4 sm:gap-2"
      data-testid="product-dialog-footer"
    >
      <slot name="footer" />
    </DialogFooter>
  </DialogContent>
</template>

<script setup lang="ts">
import { computed, nextTick, watch, type HTMLAttributes } from 'vue';
import {
  cn,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@memoflow/ui-vue-shadcn';

const props = withDefaults(
  defineProps<{
    open: boolean;
    testId: string;
    size?: 'sm' | 'md' | 'lg';
    contentClass?: HTMLAttributes['class'];
    bodyClass?: HTMLAttributes['class'];
    initialFocusSelector?: string;
    preventInteractOutside?: boolean;
  }>(),
  {
    size: 'md',
    contentClass: undefined,
    bodyClass: undefined,
    initialFocusSelector: undefined,
    preventInteractOutside: false,
  },
);

const sizeClass = computed(
  () =>
    ({
      sm: 'sm:max-w-[440px]',
      md: 'sm:max-w-[680px]',
      lg: 'sm:max-w-[960px]',
    })[props.size],
);

function handleOpenAutoFocus(event: Event): void {
  if (!props.initialFocusSelector) return;

  event.preventDefault();
  scheduleInitialFocus();
}

function handleInteractOutside(event: Event): void {
  if (props.preventInteractOutside) {
    event.preventDefault();
  }
}

function scheduleInitialFocus(): void {
  const selector = props.initialFocusSelector;
  if (!selector) return;

  void nextTick(() => {
    requestAnimationFrame(() => {
      const dialog = document.querySelector<HTMLElement>(`[data-testid="${props.testId}"]`);
      dialog?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    });
  });
}

watch(
  () => props.open,
  (open) => {
    if (open) scheduleInitialFocus();
  },
  { flush: 'post', immediate: true },
);
</script>
