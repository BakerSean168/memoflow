<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, ChevronsUpDown, Tag } from '@lucide/vue';
import { Badge, Button, Popover, PopoverContent, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import LabelCommandPanel from './LabelCommandPanel.vue';
import type { LabelPickerOption } from './label-selection.types';

const props = withDefaults(
  defineProps<{
    modelValue: readonly string[];
    options: readonly LabelPickerOption[];
    disabled?: boolean;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    createLabel?: string;
    allowCreate?: boolean;
    compact?: boolean;
    maxSummaryItems?: number;
    ariaLabel?: string;
  }>(),
  {
    disabled: false,
    placeholder: 'Select labels',
    searchPlaceholder: 'Search labels…',
    emptyText: 'No labels found',
    createLabel: 'Create label',
    allowCreate: true,
    compact: false,
    maxSummaryItems: 2,
    ariaLabel: 'Select labels',
  },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: string[]): void;
  (event: 'create', name: string): void;
}>();

const open = ref(false);
const optionById = computed(() => new Map(props.options.map((option) => [option.id, option])));
const selectedOptions = computed(() =>
  props.modelValue
    .map((id) => optionById.value.get(id))
    .filter((option): option is LabelPickerOption => option != null),
);
const summaryLimit = computed(() => Math.max(1, props.compact ? 1 : props.maxSummaryItems));
const visibleOptions = computed(() => selectedOptions.value.slice(0, summaryLimit.value));
const hiddenCount = computed(() =>
  Math.max(0, props.modelValue.length - visibleOptions.value.length),
);
const hasSelection = computed(() => props.modelValue.length > 0);

function updateSelection(value: string[]): void {
  emit('update:modelValue', value);
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        type="button"
        variant="outline"
        class="min-w-0 justify-between gap-2"
        :class="
          compact
            ? 'h-8 w-auto max-w-56 rounded-md border-transparent bg-muted/40 px-2.5 font-normal shadow-none hover:bg-muted/70'
            : 'w-full'
        "
        role="combobox"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-label="ariaLabel"
        :disabled="disabled"
        data-testid="label-picker-trigger"
      >
        <span
          v-if="!hasSelection"
          class="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground"
        >
          <Tag v-if="compact" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ placeholder }}</span>
        </span>
        <span v-else class="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-left">
          <span
            v-for="option in visibleOptions"
            :key="option.id"
            class="inline-flex min-w-0 items-center gap-1 truncate"
          >
            <span
              v-if="option.color"
              class="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              :style="{ backgroundColor: option.color }"
              aria-hidden="true"
            />
            <span class="truncate">{{ option.name }}</span>
          </span>
          <span v-if="visibleOptions.length === 0" class="truncate">
            {{ modelValue.length }} selected
          </span>
          <Badge v-if="hiddenCount > 0" variant="secondary" class="shrink-0 px-1.5 py-0">
            +{{ hiddenCount }}
          </Badge>
        </span>
        <ChevronDown v-if="compact" class="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
        <ChevronsUpDown v-else class="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-80 max-w-[calc(100vw-2rem)] p-0">
      <LabelCommandPanel
        :model-value="modelValue"
        :options="options"
        :disabled="disabled"
        :allow-create="allowCreate"
        :search-placeholder="searchPlaceholder"
        :empty-text="emptyText"
        :create-label="createLabel"
        @update:model-value="updateSelection"
        @create="emit('create', $event)"
      />
    </PopoverContent>
  </Popover>
</template>
