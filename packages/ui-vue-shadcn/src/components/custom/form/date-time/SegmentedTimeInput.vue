<script setup lang="ts">
import { computed, nextTick, ref, watch, type HTMLAttributes } from 'vue';
import { cn } from '../../../../lib/utils';
import type { SegmentedTimeDraft, TimeSegment } from './types';

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    withSeconds?: boolean;
    disabled?: boolean;
    invalid?: boolean;
    restoreInvalidOnBlur?: boolean;
    label?: string;
    hourLabel?: string;
    minuteLabel?: string;
    secondLabel?: string;
    ariaDescribedby?: string;
    testId?: string;
    inputClass?: HTMLAttributes['class'];
    syncKey?: number | string;
  }>(),
  {
    modelValue: '',
    withSeconds: false,
    disabled: false,
    invalid: false,
    restoreInvalidOnBlur: true,
    label: 'Time',
    hourLabel: 'Hour',
    minuteLabel: 'Minute',
    secondLabel: 'Second',
    ariaDescribedby: undefined,
    testId: 'segmented-time-input',
    inputClass: undefined,
    syncKey: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:draft': [draft: SegmentedTimeDraft];
  commit: [value: string];
}>();

const hourDraft = ref('');
const minuteDraft = ref('');
const secondDraft = ref('00');

const hourInputRef = ref<HTMLInputElement | null>(null);
const minuteInputRef = ref<HTMLInputElement | null>(null);
const secondInputRef = ref<HTMLInputElement | null>(null);

