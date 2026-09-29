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
    size="sm"
    class="h-8 shrink-0 px-2 shadow-sm shadow-primary/15 @2xl/panel:px-3"
    :aria-label="label"
    :disabled="disabled"
  >
    <component :is="icon" class="h-4 w-4 @2xl/panel:mr-1.5" />
    <span class="hidden @2xl/panel:inline">{{ label }}</span>
  </Button>
</template>
