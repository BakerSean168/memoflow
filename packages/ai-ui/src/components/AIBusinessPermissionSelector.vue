<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import type { PermissionPreset, PermissionSnapshot } from '@memoflow/ai-contracts';
import { aiUiHost } from '../ai-ui-host';
const props = defineProps<{
  conversationId: string | null;
  agentId: string;
  disabled: boolean;
}>();
const local = inject(aiUiHost.AI_LOCAL_AGENT_KEY, undefined);
const { t } = useI18n();
const snapshot = ref<PermissionSnapshot>();
const temporary = ref<PermissionPreset | null>(null);
const busy = ref(false);
const error = ref(false);
const presets = ['read_only', 'confirm_each', 'on_demand', 'full_auto'] as const;
const current = computed(
  () =>
    temporary.value ??
    snapshot.value?.settings.agentPresets[props.agentId] ??
    snapshot.value?.settings.preset ??
    'on_demand',
);
let epoch = 0;
watch(
  () => props.conversationId,
  async (id, previous) => {
    const generation = ++epoch;
    const draftPreset = !previous ? temporary.value : null;
    temporary.value = draftPreset;
    if (!local) return;
    try {
      if (previous)
        await local.permissions({
          action: 'conversation',
          conversationId: previous,
          preset: null,
        });
      if (id && draftPreset)
        await local.permissions({
          action: 'conversation',
          conversationId: id,
          preset: draftPreset,
        });
      const next = await local.permissions({ action: 'snapshot' });
      if (generation === epoch) snapshot.value = next;
    } catch {
      if (generation === epoch) error.value = true;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  epoch++;
  if (local && props.conversationId)
    void local
      .permissions({ action: 'conversation', conversationId: props.conversationId, preset: null })
      .catch(() => undefined);
});
async function refresh() {
  if (!local) return;
  try {
    snapshot.value = await local.permissions({ action: 'snapshot' });
    error.value = false;
  } catch {
    error.value = true;
  }
}
async function select(preset: PermissionPreset) {
  if (!local || busy.value) return;
  if (!props.conversationId) {
    temporary.value = preset;
    return;
  }
  const id = props.conversationId;
  busy.value = true;
  error.value = false;
  try {
    const next = await local.permissions({
      action: 'conversation',
      conversationId: id,
      preset,
    });
    if (props.conversationId === id) {
      snapshot.value = next;
      temporary.value = preset;
    }
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <Popover v-if="local">
    <PopoverTrigger as-child
      ><button
        type="button"
        class="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted"
        :disabled="disabled || busy"
        data-testid="ai-chat-business-permission-selector"
        @click="refresh"
      >
        {{ t(`setting.permissions.presets.${current}`) }}
      </button></PopoverTrigger
    >
    <PopoverContent
      side="top"
      class="w-72 space-y-2 p-3"
      data-testid="ai-business-permission-picker"
    >
      <p class="text-sm font-medium">{{ t('setting.permissions.title') }}</p>
      <p class="text-xs text-muted-foreground">
        {{ t('setting.permissions.temporary') }}
      </p>
      <p v-if="error" role="alert">{{ t('setting.permissions.error') }}</p>
      <button
        v-for="preset in presets"
        :key="preset"
        type="button"
        class="block w-full rounded p-2 text-left text-sm hover:bg-muted"
        :aria-pressed="current === preset"
        :disabled="disabled || busy"
        :data-testid="`ai-business-permission-option-${preset}`"
        @click="select(preset)"
      >
        {{ t(`setting.permissions.presets.${preset}`) }}
      </button>
    </PopoverContent>
  </Popover>
</template>
