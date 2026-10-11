<script setup lang="ts">
import { computed } from 'vue';
import { Eye, Settings2, ShieldCheck, Zap } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from '@memoflow/ui-vue-shadcn';
import type { AgentDriverKind, AIChatPermissionMode } from '@memoflow/contracts/ai';
import type { ChatModelOption } from '../composables/types';
import AgentDriverIcon from './AgentDriverIcon.vue';

interface ComposerAgentOption {
  id: string;
  name: string;
  driver: AgentDriverKind;
  enabled: boolean;
  configured: boolean;
}
const props = defineProps<{
  agents: ComposerAgentOption[];
  selectedAgentId: string;
  models: ChatModelOption[];
  selectedModelKey: string;
  permissionMode: AIChatPermissionMode;
  native: boolean;
  disabled: boolean;
  loading?: boolean;
}>();
const emit = defineEmits<{
  selectAgent: [id: string];
  selectModel: [key: string];
  permission: [mode: AIChatPermissionMode];
  settings: [];
}>();
const { t } = useI18n();
const currentAgent = computed(() =>
  props.agents.find((agent) => agent.id === props.selectedAgentId),
);
const permissionModes = computed<AIChatPermissionMode[]>(() =>
  props.native ? ['supervised', 'auto-approve'] : ['supervised', 'read-only'],
);
const selectedModel = computed(() =>
  props.models.find((model) => model.key === props.selectedModelKey),
);
const description = (mode: AIChatPermissionMode) =>
  t(
    `aiAssistant.composer.${mode === 'read-only' ? 'readOnlyHint' : mode === 'auto-approve' ? 'autoApproveHint' : 'supervisedHint'}`,
  );
function chooseAgent(value: unknown) {
  const id = String(value);
  if (id === '__settings__') emit('settings');
  else emit('selectAgent', id);
}
</script>

<template>
  <div
    class="flex min-w-0 flex-wrap items-center gap-x-0.5 gap-y-1"
    data-testid="ai-composer-agent-controls"
  >
    <Select
      :model-value="selectedAgentId || undefined"
      :disabled="disabled"
      @update:model-value="chooseAgent"
    >
      <SelectTrigger
        class="h-7 w-auto min-w-0 max-w-[9rem] gap-1 rounded-md border-0 bg-transparent px-1.5 text-xs text-muted-foreground shadow-none hover:bg-muted/70 hover:text-foreground focus:ring-0 focus:ring-offset-0"
        :aria-label="t('aiAssistant.composer.agent')"
        :title="currentAgent?.name"
        data-testid="ai-chat-agent-selector"
      >
        <AgentDriverIcon :driver="currentAgent?.driver ?? 'mastra'" class="mr-0.5 size-3.5" /><span
          class="min-w-0 truncate"
          >{{ currentAgent?.name ?? t('aiAssistant.composer.chooseAgent') }}</span
        >
      </SelectTrigger>
      <SelectContent class="max-h-72 min-w-64" align="start" side="top"
        ><SelectGroup
          ><SelectLabel>{{ t('aiAssistant.composer.agent') }}</SelectLabel
          ><SelectItem
            v-for="agent in agents"
            :key="agent.id"
            :value="agent.id"
            :disabled="!agent.enabled"
            ><span class="inline-flex items-center gap-2"
              ><AgentDriverIcon :driver="agent.driver" /><span>{{ agent.name }}</span
              ><span v-if="!agent.enabled" class="text-[10px] text-muted-foreground">{{
                t('aiAssistant.composer.disabled')
              }}</span
              ><span v-else-if="!agent.configured" class="text-[10px] text-muted-foreground">{{
                t('aiAssistant.composer.notConfigured')
              }}</span></span
            ></SelectItem
          ><SelectItem
            value="__settings__"
            class="mt-1 border-t border-[hsl(var(--border-subtle))] text-xs"
            ><span class="inline-flex items-center gap-2"
              ><Settings2 class="size-3.5" />{{ t('aiAssistant.composer.configure') }}</span
            ></SelectItem
          ></SelectGroup
        ></SelectContent
      >
    </Select>
    <Select
      v-if="models.length"
      :model-value="selectedModelKey || undefined"
      :disabled="disabled || loading"
      @update:model-value="emit('selectModel', String($event))"
    >
      <SelectTrigger
        class="h-7 w-auto min-w-0 max-w-[12rem] gap-1 rounded-md border-0 bg-transparent px-1.5 text-xs text-muted-foreground shadow-none hover:bg-muted/70 hover:text-foreground focus:ring-0 focus:ring-offset-0"
        :aria-label="t('aiAssistant.composer.model')"
        :title="selectedModel?.modelName"
        data-testid="ai-chat-model-selector"
        ><SelectValue :placeholder="t('aiAssistant.composer.chooseModel')"
      /></SelectTrigger>
      <SelectContent class="max-h-72 min-w-64" align="start" side="top"
        ><SelectGroup
          ><SelectLabel
            >{{ currentAgent?.name }} · {{ t('aiAssistant.composer.model') }}</SelectLabel
          ><SelectItem v-for="model in models" :key="model.key" :value="model.key">{{
            model.modelName
          }}</SelectItem></SelectGroup
        ></SelectContent
      >
    </Select>
    <Button
      v-else
      variant="ghost"
      size="sm"
      class="h-7 min-w-0 max-w-[10rem] rounded-md px-1.5 text-xs font-normal text-muted-foreground"
      :disabled="disabled || loading"
      :aria-label="t('aiAssistant.composer.model')"
      data-testid="ai-chat-model-selector"
      @click="emit('settings')"
      >{{
        loading ? t('aiAssistant.local.checking') : t('aiAssistant.composer.notConfigured')
      }}</Button
    >
    <Select
      :model-value="permissionMode"
      :disabled="disabled"
      @update:model-value="emit('permission', String($event) as AIChatPermissionMode)"
    >
      <SelectTrigger
        class="h-7 w-auto min-w-0 max-w-[10rem] gap-1 rounded-md border-0 bg-transparent px-1.5 text-xs text-muted-foreground shadow-none hover:bg-muted/70 hover:text-foreground focus:ring-0 focus:ring-offset-0"
        :aria-label="t('aiAssistant.composer.permissions')"
        :title="description(permissionMode)"
        data-testid="ai-chat-permission-selector"
        ><Eye v-if="permissionMode === 'read-only'" class="mr-0.5 size-3.5" /><Zap
          v-else-if="permissionMode === 'auto-approve'"
          class="mr-0.5 size-3.5"
        /><ShieldCheck v-else class="mr-0.5 size-3.5" /><span class="truncate">{{
          t(`aiAssistant.composer.${permissionMode}`)
        }}</span></SelectTrigger
      >
      <SelectContent class="max-w-[min(22rem,calc(100vw-2rem))]" align="start" side="top"
        ><SelectGroup
          ><SelectLabel>{{ t('aiAssistant.composer.permissions') }}</SelectLabel
          ><SelectItem v-for="mode in permissionModes" :key="mode" :value="mode"
            ><span class="block py-1"
              ><span class="block text-xs font-medium">{{ t(`aiAssistant.composer.${mode}`) }}</span
              ><span
                class="mt-1 block max-w-72 text-wrap text-[11px] leading-4 text-muted-foreground"
                >{{ description(mode) }}</span
              ></span
            ></SelectItem
          ></SelectGroup
        ></SelectContent
      >
    </Select>
  </div>
</template>
