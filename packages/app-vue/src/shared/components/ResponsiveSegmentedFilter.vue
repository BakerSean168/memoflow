<template>
  <div class="shrink-0" :data-testid="testId">
    <ToggleGroup
      type="single"
      :model-value="modelValue"
      :class="[
        'items-center justify-start gap-0.5 rounded-lg bg-[hsl(var(--surface-raised)/0.5)] p-0.5 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.42)]',
        collapseMode === 'dropdown' ? 'hidden @2xl/panel:flex' : 'flex',
      ]"
      :aria-label="accessibleLabel"
      :role="optionRole === 'tab' ? 'tablist' : undefined"
      :data-testid="testId ? `${testId}-expanded` : undefined"
      @update:model-value="handleUpdate"
    >
      <ToggleGroupItem
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        size="sm"
        class="h-7 rounded-md px-2.5 text-xs font-normal text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--hover))] hover:text-foreground data-[state=on]:bg-[hsl(var(--surface-overlay))] data-[state=on]:text-foreground data-[state=on]:shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.62)]"
        :disabled="disabled || option.disabled"
        :role="optionRole"
        :aria-selected="optionRole === 'tab' ? modelValue === option.value : undefined"
        :data-testid="
          expandedOptionTestIdPrefix
            ? `${expandedOptionTestIdPrefix}-${option.value}`
            : testId
              ? `${testId}-expanded-${option.value}`
              : undefined
        "
      >
        <span>{{ option.label }}</span>
        <span
          v-if="option.count !== undefined"
          :data-testid="option.countTestId"
          class="ml-1 min-w-4 text-center text-[10px] tabular-nums opacity-65"
        >
          {{ option.count }}
        </span>
      </ToggleGroupItem>
    </ToggleGroup>

    <DropdownMenu v-if="collapseMode === 'dropdown'">
      <DropdownMenuTrigger as-child>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-8 max-w-40 gap-1.5 px-2 text-muted-foreground @2xl/panel:hidden"
          :disabled="disabled"
          :aria-label="accessibleLabel"
          :data-testid="testId ? `${testId}-compact` : undefined"
        >
          <ListFilter class="h-3.5 w-3.5 shrink-0" />
          <span class="truncate text-foreground">{{ currentLabel }}</span>
          <span
            v-if="currentOption?.count !== undefined"
            class="text-[10px] tabular-nums text-muted-foreground"
          >
            {{ currentOption.count }}
          </span>
          <ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-44">
        <DropdownMenuRadioGroup :model-value="modelValue" @update:model-value="handleUpdate">
          <DropdownMenuRadioItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :disabled="disabled || option.disabled"
            :data-testid="testId ? `${testId}-compact-${option.value}` : undefined"
          >
            <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
            <span
              v-if="option.count !== undefined"
              class="ml-2 text-[10px] tabular-nums text-muted-foreground"
            >
              {{ option.count }}
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChevronDown, ListFilter } from '@lucide/vue';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  ToggleGroup,
  ToggleGroupItem,
} from '@memoflow/ui-vue-shadcn';
import type { ResponsiveSegmentedFilterOption } from './responsive-segmented-filter.types';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: readonly ResponsiveSegmentedFilterOption[];
    accessibleLabel: string;
    testId?: string;
    disabled?: boolean;
    collapseMode?: 'dropdown' | 'none';
    expandedOptionTestIdPrefix?: string;
    optionRole?: 'tab';
  }>(),
  {
    testId: undefined,
    disabled: false,
    collapseMode: 'dropdown',
    expandedOptionTestIdPrefix: undefined,
    optionRole: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const currentOption = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
);
const currentLabel = computed(() => currentOption.value?.label ?? props.modelValue);

function handleUpdate(value: unknown): void {
  if (typeof value !== 'string' || !value || value === props.modelValue) return;
  if (!props.options.some((option) => option.value === value && !option.disabled)) return;
  emit('update:modelValue', value);
}
</script>
