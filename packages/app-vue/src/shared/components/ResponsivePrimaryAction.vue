<script setup lang="ts">
import type { Component } from 'vue';
import { Button } from '@memoflow/ui-vue-shadcn';

defineOptions({ inheritAttrs: false });

defineProps<{
  label: string;
  icon: Component;
  disabled?: boolean;
}>();
</script>

<template>
  <Button
    v-bind="$attrs"
    type="button"
    size="icon"
    class="h-8 w-8 shrink-0 rounded-md p-0 shadow-sm shadow-primary/15"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
  >
    <component :is="icon" class="h-4 w-4" aria-hidden="true" />
  </Button>
</template>
