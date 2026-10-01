<script setup lang="ts">
import { ProductSurfaceHeader } from '../../../shared/components';
</script>

<template>
  <ProductSurfaceHeader family="document" data-testid="document-workspace-toolbar">
    <div v-if="$slots.leading" class="flex shrink-0 items-center gap-1">
      <slot name="leading" />
    </div>

    <div class="flex min-w-0 flex-1 items-center gap-2">
      <slot />
    </div>

    <div v-if="$slots.actions" class="ml-auto flex shrink-0 items-center gap-1">
      <slot name="actions" />
    </div>
  </ProductSurfaceHeader>
</template>
