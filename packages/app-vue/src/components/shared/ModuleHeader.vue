<script setup lang="ts">
import { computed } from 'vue';
import ProductSurfaceHeader from '../../shared/components/ProductSurfaceHeader.vue';
import type { ProductSurfaceHeaderFamily } from '../../shared/components/product-surface-header.types';

/**
 * ModuleHeader — slotted module header composition over the shared product-surface grammar.
 *
 * Entity is the default for detail/inspect pages. List and diagnostic owners opt into
 * their legal family explicitly without changing the slot or behavior contract.
 */
const props = withDefaults(
  defineProps<{
    family?: ProductSurfaceHeaderFamily;
  }>(),
  {
    family: 'entity',
  },
);

const innerClass = computed(() =>
  props.family === 'entity'
    ? 'flex min-h-11 w-full items-center gap-2 px-3 @2xl/panel:px-4'
    : 'flex w-full items-center gap-2',
);
</script>

<template>
  <ProductSurfaceHeader :family="family" data-testid="module-header">
    <div :class="innerClass">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <slot name="leading" />
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <slot name="actions" />
      </div>
    </div>
    <slot name="subnav" />
  </ProductSurfaceHeader>
</template>
