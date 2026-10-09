<template>
  <div
    class="flex flex-wrap items-center gap-2 px-3 py-2 text-xs"
    data-testid="ai-local-runtime-picker"
  >
    <label class="flex items-center gap-2">
      {{ t('aiAssistant.local.runtime') }}
      <select
        class="max-w-48 rounded-md border bg-background p-1.5"
        :value="connectionId"
        :disabled="disabled"
        @change="selectConnection"
      >
        <option value="builtin">{{ t('aiAssistant.local.builtin') }}</option>
        <option
          v-for="connection in connections"
          :key="connection.id"
          :value="connection.id"
          :disabled="!connection.enabled"
        >
          {{ connection.name }} · {{ connection.driver }}
        </option>
        <option v-if="missingConnection" :value="connectionId" disabled>
          {{ t('aiAssistant.local.missingConnection') }}
        </option>
      </select>
    </label>
    <template v-if="choice.runtimeKind === 'local_agent'">
      <label class="flex items-center gap-2">
        {{ t('aiAssistant.local.model') }}
        <select
          class="max-w-56 rounded-md border bg-background p-1.5"
          :value="choice.modelId"
          :disabled="disabled || loading"
          @change="selectModel"
        >
          <option value="" disabled>{{ t('aiAssistant.local.chooseModel') }}</option>
          <option
            v-if="choice.modelId && !models.some((m) => m.id === choice.modelId)"
            :value="choice.modelId"
          >
            {{ choice.modelId }} · {{ t('aiAssistant.local.unavailable') }}
          </option>
          <option v-for="model in models" :key="model.id" :value="model.id">
            {{ model.name }}
          </option>
        </select>
      </label>
      <button
        type="button"
        class="rounded border px-2 py-1"
        :disabled="loading || disabled"
        @click="$emit('refresh', connectionId)"
      >
        {{ t('aiAssistant.local.refresh') }}
      </button>
      <span v-if="loading" role="status">{{ t('aiAssistant.local.checking') }}</span>
      <span v-else-if="status && status.status !== 'ready'" role="status">{{
        status.message
      }}</span>
      <span class="text-muted-foreground">{{ t('aiAssistant.local.usageUnknown') }}</span>
    </template>
    <button
      type="button"
      class="rounded border px-2 py-1"
      :disabled="disabled || (choice.runtimeKind === 'local_agent' && !choice.modelId)"
      @click="$emit('set-default')"
    >
      {{ t('aiAssistant.local.setDefault') }}
    </button>
    <button type="button" class="underline" @click="$emit('settings')">
      {{ t('aiAssistant.local.connections') }}
    </button>
    <span v-if="error" role="alert">{{ t('aiAssistant.local.actionFailed') }}</span>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  AssistantRuntimeChoice,
  LocalAgentConnection,
  LocalAgentModel,
  LocalAgentStatus,
} from '@memoflow/contracts/ai';
const props = defineProps<{
  choice: AssistantRuntimeChoice;
  connections: LocalAgentConnection[];
  models: LocalAgentModel[];
  status: LocalAgentStatus | null;
  loading: boolean;
  disabled: boolean;
  error?: boolean;
}>();
const emit = defineEmits<{
  select: [choice: AssistantRuntimeChoice];
  refresh: [id: string];
  'set-default': [];
  settings: [];
}>();
const { t } = useI18n();
const connectionId = computed(() =>
  props.choice.runtimeKind === 'local_agent' ? props.choice.connectionId : 'builtin',
);
const missingConnection = computed(
  () =>
    connectionId.value !== 'builtin' && !props.connections.some((c) => c.id === connectionId.value),
);
function selectConnection(event: Event) {
  const id = (event.target as HTMLSelectElement).value;
  emit(
    'select',
    id === 'builtin'
      ? { runtimeKind: 'builtin' }
      : { runtimeKind: 'local_agent', connectionId: id, modelId: '' },
  );
}
function selectModel(event: Event) {
  if (props.choice.runtimeKind === 'local_agent')
    emit('select', { ...props.choice, modelId: (event.target as HTMLSelectElement).value });
}
</script>
