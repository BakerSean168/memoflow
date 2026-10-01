<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, Globe } from '@lucide/vue';
import { parseTimeZoneId, type TimeZoneId } from '@memoflow/contracts/primitives';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@memoflow/ui-vue-shadcn';
import ProductPropertyChip from './ProductPropertyChip.vue';
import { getProductTime, productTimeRevision } from '../utils/product-time';
import { humanizeTimeZone, productTimeZoneOptions } from '../utils/product-time-zone-options';

const props = withDefaults(
  defineProps<{
    modelValue: TimeZoneId | string;
    label?: string;
    productZoneLabel?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    disabled?: boolean;
    testId?: string;
  }>(),
  {
    label: 'Time zone',
    productZoneLabel: 'Product Time zone',
    searchPlaceholder: 'Search time zones…',
    emptyText: 'No time zones found',
    disabled: false,
    testId: 'product-time-zone-selector',
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: TimeZoneId] }>();
const open = ref(false);
const productZone = computed(() => {
  void productTimeRevision.value;
  return getProductTime().context.timeZone;
});
const options = computed(() => productTimeZoneOptions(productZone.value, props.modelValue));

function select(value: unknown): void {
  if (props.disabled || typeof value !== 'string' || !options.value.includes(value as TimeZoneId))
    return;
  const zone = parseTimeZoneId(value);
  if (!zone) return;
  emit('update:modelValue', zone);
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <ProductPropertyChip :disabled="disabled" :aria-label="label" :data-testid="testId">
        <template #icon><Globe class="h-3.5 w-3.5" /></template>
        <span class="max-w-52 truncate">{{ modelValue }}</span>
        <span v-if="modelValue === productZone" class="text-xs text-muted-foreground">{{
          productZoneLabel
        }}</span>
      </ProductPropertyChip>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-80 max-w-[calc(100vw-1rem)] p-0">
      <Command :model-value="modelValue" :disabled="disabled" @update:model-value="select">
        <CommandInput
          :placeholder="searchPlaceholder"
          :aria-label="label"
          :disabled="disabled"
          :data-testid="`${testId}-search`"
        />
        <CommandList class="max-h-64">
          <CommandEmpty>{{ emptyText }}</CommandEmpty>
          <CommandGroup>
            <CommandItem
              v-for="zone in options"
              :key="zone"
              :value="zone"
              :text-value="`${zone} ${humanizeTimeZone(zone)}`"
              :disabled="disabled"
              :data-zone-id="zone"
              class="gap-2"
            >
              <Check
                class="h-4 w-4 shrink-0"
                :class="modelValue === zone ? 'opacity-100' : 'opacity-0'"
                aria-hidden="true"
              />
              <span class="min-w-0">
                <span class="block text-sm">{{ humanizeTimeZone(zone) }}</span>
                <span class="block text-xs text-muted-foreground"
                  >{{ zone
                  }}<template v-if="zone === productZone"> · {{ productZoneLabel }}</template></span
                >
              </span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
