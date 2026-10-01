<template>
  <ProductSurfaceState
    family="workspace"
    :kind="kind"
    :title="title"
    :description="description"
    test-id="document-workspace-state"
  >
    <template v-if="$slots.icon" #icon>
      <slot name="icon" />
    </template>
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </ProductSurfaceState>
</template>

<script setup lang="ts">
import { ProductSurfaceState } from '../../../shared/components';

defineProps<{
  kind: 'loading' | 'error' | 'empty';
  title?: string;
  description?: string;
}>();
</script>
