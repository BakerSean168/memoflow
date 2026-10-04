<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, Tags } from '@lucide/vue';
import { Badge, Button, Popover, PopoverContent, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import LabelCommandPanel from './LabelCommandPanel.vue';
import type { LabelPickerOption } from './label-selection.types';

const props = withDefaults(
  defineProps<{
    modelValue: readonly string[];
    options: readonly LabelPickerOption[];
    disabled?: boolean;
    label?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    clearLabel?: string;
    selectionHint?: string;
    compact?: boolean;
    ariaLabel?: string;
  }>(),
  {
    disabled: false,
    label: 'Labels',
    searchPlaceholder: 'Search labels…',
    emptyText: 'No labels found',
    clearLabel: 'Clear',
    selectionHint: 'Matches all selected labels',
    compact: false,
    ariaLabel: 'Filter by labels',
  },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: string[]): void;
}>();

const open = ref(false);
const selectedCount = computed(() => props.modelValue.length);

function clearSelection(): void {
  emit('update:modelValue', []);
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        :variant="compact ? 'ghost' : 'outline'"
        :size="compact ? 'sm' : 'default'"
        :class="compact ? 'h-8 max-w-44 gap-1.5 px-2' : 'gap-1.5'"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-label="ariaLabel"
        :disabled="disabled"
        data-testid="label-filter-trigger"
      >
        <Tags class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span class="min-w-0 truncate text-foreground">{{ label }}</span>
        <Badge v-if="selectedCount > 0" variant="secondary" class="px-1.5 py-0">
          {{ selectedCount }}
        </Badge>
        <ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-80 max-w-[calc(100vw-2rem)] p-0">
      <LabelCommandPanel
        :model-value="modelValue"
        :options="options"
        :disabled="disabled"
        :allow-create="false"
        :search-placeholder="searchPlaceholder"
        :empty-text="emptyText"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <div class="flex items-center justify-between gap-3 border-t px-3 py-2">
        <span class="text-[11px] text-muted-foreground">{{ selectionHint }}</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          :disabled="disabled || selectedCount === 0"
          @click="clearSelection"
        >
          {{ clearLabel }}
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
