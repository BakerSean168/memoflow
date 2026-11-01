<script setup lang="ts">
import { Check } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import type { LocalAgentModelOptions } from '@memoflow/ai-contracts';

const props = defineProps<{
  reasoningEfforts?: string[];
  serviceTiers?: { id: string; name: string }[];
  selectedEffort: string;
  selectedServiceTier: string;
  disabled: boolean;
}>();
const emit = defineEmits<{
  modelOption: [kind: keyof LocalAgentModelOptions, value?: string];
}>();
const { t } = useI18n();
function effortLabel(effort: string): string {
  if (effort === 'xhigh') return 'Extra High';
  if (effort === 'super-high') return 'Super High';
  return effort.charAt(0).toUpperCase() + effort.slice(1).split('-').join(' ');
}
function choose(kind: keyof LocalAgentModelOptions, value: string) {
  if (!props.disabled) emit('modelOption', kind, value);
}
</script>

<template>
  <aside
    class="flex w-[clamp(7.5rem,30%,10.5rem)] shrink-0 flex-col overflow-y-auto border-l border-border/65"
    :aria-label="t('aiAssistant.composer.modelOptions')"
    data-testid="ai-model-picker-options"
  >
    <header
      class="sticky top-0 z-10 border-b border-border/65 bg-[hsl(var(--surface-overlay))] px-3 py-3 text-xs font-medium text-muted-foreground"
    >
      {{ t('aiAssistant.composer.modelOptions') }}
    </header>
    <div class="space-y-3 p-2">
      <section v-if="(reasoningEfforts?.length ?? 0) > 1">
        <h3 class="px-1 pb-1 text-[11px] font-medium text-muted-foreground">
          {{ t('aiAssistant.composer.reasoningEffort') }}
        </h3>
        <button
          v-for="effort in reasoningEfforts"
          :key="effort"
          type="button"
          class="flex w-full items-center justify-between gap-1 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          :class="
            selectedEffort === effort ? 'bg-muted/55 text-foreground' : 'text-muted-foreground'
          "
          :disabled="disabled"
          :aria-pressed="selectedEffort === effort"
          :data-testid="'ai-traits-effort-' + effort"
          @click="choose('reasoningEffort', effort)"
        >
          <span class="truncate">{{ effortLabel(effort) }}</span>
          <Check v-if="selectedEffort === effort" class="size-3.5 shrink-0" />
        </button>
      </section>
      <section v-if="serviceTiers?.length">
        <h3 class="px-1 pb-1 text-[11px] font-medium text-muted-foreground">
          {{ t('aiAssistant.composer.serviceTier') }}
        </h3>
        <button
          type="button"
          class="flex w-full items-center justify-between gap-1 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/70 disabled:opacity-50"
          :class="
            selectedServiceTier === 'default'
              ? 'bg-muted/55 text-foreground'
              : 'text-muted-foreground'
          "
          :disabled="disabled"
          :aria-pressed="selectedServiceTier === 'default'"
          data-testid="ai-traits-tier-default"
          @click="choose('serviceTier', 'default')"
        >
          <span>{{ t('aiAssistant.composer.defaultOptions') }}</span>
          <Check v-if="selectedServiceTier === 'default'" class="size-3.5 shrink-0" />
        </button>
        <button
          v-for="tier in serviceTiers"
          :key="tier.id"
          type="button"
          class="flex w-full items-center justify-between gap-1 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/70 disabled:opacity-50"
          :class="
            selectedServiceTier === tier.id
              ? 'bg-muted/55 text-foreground'
              : 'text-muted-foreground'
          "
          :disabled="disabled"
          :aria-pressed="selectedServiceTier === tier.id"
          :data-testid="'ai-traits-tier-' + tier.id"
          @click="choose('serviceTier', tier.id)"
        >
          <span class="truncate">{{ tier.name }}</span>
          <Check v-if="selectedServiceTier === tier.id" class="size-3.5 shrink-0" />
        </button>
      </section>
    </div>
  </aside>
</template>
