<script setup lang="ts">
/**
 * Compatibility convenience wrapper for product empty states.
 *
 * ProductSurfaceState is the canonical loading/error/empty primitive. This
 * wrapper preserves the simple page-level API used by Goal/Task/Routine while
 * delegating all layout and typography to that shared grammar.
 */
import type { Component } from 'vue';
import { Button } from '@memoflow/ui-vue-shadcn';
import ProductSurfaceState from '../../shared/components/ProductSurfaceState.vue';

withDefaults(
  defineProps<{
    /** @lucide/vue icon component */
    icon?: Component;
    title: string;
    description?: string;
    actionLabel?: string;
    secondaryLabel?: string;
    testid?: string;
    density?: 'page' | 'inline';
  }>(),
  {
    icon: undefined,
    description: undefined,
    actionLabel: undefined,
    secondaryLabel: undefined,
    testid: undefined,
    density: 'page',
  },
);

defineEmits<{
  action: [];
  secondary: [];
}>();
</script>

<template>
  <ProductSurfaceState
    :family="density === 'inline' ? 'workspace' : 'collection'"
    kind="empty"
    :title="title"
    :description="description"
    :test-id="testid"
  >
    <template v-if="icon" #icon>
      <component :is="icon" class="h-10 w-10 text-muted-foreground/60" />
    </template>

    <template v-if="actionLabel || secondaryLabel || $slots.action || $slots.secondary" #actions>
      <slot name="action">
        <Button
          v-if="actionLabel"
          size="sm"
          data-testid="empty-state-action"
          @click="$emit('action')"
        >
          {{ actionLabel }}
        </Button>
      </slot>

      <slot name="secondary">
        <button
          v-if="secondaryLabel"
          type="button"
          class="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          data-testid="empty-state-secondary"
          @click="$emit('secondary')"
        >
          {{ secondaryLabel }}
        </button>
      </slot>
    </template>
  </ProductSurfaceState>
</template>
