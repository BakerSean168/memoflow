<template>
  <DialogContent
    :class="
      cn(
        'flex min-h-0 flex-col gap-0 overflow-hidden rounded-2xl border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-overlay))] p-0',
        sizeClass,
        heightClass,
        contentClass,
      )
    "
    :data-testid="testId"
    :data-product-dialog-recipe="recipe"
    @open-auto-focus="handleOpenAutoFocus"
    @close-auto-focus="handleCloseAutoFocus"
    @interact-outside="handleInteractOutside"
  >
    <DialogHeader
      class="shrink-0 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.5)] px-5 py-4 text-left"
    >
      <div class="flex min-w-0 items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <slot name="icon" />
          <div class="min-w-0" :class="$slots.description ? 'space-y-1' : ''">
            <DialogTitle class="text-[16px] font-semibold tracking-[-0.015em]">
              <slot name="title" />
            </DialogTitle>
            <DialogDescription
              v-if="$slots.description"
              class="text-[12px] leading-5 text-[hsl(var(--foreground-muted))]"
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
      :class="cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', bodyClass)"
      data-testid="product-dialog-body"
    >
      <slot />
    </div>

    <DialogFooter
      class="sticky bottom-0 z-10 shrink-0 gap-2 border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.72)] px-5 py-3.5 backdrop-blur-sm sm:gap-2"
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
    recipe?: 'form' | 'inspect' | 'config' | 'workspace';
    size?: 'sm' | 'md' | 'lg';
    heightMode?: 'content' | 'workspace';
    contentClass?: HTMLAttributes['class'];
    bodyClass?: HTMLAttributes['class'];
    initialFocusSelector?: string;
    preventInteractOutside?: boolean;
  }>(),
  {
    recipe: 'form',
    contentClass: undefined,
    bodyClass: undefined,
    initialFocusSelector: undefined,
    preventInteractOutside: false,
  },
);

const resolvedSize = computed<'sm' | 'md' | 'lg'>(() => {
  if (props.size) return props.size;
  return props.recipe === 'inspect' ? 'sm' : props.recipe === 'workspace' ? 'lg' : 'md';
});

const resolvedHeightMode = computed<'content' | 'workspace'>(() => {
  if (props.heightMode) return props.heightMode;
  return props.recipe === 'workspace' ? 'workspace' : 'content';
});

const sizeClass = computed(
  () =>
    ({
      sm: 'sm:max-w-[440px]',
      md: 'sm:max-w-[680px]',
      lg: 'sm:max-w-[960px]',
    })[resolvedSize.value],
);

const heightClass = computed(
  () =>
    ({
      content: 'max-h-[min(90vh,760px)]',
      workspace: 'h-[calc(100dvh-2rem)] max-h-[1100px] sm:h-[calc(100dvh-3rem)]',
    })[resolvedHeightMode.value],
);

let returnFocus: HTMLElement | null = null;

function handleOpenAutoFocus(event: Event): void {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!props.initialFocusSelector) return;

  event.preventDefault();
  scheduleInitialFocus();
}

function handleCloseAutoFocus(event: Event): void {
  // Route-controlled owner dialogs have no DialogTrigger registered with Reka.
  if (!event.defaultPrevented && returnFocus?.isConnected && returnFocus !== document.body) {
    event.preventDefault();
    returnFocus.focus({ preventScroll: true });
  }
  returnFocus = null;
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
      if (!props.open) return;
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
