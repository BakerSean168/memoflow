<template>
  <div
    class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 py-1.5"
    data-slot="product-metadata-row"
  >
    <div
      class="pt-1.5 text-xs font-medium text-muted-foreground"
      data-slot="product-metadata-label"
    >
      <slot name="label">{{ label }}</slot>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label?: string;
}>();
</script>
