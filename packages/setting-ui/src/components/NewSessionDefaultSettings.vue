<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@memoflow/ui-vue-shadcn';
import {
  AGENT_SUPPORTED_RUNTIME_MODES,
  AIChatPermissionModeSchema,
  type AIChatPermissionMode,
  type AgentInstance,
  type AgentInstanceModelBinding,
  type AIProviderConfigClientDTO,
  type LocalAgentStatus,
} from '@memoflow/ai-contracts';
import { settingUiHost } from '../setting-ui-host';
import type { SettingComposerSessionSelection } from '../setting-ui-host';

/**
 * Explicit new-conversation Composer default (issue #925).
 *
 * Only new conversations read this; an open conversation keeps its own Agent,
 * model and permission. A saved default that points at a missing or disabled
 * Agent is never silently swapped: the composer falls back to the last-used
 * memory and says so once.
 */
const { SettingsSection, SettingsPropertyRow } = settingUiHost.components;
const props = defineProps<{
  instances: AgentInstance[];
  bindings: AgentInstanceModelBinding[];
  providers: AIProviderConfigClientDTO[];
}>();

const { t } = useI18n();
const ai = settingUiHost.useAiFacade();
const local = inject(settingUiHost.AI_LOCAL_AGENT_KEY, undefined);
const uid = `ai-new-session-${useId()}`;

interface ModelChoice {
  value: string;
  label: string;
  efforts: string[];
}

const saved = ai.composerDefaults.readNewSessionDefault();
const savedSnapshot = ref(JSON.stringify(saved));
// Without an explicit default the draft starts from the last-used selection, so
// the form shows what new conversations currently do instead of seeding a
// system-picked Agent.
const initialSelection = saved.selection ?? ai.composerDefaults.readStickySelection();
const enabled = ref(saved.enabled);
const permissionMode = ref<AIChatPermissionMode>(
  initialSelection?.permissionMode ?? 'approval-required',
);
const reasoningEffort = ref(initialSelection?.reasoningEffort ?? '');
const agentInstanceId = ref('');
const modelValue = ref(
  initialSelection
    ? initialSelection.runtimeKind === 'local_agent'
      ? (initialSelection.modelId ?? '')
      : (initialSelection.modelKey ?? '')
    : '',
);
const nativeStatus = ref<LocalAgentStatus | null>(null);
const savedNotice = ref(false);
let loadEpoch = 0;
let awaitingSavedInstance = Boolean(initialSelection);
let disposed = false;
onBeforeUnmount(() => {
  disposed = true;
  loadEpoch++;
});

function instanceForSelection(
  selection: SettingComposerSessionSelection | null,
  instances: AgentInstance[],
): AgentInstance | undefined {
  if (!selection) return undefined;
  return selection.runtimeKind === 'local_agent'
    ? instances.find((entry) => entry.legacyConnectionId === selection.connectionId)
    : instances.find((entry) => entry.instanceId === selection.agentInstanceId);
}
function initialInstanceId() {
  return instanceForSelection(initialSelection, props.instances)?.instanceId ?? '';
}
agentInstanceId.value = initialInstanceId();

const enabledInstances = computed(() => props.instances.filter((entry) => entry.enabled));
const selectedInstance = computed(() =>
  enabledInstances.value.find((entry) => entry.instanceId === agentInstanceId.value),
);
const savedInstanceUnavailable = computed(
  () =>
    Boolean(saved.enabled) &&
    Boolean(saved.selection) &&
    !enabledInstances.value.some(
      (entry) =>
        entry.instanceId === instanceForSelection(saved.selection, props.instances)?.instanceId,
    ),
);

async function loadNativeModels(instance: AgentInstance | undefined) {
  const epoch = ++loadEpoch;
  nativeStatus.value = null;
  if (!instance || instance.driver === 'mastra' || !local || !instance.legacyConnectionId) return;
  try {
    // Persisted snapshot read only; discovery stays owned by Provider settings.
    const status = await local.cachedCatalogConnection(instance.legacyConnectionId);
    if (!disposed && epoch === loadEpoch) nativeStatus.value = status;
  } catch {
    if (!disposed && epoch === loadEpoch) nativeStatus.value = null;
  }
}
void loadNativeModels(selectedInstance.value);

watch(
  () => props.instances,
  (instances) => {
    if (agentInstanceId.value || !initialSelection) return;
    const restored = instanceForSelection(initialSelection, instances);
    if (!restored) return;
    agentInstanceId.value = restored.instanceId;
  },
);
watch(agentInstanceId, (id) => {
  const instance = enabledInstances.value.find((entry) => entry.instanceId === id);
  void loadNativeModels(instance);
  if (awaitingSavedInstance && id === initialInstanceId()) {
    awaitingSavedInstance = false;
    return;
  }
  awaitingSavedInstance = false;
  modelValue.value = '';
  reasoningEffort.value = '';
});