let selectAllOnMouseUp = false;
let lastEmittedModelValue: string | null = null;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function parseClockPart(raw: string, max: number): number | null {
  if (!/^\d{1,2}$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= max ? value : null;
}

function splitModelValue(raw: string | null | undefined, withSeconds: boolean) {
  const value = (raw ?? '').trim();
  const match = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(value);
  if (!match) {
    return { hour: '', minute: '', second: withSeconds ? '' : '00' };
  }
  const h = parseClockPart(match[1]!, 23);
  const m = parseClockPart(match[2]!, 59);
  const s = match[3] != null ? parseClockPart(match[3], 59) : withSeconds ? null : 0;
  if (h == null || m == null || (withSeconds && match[3] != null && s == null)) {
    return { hour: '', minute: '', second: withSeconds ? '' : '00' };
  }
  return {
    hour: pad2(h),
    minute: pad2(m),
    second: withSeconds ? (s != null ? pad2(s) : '') : '00',
  };
}

const parsedHour = computed(() => parseClockPart(hourDraft.value, 23));
const parsedMinute = computed(() => parseClockPart(minuteDraft.value, 59));
const parsedSecond = computed(() =>
  props.withSeconds ? parseClockPart(secondDraft.value, 59) : 0,
);

const allValid = computed(
  () => parsedHour.value != null && parsedMinute.value != null && parsedSecond.value != null,
);

const formattedNormalized = computed<string | null>(() => {
  if (!allValid.value) return null;
  const base = `${pad2(parsedHour.value!)}:${pad2(parsedMinute.value!)}`;
  return props.withSeconds ? `${base}:${pad2(parsedSecond.value!)}` : base;
});

function buildDraft(): SegmentedTimeDraft {
  return {
    hour: hourDraft.value,
    minute: minuteDraft.value,
    second: secondDraft.value,
    valid: allValid.value,
    value: formattedNormalized.value,
  };
}

function emitDraft(): void {
  emit('update:draft', buildDraft());
}

function syncFromModelValue(): void {
  const parts = splitModelValue(props.modelValue, props.withSeconds);
  hourDraft.value = parts.hour;
  minuteDraft.value = parts.minute;
  secondDraft.value = parts.second;
}

watch(
  [() => props.modelValue, () => props.withSeconds, () => props.syncKey],
  ([nextModelValue, , nextSyncKey], prev) => {
    const syncKeyChanged = prev != null && nextSyncKey !== prev[2];
    if (!syncKeyChanged && prev != null) {
      if (
        lastEmittedModelValue !== null &&
        nextModelValue === lastEmittedModelValue &&
        nextModelValue === formattedNormalized.value
      ) {
        lastEmittedModelValue = null;
        return;
      }
    }
    lastEmittedModelValue = null;
    syncFromModelValue();
    emitDraft();
  },
  { immediate: true },
);

const segments = computed<TimeSegment[]>(() =>
  props.withSeconds ? ['hour', 'minute', 'second'] : ['hour', 'minute'],
);

function maxFor(segment: TimeSegment): number {
  return segment === 'hour' ? 23 : 59;
}

function draftRefFor(segment: TimeSegment) {
  if (segment === 'hour') return hourDraft;
  if (segment === 'minute') return minuteDraft;
  return secondDraft;
}

function inputElFor(segment: TimeSegment): HTMLInputElement | null {
  if (segment === 'hour') return hourInputRef.value;
  if (segment === 'minute') return minuteInputRef.value;
  return secondInputRef.value;
}

function isSegmentValid(segment: TimeSegment): boolean {
  if (segment === 'hour') return parsedHour.value != null;
  if (segment === 'minute') return parsedMinute.value != null;
  return parsedSecond.value != null;
}

function commitNormalized(): string | null {
  if (props.disabled) return null;
  const normalized = formattedNormalized.value;
  if (!normalized) return null;
  lastEmittedModelValue = normalized;
  if (normalized !== props.modelValue) {
    emit('update:modelValue', normalized);
  }
  emit('commit', normalized);
  return normalized;
}

function focusSegment(segment: TimeSegment): void {
  const el = inputElFor(segment);
  if (!el) return;
  el.focus();
  el.select();
}

function tryApplyFullTimeString(raw: string): boolean {
  const trimmed = raw.trim();
  const match = props.withSeconds
    ? /^(\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(trimmed)
    : /^(\d{1,2}):(\d{1,2})$/.exec(trimmed);
  if (!match) return false;
  const h = parseClockPart(match[1]!, 23);
  const m = parseClockPart(match[2]!, 59);
  const s = props.withSeconds ? parseClockPart(match[3]!, 59) : 0;
  if (h == null || m == null || s == null) return false;

  hourDraft.value = pad2(h);
  minuteDraft.value = pad2(m);
  if (props.withSeconds) secondDraft.value = pad2(s);
  emitDraft();
  commitNormalized();
  return true;
}

function handleFocus(event: FocusEvent): void {
  if (props.disabled) return;
  selectAllOnMouseUp = true;
  (event.target as HTMLInputElement).select();
}

function handleMouseUp(event: MouseEvent): void {
  if (!selectAllOnMouseUp) return;
  selectAllOnMouseUp = false;
  const target = event.target as HTMLInputElement;
  if (target.selectionStart === target.selectionEnd) {
    target.select();
  }
}

function handleInput(segment: TimeSegment, event: Event): void {
  if (props.disabled) return;
  const target = event.target as HTMLInputElement;
  const raw = target.value;

  if (raw.includes(':') && tryApplyFullTimeString(raw)) {
    const last = segments.value[segments.value.length - 1]!;
    void nextTick(() => focusSegment(last));
    return;
  }

  const draft = draftRefFor(segment);
  draft.value = raw;
  emitDraft();

  const isDelete =
    typeof InputEvent !== 'undefined' &&
    event instanceof InputEvent &&
    event.inputType?.startsWith('delete');
  const max = maxFor(segment);
  const parsed = parseClockPart(raw, max);

  if (!isDelete && /^\d{2}$/.test(raw) && parsed != null) {
    commitNormalized();
    const index = segments.value.indexOf(segment);
    if (index >= 0 && index < segments.value.length - 1) {
      const nextSegment = segments.value[index + 1]!;
      void nextTick(() => focusSegment(nextSegment));
    }
  }
}

function handleBlur(segment: TimeSegment): void {
  selectAllOnMouseUp = false;
  if (props.disabled) return;

  const draft = draftRefFor(segment);
  const parsed = parseClockPart(draft.value, maxFor(segment));
  if (parsed != null) {
    const padded = pad2(parsed);
    if (draft.value !== padded) {
      draft.value = padded;
      emitDraft();
    }
    commitNormalized();
    return;
  }

  if (props.restoreInvalidOnBlur) {
    const committed = splitModelValue(props.modelValue, props.withSeconds);
    draft.value = committed[segment];
    emitDraft();
  }
}

function step(segment: TimeSegment, delta: number): void {
  if (props.disabled) return;
  const range = segment === 'hour' ? 24 : 60;
  const max = range - 1;
  const draft = draftRefFor(segment);
  const committed = parseClockPart(
    splitModelValue(props.modelValue, props.withSeconds)[segment],
    max,
  );
  const current = parseClockPart(draft.value, max) ?? committed ?? 0;
  const next = (current + delta + range) % range;
  draft.value = pad2(next);
  emitDraft();
  commitNormalized();
  void nextTick(() => inputElFor(segment)?.select());
}

function commitDraft(): string | null {
  if (props.disabled) return null;
  let changed = false;
  const committed = splitModelValue(props.modelValue, props.withSeconds);
  for (const segment of segments.value) {
    const draft = draftRefFor(segment);
    const parsed = parseClockPart(draft.value, maxFor(segment));
    if (parsed != null) {
      const padded = pad2(parsed);
      if (draft.value !== padded) {
        draft.value = padded;
        changed = true;
      }
    } else if (props.restoreInvalidOnBlur && draft.value !== committed[segment]) {
      draft.value = committed[segment];
      changed = true;
    }
  }
  if (changed) emitDraft();
  return commitNormalized();
}

function handleKeydown(segment: TimeSegment, event: KeyboardEvent): void {
  if (props.disabled) return;

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    step(segment, 1);
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    step(segment, -1);
    return;
  }
  if (event.key === 'Enter') {
    commitDraft();
    return;
  }

  const target = event.target as HTMLInputElement;
  const index = segments.value.indexOf(segment);

  if (event.key === 'ArrowRight' && index < segments.value.length - 1) {
    const atEnd =
      target.selectionStart === target.value.length && target.selectionEnd === target.value.length;
    if (atEnd) {
      event.preventDefault();
      focusSegment(segments.value[index + 1]!);
    }
    return;
  }

  if (event.key === 'ArrowLeft' && index > 0) {
    const atStart = target.selectionStart === 0 && target.selectionEnd === 0;
    if (atStart) {
      event.preventDefault();
      focusSegment(segments.value[index - 1]!);
    }
    return;
  }

  if (event.key === 'Backspace' && index > 0 && target.value === '') {
    event.preventDefault();
    focusSegment(segments.value[index - 1]!);
  }
}

function handlePaste(event: ClipboardEvent): void {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  const text = event.clipboardData?.getData('text')?.trim() ?? '';
  if (!text.includes(':')) return;
  if (tryApplyFullTimeString(text)) {
    event.preventDefault();
    const last = segments.value[segments.value.length - 1]!;
    void nextTick(() => focusSegment(last));
  }
}

const segmentClass = computed(() =>
  cn(
    'flex h-8 w-11 rounded-md border border-input bg-background px-1 py-1 text-center text-sm tabular-nums shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
    props.inputClass,
  ),
);

defineExpose({
  commitDraft,
  focus: (segment: TimeSegment = 'hour') => focusSegment(segment),
});
</script>

<template>
  <div class="flex items-center gap-1.5" role="group" :aria-label="label" :data-testid="testId">
    <input
      ref="hourInputRef"
      :value="hourDraft"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :class="segmentClass"
      :aria-label="hourLabel"
      :aria-invalid="invalid || !isSegmentValid('hour') ? 'true' : 'false'"
      :aria-describedby="ariaDescribedby"
      :disabled="disabled"
      :data-testid="`${testId}-hour`"
      @focus="handleFocus"
      @mouseup="handleMouseUp"
      @input="handleInput('hour', $event)"
      @blur="handleBlur('hour')"
      @keydown="handleKeydown('hour', $event)"
      @paste="handlePaste"
    />
    <span aria-hidden="true" class="text-sm font-medium text-muted-foreground">:</span>
    <input
      ref="minuteInputRef"
      :value="minuteDraft"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      :class="segmentClass"
      :aria-label="minuteLabel"
      :aria-invalid="invalid || !isSegmentValid('minute') ? 'true' : 'false'"
      :aria-describedby="ariaDescribedby"
      :disabled="disabled"
      :data-testid="`${testId}-minute`"
      @focus="handleFocus"
      @mouseup="handleMouseUp"
      @input="handleInput('minute', $event)"
      @blur="handleBlur('minute')"
      @keydown="handleKeydown('minute', $event)"
      @paste="handlePaste"
    />
    <template v-if="withSeconds">
      <span aria-hidden="true" class="text-sm font-medium text-muted-foreground">:</span>
      <input
        ref="secondInputRef"
        :value="secondDraft"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        :class="segmentClass"
        :aria-label="secondLabel"
        :aria-invalid="invalid || !isSegmentValid('second') ? 'true' : 'false'"
        :aria-describedby="ariaDescribedby"
        :disabled="disabled"
        :data-testid="`${testId}-second`"
        @focus="handleFocus"
        @mouseup="handleMouseUp"
        @input="handleInput('second', $event)"
        @blur="handleBlur('second')"
        @keydown="handleKeydown('second', $event)"
        @paste="handlePaste"
      />
    </template>
  </div>
</template>
