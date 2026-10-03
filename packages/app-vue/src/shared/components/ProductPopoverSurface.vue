<template>
  <PopoverContent
    :align="align"
    :side-offset="sideOffset"
    :class="cn(recipeClass, contentClass)"
    :data-product-popover-recipe="recipe"
  >
    <slot />
  </PopoverContent>
</template>

<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import { cn, PopoverContent } from '@memoflow/ui-vue-shadcn';

const props = withDefaults(
  defineProps<{
    recipe?: 'compact-menu' | 'property';
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
    contentClass?: HTMLAttributes['class'];
  }>(),
  {
    recipe: 'property',
    align: 'start',
    sideOffset: 4,
    contentClass: undefined,
  },
);

const recipeClass = computed(
  () =>
    ({
      'compact-menu': 'w-44 p-1.5',
      property: 'w-56 space-y-2 p-3',
    })[props.recipe],
);
</script>
