<template>
  <textarea
    ref="textareaElement"
    :value="modelValue"
    :placeholder="placeholder"
    :rows="rows"
    :aria-invalid="ariaInvalid || undefined"
    class="block w-full resize-none overflow-hidden border-0 bg-transparent px-0 py-1 shadow-none outline-none placeholder:text-muted-foreground focus-visible:bg-transparent focus-visible:outline-none focus-visible:ring-0"
    @input="handleInput"
    @compositionstart="composing = true"
    @compositionend="handleCompositionEnd"
  />
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    maxLength?: number;
    placeholder?: string;
    rows?: number;
    ariaInvalid?: boolean;
  }>(),
  {
    maxLength: undefined,
    placeholder: undefined,
    rows: 1,
    ariaInvalid: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'limit-exceeded': [limit: number];
}>();

const textareaElement = ref<HTMLTextAreaElement | null>(null);
const composing = ref(false);

function autoResize(): void {
  const el = textareaElement.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function commit(raw: string, target: HTMLTextAreaElement): void {
  const limit = props.maxLength;
  const value = limit !== undefined && raw.length > limit ? raw.slice(0, limit) : raw;
  if (value !== raw && limit !== undefined) emit('limit-exceeded', limit);
  if (target.value !== value) target.value = value;
  emit('update:modelValue', value);
  void nextTick(autoResize);
}

function handleInput(event: Event): void {
  if (composing.value) return;
  const target = event.target as HTMLTextAreaElement;
  commit(target.value, target);
}

function handleCompositionEnd(event: CompositionEvent): void {
  composing.value = false;
  commit((event.target as HTMLTextAreaElement).value, event.target as HTMLTextAreaElement);
}

watch(
  () => props.modelValue,
  () => void nextTick(autoResize),
);
onMounted(() => void nextTick(autoResize));

defineExpose({ autoResize });
</script>