const modelChoices = computed<ModelChoice[]>(() => {
  const instance = selectedInstance.value;
  if (!instance) return [];
  const choices: ModelChoice[] =
    instance.driver === 'mastra'
      ? props.bindings
          .filter((binding) => binding.instanceId === instance.instanceId)
          .map((binding) => {
            const provider = props.providers.find((entry) => entry.id === binding.connectionId);
            return {
              value: `agent:${instance.instanceId}::${binding.connectionId}::${binding.modelId}`,
              label: `${provider?.name ?? binding.connectionId} · ${binding.modelId}`,
              efforts: [],
            };
          })
      : nativeStatus.value?.status === 'ready'
        ? nativeStatus.value.models.map((model) => ({
            value: model.id,
            label: model.name || model.id,
            efforts: model.reasoningEfforts ?? [],
          }))
        : [];
  // Keep a previously saved model selectable even while its directory is unverified.
  if (modelValue.value && !choices.some((choice) => choice.value === modelValue.value))
    return [...choices, { value: modelValue.value, label: modelValue.value, efforts: [] }];
  return choices;
});
const currentEfforts = computed(
  () => modelChoices.value.find((choice) => choice.value === modelValue.value)?.efforts ?? [],
);
const permissionOptions = computed<AIChatPermissionMode[]>(() => {
  const instance = selectedInstance.value;
  if (!instance) return [];
  const supported: readonly AIChatPermissionMode[] =
    AGENT_SUPPORTED_RUNTIME_MODES[instance.driver];
  return AIChatPermissionModeSchema.options.filter((mode) => supported.includes(mode));
});
const effectivePermission = computed<AIChatPermissionMode | undefined>(() =>
  permissionOptions.value.includes(permissionMode.value)
    ? permissionMode.value
    : permissionOptions.value[0],
);
/** Radix Select has no empty option value; the sentinel means the model default. */
const MODEL_DEFAULT_EFFORT = '__model-default__';
const effortChoice = computed({
  get: () => reasoningEffort.value || MODEL_DEFAULT_EFFORT,
  set: (value: string) => {
    reasoningEffort.value = value === MODEL_DEFAULT_EFFORT ? '' : value;
  },
});
const selection = computed<SettingComposerSessionSelection | null>(() => {
  const instance = selectedInstance.value;
  if (!instance || !modelValue.value) return null;
  const base: SettingComposerSessionSelection | null =
    instance.driver === 'mastra'
      ? {
          runtimeKind: 'builtin',
          agentInstanceId: instance.instanceId,
          modelKey: modelValue.value,
        }
      : instance.legacyConnectionId
        ? {
            runtimeKind: 'local_agent',
            connectionId: instance.legacyConnectionId,
            modelId: modelValue.value,
          }
        : // A native instance without a materialized connection cannot be a default.
          null;
  if (!base) return null;
  // An unverified directory still keeps a previously saved effort instead of
  // silently downgrading the default to the model's own value.
  if (
    reasoningEffort.value &&
    (!currentEfforts.value.length || currentEfforts.value.includes(reasoningEffort.value))
  )
    base.reasoningEffort = reasoningEffort.value;
  if (effectivePermission.value) base.permissionMode = effectivePermission.value;
  return base;
});
const snapshot = computed(() =>
  JSON.stringify({ enabled: enabled.value, selection: selection.value }),
);
const dirty = computed(() => snapshot.value !== savedSnapshot.value);
const canSave = computed(() => !enabled.value || selection.value !== null);

function save() {
  if (!canSave.value) return;
  ai.composerDefaults.writeNewSessionDefault({
    enabled: enabled.value,
    selection: selection.value,
  });
  savedSnapshot.value = snapshot.value;
  savedNotice.value = true;
}
watch([enabled, selection], () => {
  savedNotice.value = false;
});
watch(enabled, (value) => {
  // Enabling without a complete selection would silently do nothing.
  if (value && !selection.value) enabled.value = false;
});
</script>

