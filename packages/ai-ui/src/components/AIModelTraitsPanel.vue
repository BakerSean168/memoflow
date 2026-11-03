<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import type { LocalAgentModelOptions } from '@memoflow/ai-contracts';
import type { ComposerModel } from '../composables/useAIModelCatalog';

const props = defineProps<{
  model?: ComposerModel | null;
  reasoningEfforts?: string[];
  selectedEffort: string;
  disabled: boolean;
  /** Explains why the browsed model's levels cannot be changed yet. */
  lockedHint?: string;
}>();
const emit = defineEmits<{
  modelOption: [kind: keyof LocalAgentModelOptions, value?: string];
}>();
const { t } = useI18n();
const panel = ref<HTMLElement | null>(null);
const efforts = computed(() =>
  (props.reasoningEfforts?.length ?? 0) > 1 ? (props.reasoningEfforts ?? []) : [],
);
const rowsDisabled = computed(() => props.disabled || Boolean(props.lockedHint));

function effortLabel(effort: string): string {
  if (effort === 'xhigh') return 'Extra High';
  if (effort === 'super-high') return 'Super High';
  return effort.charAt(0).toUpperCase() + effort.slice(1).split('-').join(' ');
}
function choose(kind: keyof LocalAgentModelOptions, value: string) {
  if (rowsDisabled.value) return;
  emit('modelOption', kind, value);
}
/** The column's one tab stop: the selected level, else the first enabled one. */
function focusSelected() {
  const rows = Array.from(
    panel.value?.querySelectorAll<HTMLButtonElement>('[data-effort-row]:not(:disabled)') ?? [],
  );
  const target = rows.find((row) => row.getAttribute('aria-checked') === 'true') ?? rows[0] ?? null;
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: 'nearest' });
}
defineExpose({ focusSelected });
function moveBetweenRows(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const rows = Array.from(
    (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(
      '[data-effort-row]:not(:disabled)',
    ),
  );
  const index = rows.findIndex((row) => row === document.activeElement);
  const next =
    rows[Math.min(rows.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
  if (!next) return;
  event.preventDefault();
  event.stopPropagation();
  next.focus();
}
</script>

<template>
  <aside
    ref="panel"
    class="flex w-48 shrink-0 flex-col border-l border-border/65 bg-muted/40"
    :aria-label="t('aiAssistant.composer.modelOptions')"
    data-testid="ai-model-picker-options"
  >
    <header class="flex h-11 shrink-0 items-center gap-2 border-b border-border/65 px-3">
      <span class="shrink-0 text-xs font-medium text-muted-foreground">{{
        t('aiAssistant.composer.reasoningEffort')
      }}</span>
      <span
        class="min-w-0 flex-1 truncate text-right text-[10px] text-muted-foreground"
        data-testid="ai-traits-model"
        >{{ model?.modelName ?? '' }}</span
      >
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5" @keydown="moveBetweenRows">
      <p
        v-if="lockedHint"
        class="px-2 pb-1.5 text-[10px] leading-relaxed text-muted-foreground"
        data-testid="ai-traits-locked"
      >
        {{ lockedHint }}
      </p>
      <div
        v-if="efforts.length"
        class="flex flex-col gap-0.5"
        role="radiogroup"
        :aria-label="t('aiAssistant.composer.reasoningEffort')"
      >
        <button
          v-for="effort in efforts"
          :key="effort"
          type="button"
          data-effort-row
          data-effort-level
          class="flex h-8 w-full shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-xs outline-none hover:bg-foreground/10 focus-visible:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45"
          :class="
            selectedEffort === effort ? 'bg-muted/55 text-foreground' : 'text-muted-foreground'
          "
          role="radio"
          :aria-checked="selectedEffort === effort"
          :aria-pressed="selectedEffort === effort"
          :disabled="rowsDisabled"
          :data-testid="'ai-traits-effort-' + effort"
          @click="choose('reasoningEffort', effort)"
        >
          <span class="min-w-0 flex-1 truncate">{{ effortLabel(effort) }}</span>
          <Check v-if="selectedEffort === effort" class="size-3.5 shrink-0" />
        </button>
      </div>
      <div
        v-else
        class="flex h-8 items-center px-2 text-xs text-muted-foreground"
        role="status"
        data-testid="ai-traits-empty"
      >
        {{ t('aiAssistant.composer.noEffortLevels') }}
      </div>
    </div>
  </aside>
</template>
