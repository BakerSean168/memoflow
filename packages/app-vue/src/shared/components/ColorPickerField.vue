<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        :variant="buttonVariant"
        :class="buttonClass"
        :aria-label="ariaLabel || selectedColorLabel"
      >
        <div class="h-4 w-4 rounded-full border" :style="{ backgroundColor: selectedColorValue }" />
        <span class="truncate">{{ selectedColorLabel }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-64 p-3" align="start">
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="flex h-10 items-center justify-center rounded-lg border-2 transition-transform hover:scale-[1.03]"
          :class="
            modelValue === option.value
              ? 'border-primary ring-2 ring-primary/20'
              : 'border-transparent'
          "
          :style="{ backgroundColor: option.value }"
          :title="t(option.labelKey)"
          @click="emit('update:modelValue', option.value)"
        >
          <span class="sr-only">{{ t(option.labelKey) }}</span>
        </button>
      </div>
      <Button
        v-if="allowClear"
        variant="ghost"
        size="sm"
        class="mt-2 w-full"
        @click="emit('update:modelValue', null)"
      >
        {{ clearLabel }}
      </Button>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import {
  defaultNamedColor,
  findNamedColor,
  namedColorOptions,
  type NamedColorOption,
} from '../constants/color-palette';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    options?: NamedColorOption[];
    buttonClass?: string;
    buttonVariant?: 'default' | 'outline' | 'ghost' | 'secondary';
    emptyLabel?: string;
    clearLabel?: string;
    defaultValue?: string;
    allowClear?: boolean;
    ariaLabel?: string;
  }>(),
  {
    modelValue: null,
    options: () => namedColorOptions,
    buttonClass: 'h-10 w-full justify-start gap-2',
    buttonVariant: 'outline',
    emptyLabel: '',
    clearLabel: '',
    defaultValue: defaultNamedColor,
    allowClear: true,
    ariaLabel: '',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
}>();

const selectedOption = computed(() => findNamedColor(props.modelValue) ?? null);
const selectedColorValue = computed(() => selectedOption.value?.value ?? props.defaultValue);
const selectedColorLabel = computed(() => {
  if (selectedOption.value) return t(selectedOption.value.labelKey);
  return props.emptyLabel;
});
</script>
