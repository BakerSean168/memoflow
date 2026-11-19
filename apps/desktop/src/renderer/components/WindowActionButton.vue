<script setup lang="ts">
/**
 * Minimal token-styled button atom for the standalone Desktop windows.
 *
 * The intervention and custom-notification windows render outside the
 * authenticated shell, so they must not pull the full ui-vue-shadcn runtime.
 * These variants mirror the library Button's design tokens.
 */
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost';
    disabled?: boolean;
  }>(),
  { variant: 'secondary', disabled: false },
);
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    class="inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
    :class="{
      'border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-[hsl(var(--primary-hover))]':
        variant === 'primary',
      'border-input bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground':
        variant === 'secondary',
      'border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground':
        variant === 'ghost',
    }"
  >
    <slot />
  </button>
</template>
