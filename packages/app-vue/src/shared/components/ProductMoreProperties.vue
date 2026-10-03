<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="h-8 w-8 rounded-full text-muted-foreground"
        :aria-label="label"
        :data-testid="testId"
        :disabled="disabled"
        data-slot="product-more-properties-trigger"
      >
        <MoreHorizontal class="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent :align="align" :class="contentClass">
      <slot />
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { MoreHorizontal } from '@lucide/vue';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@memoflow/ui-vue-shadcn';

withDefaults(
  defineProps<{
    label: string;
    testId?: string;
    disabled?: boolean;
    align?: 'start' | 'center' | 'end';
    contentClass?: string;
  }>(),
  {
    testId: undefined,
    disabled: false,
    align: 'start',
    contentClass: 'w-52',
  },
);
</script>