<template>
  <SettingsSection
    :title="t('setting.ai.newSessionDefault.title')"
    :description="t('setting.ai.newSessionDefault.description')"
    test-id="ai-new-session-default"
  >
    <SettingsPropertyRow
      :label="t('setting.ai.newSessionDefault.enable')"
      :description="t('setting.ai.newSessionDefault.enableDescription')"
      :html-for="`${uid}-enabled`"
    >
      <div class="flex justify-end">
        <Switch
          :id="`${uid}-enabled`"
          :model-value="enabled"
          :disabled="!selection"
          data-testid="ai-new-session-default-enabled"
          @update:model-value="enabled = $event"
        />
      </div>
    </SettingsPropertyRow>

    <p
      v-if="!enabledInstances.length"
      class="py-2 text-xs leading-5 text-muted-foreground"
      data-testid="ai-new-session-default-no-agents"
    >
      {{ t('setting.ai.newSessionDefault.noAgents') }}
    </p>
    <template v-else>
      <SettingsPropertyRow
        :label="t('setting.ai.newSessionDefault.agent')"
        :description="t('setting.ai.newSessionDefault.agentDescription')"
        :html-for="`${uid}-agent`"
      >
        <Select v-model="agentInstanceId">
          <SelectTrigger
            :id="`${uid}-agent`"
            class="h-8 rounded-lg text-xs"
            data-testid="ai-new-session-default-agent"
            ><SelectValue :placeholder="t('aiAssistant.composer.chooseAgent')"
          /></SelectTrigger>
          <SelectContent class="max-h-64">
            <SelectItem
              v-for="instance in enabledInstances"
              :key="instance.instanceId"
              :value="instance.instanceId"
              class="text-xs"
              >{{ instance.name }}</SelectItem
            >
          </SelectContent>
        </Select>
      </SettingsPropertyRow>

      <p
        v-if="selectedInstance && !modelChoices.length"
        class="py-2 text-xs leading-5 text-muted-foreground"
        data-testid="ai-new-session-default-no-models"
      >
        {{ t('setting.ai.newSessionDefault.noModels') }}
      </p>
      <SettingsPropertyRow
        v-else
        :label="t('setting.ai.newSessionDefault.model')"
        :description="t('setting.ai.newSessionDefault.modelDescription')"
        :html-for="`${uid}-model`"
      >
        <Select v-model="modelValue">
          <SelectTrigger
            :id="`${uid}-model`"
            class="h-8 rounded-lg text-xs"
            data-testid="ai-new-session-default-model"
            ><SelectValue :placeholder="t('aiAssistant.composer.chooseModel')"
          /></SelectTrigger>
          <SelectContent class="max-h-64">
            <SelectItem
              v-for="choice in modelChoices"
              :key="choice.value"
              :value="choice.value"
              class="text-xs"
              >{{ choice.label }}</SelectItem
            >
          </SelectContent>
        </Select>
      </SettingsPropertyRow>

      <SettingsPropertyRow
        :label="t('setting.ai.newSessionDefault.reasoningEffort')"
        :description="
          currentEfforts.length
            ? t('setting.ai.newSessionDefault.reasoningEffortDescription')
            : t('setting.ai.newSessionDefault.noReasoningEffort')
        "
        :html-for="`${uid}-effort`"
      >
        <Select v-model="effortChoice" :disabled="!currentEfforts.length">
          <SelectTrigger
            :id="`${uid}-effort`"
            class="h-8 rounded-lg text-xs"
            data-testid="ai-new-session-default-reasoning"
            ><SelectValue :placeholder="t('setting.ai.newSessionDefault.modelDefault')"
          /></SelectTrigger>
          <SelectContent class="max-h-64">
            <SelectItem :value="MODEL_DEFAULT_EFFORT" class="text-xs">{{
              t('setting.ai.newSessionDefault.modelDefault')
            }}</SelectItem>
            <SelectItem
              v-for="effort in currentEfforts"
              :key="effort"
              :value="effort"
              class="text-xs"
              >{{ effort }}</SelectItem
            >
          </SelectContent>
        </Select>
      </SettingsPropertyRow>

      <SettingsPropertyRow
        v-if="permissionOptions.length"
        :label="t('setting.ai.newSessionDefault.permission')"
        :description="t('setting.ai.newSessionDefault.permissionDescription')"
        :html-for="`${uid}-permission`"
      >
        <Select v-model="permissionMode">
          <SelectTrigger
            :id="`${uid}-permission`"
            class="h-8 rounded-lg text-xs"
            data-testid="ai-new-session-default-permission"
            ><SelectValue
          /></SelectTrigger>
          <SelectContent class="max-h-64">
            <SelectItem
              v-for="mode in permissionOptions"
              :key="mode"
              :value="mode"
              class="text-xs"
              >{{ t(`aiAssistant.composer.runtimeModes.${mode}.label`) }}</SelectItem
            >
          </SelectContent>
        </Select>
      </SettingsPropertyRow>
    </template>

    <p
      v-if="savedInstanceUnavailable"
      class="py-2 text-xs leading-5 text-muted-foreground"
      data-testid="ai-new-session-default-unavailable"
    >
      {{ t('setting.ai.newSessionDefault.unavailableInstance') }}
    </p>
    <p
      v-if="enabled && !selection"
      class="py-2 text-xs leading-5 text-destructive"
      data-testid="ai-new-session-default-invalid"
    >
      {{ t('setting.ai.newSessionDefault.incomplete') }}
    </p>

    <div class="flex items-center justify-end gap-3 pt-2">
      <span
        v-if="savedNotice && !dirty"
        class="text-xs text-muted-foreground"
        data-testid="ai-new-session-default-saved"
        >{{ t('setting.ai.newSessionDefault.saved') }}</span
      >
      <span v-else-if="dirty" class="text-xs text-muted-foreground">{{
        t('setting.ai.newSessionDefault.unsaved')
      }}</span>
      <Button
        size="sm"
        class="h-8 text-xs"
        :disabled="!dirty || !canSave"
        data-testid="ai-new-session-default-save"
        @click="save"
        >{{ t('setting.ai.newSessionDefault.save') }}</Button
      >
    </div>
  </SettingsSection>
</template>
