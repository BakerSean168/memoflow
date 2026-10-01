<script setup lang="ts">
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@memoflow/ui-vue-shadcn';

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    testId?: string;
    bodyClass?: string;
    size?: 'default' | 'wide';
  }>(),
  {
    description: undefined,
    testId: undefined,
    bodyClass: undefined,
    size: 'default',
  },
);
</script>

<template>
  <DialogContent :class="size === 'wide' ? 'sm:max-w-3xl' : 'sm:max-w-lg'" :data-testid="testId">
    <DialogHeader>
      <DialogTitle>{{ title }}</DialogTitle>
      <DialogDescription v-if="description">{{ description }}</DialogDescription>
    </DialogHeader>

    <div class="min-w-0" :class="bodyClass">
      <slot />
    </div>

    <DialogFooter v-if="$slots.footer">
      <slot name="footer" />
    </DialogFooter>
  </DialogContent>
</template>
