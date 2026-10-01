<script setup lang="ts">
import type { ProductSurfaceHeaderFamily } from './product-surface-header.types';

defineOptions({ inheritAttrs: false });

defineProps<{
  family: ProductSurfaceHeaderFamily;
}>();

const familyClasses: Record<ProductSurfaceHeaderFamily, string> = {
  collection: 'flex min-h-11 items-center gap-2 px-3 py-1.5 @2xl/panel:px-4',
  entity: 'flex min-h-11 flex-col justify-center',
  calendar: 'flex min-h-11 flex-wrap items-center gap-2 px-2 py-1.5 @2xl/panel:px-4',
  document: 'flex min-h-11 min-w-0 items-center gap-2 px-3 py-1.5 @2xl/panel:px-4',
  settings: 'flex min-h-12 items-center gap-2 px-3 py-2 @2xl/panel:px-4',
  diagnostic: 'flex min-h-11 items-center gap-2 px-3 py-1.5 @2xl/panel:px-4',
};
</script>

<template>
  <header
    v-bind="$attrs"
    :class="[
      'z-10 shrink-0 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.82)] shadow-[0_1px_0_hsl(var(--border)/0.04)] backdrop-blur-sm',
      familyClasses[family],
    ]"
    :data-surface-header-family="family"
  >
    <slot />
  </header>
</template>
