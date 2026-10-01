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
  }>(),
  {
    description: undefined,
    testId: undefined,
  },
);
</script>

<template>
  <DialogContent class="sm:max-w-lg" :data-testid="testId">
    <DialogHeader>
      <DialogTitle>{{ title }}</DialogTitle>
      <DialogDescription v-if="description">{{ description }}</DialogDescription>
    </DialogHeader>

    <div class="min-w-0">
      <slot />
    </div>

    <DialogFooter v-if="$slots.footer">
      <slot name="footer" />
    </DialogFooter>
  </DialogContent>
</template>
