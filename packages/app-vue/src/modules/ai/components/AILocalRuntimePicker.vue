<template>
  <div
    class="flex min-w-0 flex-wrap items-center gap-1 text-xs"
    data-testid="ai-local-runtime-picker"
  >
    <select
      class="max-w-40 rounded-md border-0 bg-transparent px-1 py-1.5 hover:bg-muted"
      :aria-label="t('aiAssistant.provider')"
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
        {{ connection.name }}
      </option>
      <option v-if="missingConnection" :value="connectionId" disabled>
        {{ t('aiAssistant.local.missingConnection') }}
      </option>
    </select>
    <select
      v-if="choice.runtimeKind === 'local_agent'"
      class="max-w-48 rounded-md border-0 bg-transparent px-1 py-1.5 hover:bg-muted"
      :aria-label="t('aiAssistant.local.model')"
      :value="choice.modelId"
      :disabled="disabled || loading"
      @change="selectModel"
    >
      <option value="" disabled>{{ t('aiAssistant.local.chooseModel') }}</option>
      <option
        v-if="choice.modelId && !models.some((model) => model.id === choice.modelId)"
        :value="choice.modelId"
      >
        {{ choice.modelId }} · {{ t('aiAssistant.local.unavailable') }}
      </option>
      <option v-for="model in models" :key="model.id" :value="model.id">{{ model.name }}</option>
    </select>
    <DropdownMenu>
      <DropdownMenuTrigger as-child
        ><Button
          variant="ghost"
          size="icon"
          class="size-6"
          :aria-label="t('aiAssistant.local.runtime')"
          ><Ellipsis class="size-3.5" /></Button
      ></DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          v-if="choice.runtimeKind === 'local_agent'"
          :disabled="loading || disabled"
          @click="$emit('refresh', connectionId)"
          >{{ t('aiAssistant.local.refresh') }}</DropdownMenuItem
        >
        <DropdownMenuItem
          :disabled="disabled || (choice.runtimeKind === 'local_agent' && !choice.modelId)"
          @click="$emit('set-default')"
          >{{ t('aiAssistant.local.setDefault') }}</DropdownMenuItem
        >
        <DropdownMenuItem @click="$emit('settings')">Providers</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <span v-if="loading" role="status" class="text-muted-foreground">{{
      t('aiAssistant.local.checking')
    }}</span>
    <span v-else-if="status && status.status !== 'ready'" role="status" class="text-destructive">{{
      status.message
    }}</span>
    <span v-if="error" role="alert" class="text-destructive">{{
      t('aiAssistant.local.actionFailed')
    }}</span>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { Ellipsis } from '@lucide/vue';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@memoflow/ui-vue-shadcn';
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
