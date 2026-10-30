<template>
  <section class="mb-2 min-w-0 text-xs text-muted-foreground" data-testid="ai-agent-activity">
    <p role="status" aria-live="polite" aria-atomic="true" data-testid="ai-agent-phase">
      {{ t(`aiAssistant.activity.${activity.phase}`) }}
      <span v-if="delay"> · {{ t(`aiAssistant.activity.${delay}`) }}</span>
    </p>
    <ul
      v-if="activity.running.length && item.status === 'generating'"
      class="mt-1 max-h-24 overflow-y-auto"
      data-testid="ai-tool-activity"
      :aria-label="t('aiAssistant.activity.history')"
    >
      <li v-for="call in activity.running" :key="call.id" class="break-words">
        {{ toolLabel(call) }} ·
        {{ t(`aiAssistant.activity.${activity.phase === 'waiting' ? 'waiting' : 'running'}`) }}
      </li>
    </ul>
    <p v-if="activity.phase === 'waiting'" class="mt-1">
      {{ t('aiAssistant.activity.respond') }}
    </p>
    <p
      v-if="
        activity.phase !== 'waiting' &&
        (item.status === 'error' || item.status === 'interrupted' || failed)
      "
      class="mt-1"
      data-testid="ai-agent-recovery"
    >
      {{ t('aiAssistant.activity.recovery') }}
    </p>
    <details
      v-if="activity.records.length"
      class="mt-1"
      :open="failed"
      data-testid="ai-agent-history"
    >
      <summary
        class="cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        {{ t('aiAssistant.activity.history') }} ({{ activity.records.length }})
      </summary>
      <ol class="mt-1 max-h-48 space-y-1 overflow-y-auto">
        <li
          v-for="call in activity.records"
          :key="call.id"
          class="break-words"
          :class="call.state === 'failed' ? 'text-destructive' : ''"
          data-testid="ai-tool-history"
        >
          {{ toolLabel(call) }} · {{ t(`aiAssistant.activity.${call.state}`) }}
        </li>
      </ol>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ChatItem } from '../composables/types';
import { projectAgentActivity } from '../composables/agentActivity';

const props = defineProps<{ item: ChatItem }>();
const { t, te } = useI18n();
const activity = computed(() => projectAgentActivity(props.item));
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
let observedAt = Date.now();
watch(
  () => activity.value.active,
  (active) => {
    clearInterval(timer);
    timer = undefined;
    if (active) {
      observedAt = Date.now();
      now.value = observedAt;
      // UI silence indicator, never a claim of a provider heartbeat or automatic timeout.
      timer = setInterval(() => {
        now.value = Date.now();
      }, 5000);
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => clearInterval(timer));
const delay = computed(() => {
  if (!activity.value.active) return '';
  const elapsed = now.value - (props.item.activityUpdatedAt ?? observedAt);
  return elapsed >= 120_000 ? 'silentLong' : elapsed >= 30_000 ? 'silent' : '';
});
const failed = computed(() => activity.value.records.some((call) => call.state === 'failed'));
function toolLabel(call: ReturnType<typeof projectAgentActivity>['records'][number]) {
  const key = `aiAssistant.chatPage.tools.capabilities.${call.name}`;
  return call.builtin && te(key) ? t(key) : call.name || t('aiAssistant.activity.tool');
}
</script>
