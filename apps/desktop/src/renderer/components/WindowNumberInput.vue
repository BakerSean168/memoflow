<script setup lang="ts">
// Standalone windows use small control atoms without loading the authenticated shell.
const value = defineModel<number | string>({ required: true });
</script>

<template>
  <input
    v-model.number="value"
    type="number"
    class="h-7 min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
  />
</template>
