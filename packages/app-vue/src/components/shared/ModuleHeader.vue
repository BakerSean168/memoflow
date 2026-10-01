<script setup lang="ts">
import ProductSurfaceHeader from '../../shared/components/ProductSurfaceHeader.vue';
import type { ProductSurfaceHeaderFamily } from '../../shared/components/product-surface-header.types';

/**
 * ModuleHeader — slotted module header composition over the shared product-surface grammar.
 *
 * Entity is the default for detail/inspect pages. List and diagnostic owners opt into
 * their legal family explicitly without changing the slot or behavior contract.
 */
withDefaults(
  defineProps<{
    family?: ProductSurfaceHeaderFamily;
  }>(),
  {
    family: 'entity',
  },
);
</script>

<template>
  <ProductSurfaceHeader :family="family" data-testid="module-header">
    <div class="flex min-h-11 items-center gap-2 px-3 @2xl/panel:px-4">
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
