<template>
  <button
    type="button"
    class="group block w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[hsl(var(--hover)/0.6)]"
    :class="
      selected
        ? 'bg-[hsl(var(--selected)/0.82)] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.42)]'
        : 'text-foreground'
    "
    :aria-current="selected ? 'true' : undefined"
    data-testid="document-catalog-row"
    @click="emit('activate')"
  >
    <div class="flex min-w-0 items-center gap-1.5">
      <slot name="icon" />
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-medium leading-5">
          <slot />
        </div>
        <div v-if="$slots.meta" class="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
          <slot name="meta" />
        </div>
      </div>
      <div v-if="$slots.trailing" class="shrink-0">
        <slot name="trailing" />
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    selected?: boolean;
  }>(),
  {
    selected: false,
  },
);

const emit = defineEmits<{
  activate: [];
}>();
</script>
