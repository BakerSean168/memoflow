<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, Link, LoaderCircle, RefreshCw, Unplug } from '@lucide/vue';
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@memoflow/ui-vue-shadcn';
import type {
  AgentInstance,
  AgentInstanceModelBinding,
  AIModelInfo,
  AIProviderConfigClientDTO,
  ProbeAIProviderConnectionRes,
} from '@memoflow/contracts/ai';
import { AI_AGENT_REGISTRY_KEY } from '../../../di/keys';
import { SettingsPropertyRow } from '../../../components/shared/settings';
import { getAIErrorMessage } from '../../ai/composables/error';
import { useAI } from '../../ai/composables/useAI';
import AgentDriverIcon from '../../ai/components/AgentDriverIcon.vue';

const props = defineProps<{
  instance: AgentInstance;
  providers: AIProviderConfigClientDTO[];
  bindings: AgentInstanceModelBinding[];
  allBindings: AgentInstanceModelBinding[];
  busy: boolean;
}>();
const emit = defineEmits<{
  changed: [];
  toggle: [enabled: boolean];
  rename: [name: string];
  remove: [];
}>();
const { t } = useI18n();
const registry = inject(AI_AGENT_REGISTRY_KEY, undefined);
const ai = useAI();
const uid = `mastra-settings-${useId()}`;
const displayName = ref(props.instance.name);
const selectedConnectionId = ref(props.bindings[0]?.connectionId ?? '');
const baseUrl = ref('');
const apiKey = ref('');
const models = ref<AIModelInfo[]>([]);
const modelId = ref('');
const probe = ref<ProbeAIProviderConnectionRes | null>(null);
const modelVerified = ref('');
const phase = ref<'idle' | 'probing' | 'testing' | 'saving'>('idle');
const message = ref('');
const saved = ref(false);
// Commit and bind are separate owner services. Preserve a committed connection
// when bind fails so Retry never duplicates a provider or consumes its key twice.
const committedConnection = ref<AIProviderConfigClientDTO | null>(null);
let generation = 0;
let updatingInputs = false;
let disposed = false;
const busy = computed(() => props.busy || phase.value !== 'idle');
const connection = computed(
  () =>
    committedConnection.value ??
    props.providers.find((entry) => String(entry.id) === selectedConnectionId.value) ??
    null,
);
const binding = computed(() =>
  props.bindings.find((entry) => entry.connectionId === selectedConnectionId.value),
);
const connected = computed(() => props.bindings.length > 0);
const reused = computed(
  () =>
    connection.value &&
    props.allBindings.filter((entry) => entry.connectionId === String(connection.value!.id))
      .length > 1,
);
const endpointChanged = computed(
  () =>
    baseUrl.value.trim().replace(/\/+$/u, '') !==
    (connection.value?.baseUrl ?? '').replace(/\/+$/u, ''),
);
const canProbe = computed(() => {
  try {
    const url = new URL(baseUrl.value.trim());
    return url.protocol === 'https:' && Boolean(apiKey.value.trim());
  } catch {
    return false;
  }
});
const needsModelTest = computed(() =>
  Boolean(
    probe.value &&
    (probe.value.credential.status === 'requires_model_test' ||
      !probe.value.models.some((model) => model.id === modelId.value.trim())),
  ),
);
const canSave = computed(() => {
  if (!registry || !modelId.value.trim() || busy.value) return false;
  if (probe.value)
    return (
      Date.now() < probe.value.expiresAt &&
      (!needsModelTest.value || modelVerified.value === modelId.value.trim())
    );
  return Boolean(
    connection.value &&
    !endpointChanged.value &&
    !apiKey.value.trim() &&
    models.value.some((model) => model.id === modelId.value.trim()),
  );
});
function errorMessage(error: unknown) {
  return getAIErrorMessage(error, t, 'setting.agentInstances.instanceSaveError');
}
function invalidateProbe() {
  generation++;
  probe.value = null;
  modelVerified.value = '';
  saved.value = false;
  message.value = '';
}
watch(
  [baseUrl, apiKey],
  () => {
    if (!updatingInputs) invalidateProbe();
  },
  { flush: 'sync' },
);
watch(
  () => props.instance.name,
  (value) => {
    displayName.value = value;
  },
);
watch(selectedConnectionId, () => resetConnection(), { immediate: true });
watch(
  () => connection.value?.version,
  (next, previous) => {
    if (previous !== undefined && next !== previous && phase.value !== 'saving') resetConnection();
  },
);
function resetConnection() {
  generation++;
  const pending = committedConnection.value;
  committedConnection.value = null;
  apiKey.value = '';
  probe.value = null;
  modelVerified.value = '';
  phase.value = 'idle';
  message.value = '';
  saved.value = false;
  const current =
    props.providers.find((entry) => String(entry.id) === selectedConnectionId.value) ??
    (pending && String(pending.id) === selectedConnectionId.value ? pending : null);
  const currentBinding = props.bindings.find(
    (entry) => entry.connectionId === selectedConnectionId.value,
  );
  baseUrl.value = current?.baseUrl ?? '';
  modelId.value = currentBinding?.modelId ?? current?.defaultModel ?? '';
  models.value = modelId.value ? [{ id: modelId.value, name: modelId.value }] : [];
  if (current) void refreshModels();
}
async function verifyConnection() {
  if (!canProbe.value || busy.value) return;
  phase.value = 'probing';
  message.value = '';
  const request = ++generation;
  const currentId = connection.value?.id;
  // The custom adapter keeps SSRF, owner authentication, credential expiry and
  // single-use SecretVault onboarding. No vendor catalogue or preset is shown.
  const input = {
    catalogId: 'custom' as const,
    baseUrl: baseUrl.value.trim(),
    apiKey: apiKey.value.trim(),
  };
  try {
    const result = currentId
      ? await ai.probeProviderReplacement(String(currentId), input)
      : await ai.probeProviderConnection(input);
    if (disposed || request !== generation) return;
    updatingInputs = true;
    apiKey.value = '';
    baseUrl.value = result.baseUrl;
    updatingInputs = false;
    probe.value = result;
    models.value = result.models;
    const preferred = modelId.value;
    modelId.value = result.models.some((model) => model.id === preferred)
      ? preferred
      : (result.models[0]?.id ?? '');
  } catch (error) {
    if (!disposed && request === generation) message.value = errorMessage(error);
  } finally {
    if (!disposed) phase.value = 'idle';
  }
}
async function refreshModels() {
  const current = connection.value;
  if (!current || busy.value) return;
  phase.value = 'probing';
  message.value = '';
  const request = ++generation;
  try {
    const result = await ai.refreshProviderModels(String(current.id));
    if (disposed || request !== generation) return;
    models.value = result.models;
  } catch (error) {
    if (!disposed && request === generation) message.value = errorMessage(error);
  } finally {
    if (!disposed) phase.value = 'idle';
  }
}
async function testModel() {
  const current = probe.value;
  if (!current || !modelId.value.trim() || busy.value) return;
  phase.value = 'testing';
  const candidate = modelId.value.trim();
  try {
    const result = await ai.testProviderOnboardingModel({
      onboardingId: current.onboardingId,
      modelId: candidate,
    });
    if (!disposed && probe.value === current && result.ok && candidate === modelId.value.trim())
      modelVerified.value = candidate;
  } catch (error) {
    if (!disposed) message.value = errorMessage(error);
  } finally {
    if (!disposed) phase.value = 'idle';
  }
}
async function save() {
  if (!canSave.value || !registry) return;
  phase.value = 'saving';
  saved.value = false;
  message.value = '';
  const instanceId = props.instance.instanceId;
  const selectedModelId = modelId.value.trim();
  try {
    let target = connection.value;
    if (probe.value) {
      target = target
        ? await ai.commitProviderReplacement(String(target.id), {
            onboardingId: probe.value.onboardingId,
            defaultModelId: selectedModelId,
          })
        : await ai.commitProviderOnboarding({
            onboardingId: probe.value.onboardingId,
            name: `${instanceId} ${new Date().getTime().toString(36)}`,
            defaultModelId: selectedModelId,
            isDefault: false,
          });
      committedConnection.value = target;
      probe.value = null;
    }
    if (!target) throw new Error('Model connection missing');
    if (disposed) return;
    const snapshot = await registry.list();
    if (disposed) return;
    const instance = snapshot.instances.find((item) => item.instanceId === instanceId);
    if (!instance) throw new Error('Agent instance no longer exists');
    await registry.execute({
      action: 'bind',
      instanceId,
      expectedRevision: instance.revision,
      connectionId: String(target.id),
      modelId: selectedModelId,
    });
    ai.invalidateConfiguration();
    if (!disposed) {
      selectedConnectionId.value = String(target.id);
      saved.value = true;
      emit('changed');
    }
  } catch (error) {
    if (!disposed) message.value = errorMessage(error);
  } finally {
    if (!disposed) phase.value = 'idle';
  }
}
async function unlink() {
  if (!binding.value || !registry || busy.value) return;
  phase.value = 'saving';
  try {
    await registry.execute({
      action: 'unbind',
      instanceId: props.instance.instanceId,
      expectedRevision: props.instance.revision,
      connectionId: binding.value.connectionId,
    });
    ai.invalidateConfiguration();
    selectedConnectionId.value = '';
    emit('changed');
  } catch (error) {
    if (!disposed) message.value = errorMessage(error);
  } finally {
    if (!disposed) phase.value = 'idle';
  }
}
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  apiKey.value = '';
  probe.value = null;
});
</script>

<template>
  <section data-testid="ai-mastra-instance-detail" class="min-w-0 space-y-6 p-1 sm:p-2">
    <header class="flex items-center justify-between gap-4 px-3 py-2">
      <div class="flex min-w-0 items-center gap-3">
        <AgentDriverIcon driver="mastra" class="size-5" :style="{ color: instance.accentColor }" />
        <div class="min-w-0">
          <h3 class="truncate text-base font-semibold">{{ instance.name }}</h3>
          <p class="mt-1 text-xs text-muted-foreground">Mastra · {{ instance.instanceId }}</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <Badge variant="secondary" role="status" data-testid="ai-mastra-status">{{
          !instance.enabled
            ? t('setting.ai.inactiveProvider')
            : connected
              ? t('setting.agentInstances.connectionReady')
              : t('setting.agentInstances.needsConfig')
        }}</Badge
        ><Switch
          :model-value="instance.enabled"
          :disabled="busy"
          :aria-label="t('setting.ai.enableProvider', { name: instance.name })"
          data-testid="ai-provider-detail-toggle"
          @update:model-value="emit('toggle', $event)"
        />
      </div>
    </header>
    <div class="rounded-xl border border-[hsl(var(--border-subtle))] bg-muted/10 px-4 py-4">
      <SettingsPropertyRow
        :label="t('setting.ai.displayName')"
        :description="t('setting.agentInstances.nameHint')"
        :html-for="`${uid}-name`"
        ><Input
          :id="`${uid}-name`"
          v-model="displayName"
          class="h-8 rounded-lg"
          maxlength="120"
          :disabled="busy"
          data-testid="ai-mastra-agent-name"
          @blur="
            displayName.trim() &&
            displayName.trim() !== instance.name &&
            emit('rename', displayName.trim())
          "
          @keydown.enter.prevent="displayName.trim() && emit('rename', displayName.trim())"
      /></SettingsPropertyRow>
      <SettingsPropertyRow
        :label="t('setting.agentInstances.instanceId')"
        :description="t('setting.agentInstances.idReadonlyHint')"
        :html-for="`${uid}-id`"
        ><Input
          :id="`${uid}-id`"
          :model-value="instance.instanceId"
          readonly
          class="h-8 rounded-lg text-muted-foreground"
          data-testid="ai-mastra-agent-id"
      /></SettingsPropertyRow>
    </div>
    <section class="space-y-3">
      <h4 class="px-3 text-xs font-medium text-muted-foreground">
        {{ t('setting.agentInstances.connection') }}
      </h4>
      <div
        class="space-y-3 rounded-xl border border-[hsl(var(--border-subtle))] bg-muted/10 px-4 py-4"
      >
        <SettingsPropertyRow
          :label="t('setting.agentInstances.endpoint')"
          :description="t('setting.agentInstances.endpointHint')"
          :html-for="`${uid}-endpoint`"
          ><Input
            :id="`${uid}-endpoint`"
            v-model="baseUrl"
            type="url"
            placeholder="https://api.example.com/v1"
            autocomplete="off"
            spellcheck="false"
            class="h-8 rounded-lg text-xs"
            :disabled="busy"
            data-testid="ai-endpoint"
        /></SettingsPropertyRow>
        <SettingsPropertyRow
          label="API Key"
          :description="
            connection
              ? t('setting.agentInstances.savedKeyHint')
              : t('setting.agentInstances.keyHint')
          "
          :html-for="`${uid}-key`"
          ><Input
            :id="`${uid}-key`"
            v-model="apiKey"
            type="password"
            autocomplete="new-password"
            :placeholder="connection ? t('setting.agentInstances.savedKeyPlaceholder') : 'sk-…'"
            spellcheck="false"
            class="h-8 rounded-lg text-xs"
            :disabled="busy"
            data-testid="ai-api-key"
        /></SettingsPropertyRow>
        <p v-if="reused" class="text-xs leading-5 text-muted-foreground">
          {{ t('setting.agentInstances.sharedConnectionHint') }}
        </p>
        <div
          class="flex flex-wrap items-center justify-end gap-2 border-t border-[hsl(var(--border-subtle))] pt-3"
        >
          <span
            v-if="probe"
            class="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground"
            role="status"
            ><Check class="size-3.5" />{{ t('setting.agentInstances.connectionVerified') }}</span
          >
          <Button
            size="sm"
            variant="outline"
            :disabled="busy || !canProbe"
            data-testid="ai-connection-verify"
            @click="verifyConnection"
            ><LoaderCircle v-if="phase === 'probing'" class="mr-2 size-3.5 animate-spin" /><Link
              v-else
              class="mr-2 size-3.5"
            />{{ t('setting.agentInstances.verifyConnection') }}</Button
          >
        </div>
      </div>
    </section>
    <section class="space-y-3">
      <div class="flex items-center justify-between px-3">
        <h4 class="text-xs font-medium text-muted-foreground">
          {{ t('setting.agentInstances.models') }}
        </h4>
        <Button
          v-if="connection"
          size="sm"
          variant="ghost"
          class="h-6 px-1 text-xs"
          :disabled="busy"
          data-testid="ai-models-refresh"
          @click="refreshModels"
          ><RefreshCw class="mr-1.5 size-3" />{{ t('setting.ai.refreshModels') }}</Button
        >
      </div>
      <div
        class="space-y-4 rounded-xl border border-[hsl(var(--border-subtle))] bg-muted/10 px-4 py-4"
      >
        <SettingsPropertyRow
          :label="t('setting.agentInstances.defaultModel')"
          :description="t('setting.agentInstances.modelHint')"
          :html-for="`${uid}-model`"
        >
          <Select v-if="models.length" v-model="modelId" :disabled="busy"
            ><SelectTrigger
              :id="`${uid}-model`"
              class="h-8 rounded-lg text-xs"
              data-testid="ai-default-model"
              ><SelectValue :placeholder="t('aiAssistant.local.chooseModel')" /></SelectTrigger
            ><SelectContent class="max-h-64"
              ><SelectItem
                v-for="model in models"
                :key="model.id"
                :value="model.id"
                class="text-xs"
                >{{ model.name || model.id }}</SelectItem
              ></SelectContent
            ></Select
          >
          <Input
            v-else
            :id="`${uid}-model`"
            v-model="modelId"
            :placeholder="t('setting.agentInstances.modelIdPlaceholder')"
            class="h-8 rounded-lg text-xs"
            :disabled="busy"
            data-testid="ai-manual-model"
          />
        </SettingsPropertyRow>
        <p
          v-if="!connected && !probe"
          data-testid="ai-mastra-needs-config"
          class="text-xs leading-5 text-muted-foreground"
        >
          {{ t('setting.agentInstances.inlineConnectionHint') }}
        </p>
        <div
          v-if="needsModelTest"
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3"
        >
          <p class="max-w-md text-xs leading-5 text-muted-foreground">
            {{ t('setting.agentInstances.manualTestHint') }}
          </p>
          <Button
            size="sm"
            variant="outline"
            :disabled="busy || !modelId.trim()"
            data-testid="ai-manual-model-test"
            @click="testModel"
            >{{
              modelVerified === modelId.trim()
                ? t('setting.agentInstances.modelVerified')
                : t('setting.agentInstances.testModel')
            }}</Button
          >
        </div>
        <p v-if="message" role="alert" class="text-xs leading-5 text-destructive">{{ message }}</p>
        <p
          v-if="saved"
          role="status"
          class="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Check class="size-3.5" />{{ t('setting.agentInstances.savedInstance') }}
        </p>
        <div class="flex justify-end">
          <Button
            size="sm"
            :disabled="!canSave"
            data-testid="ai-mastra-connection-save"
            @click="save"
            ><LoaderCircle v-if="phase === 'saving'" class="mr-2 size-3.5 animate-spin" />{{
              t('setting.ai.saveConfiguration')
            }}</Button
          >
        </div>
      </div>
    </section>
    <details
      v-if="providers.length"
      class="rounded-xl border border-[hsl(var(--border-subtle))] bg-muted/10 px-4 py-3"
      data-testid="ai-existing-connections"
    >
      <summary class="cursor-pointer text-xs text-muted-foreground">
        {{ t('setting.agentInstances.existingConnections') }}
      </summary>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <Select
          :model-value="selectedConnectionId || '__new__'"
          :disabled="busy"
          @update:model-value="
            selectedConnectionId = String($event) === '__new__' ? '' : String($event)
          "
          ><SelectTrigger
            class="h-8 min-w-0 flex-1 rounded-lg text-xs"
            data-testid="ai-mastra-service-select"
            ><SelectValue :placeholder="t('setting.agentInstances.newConnection')" /></SelectTrigger
          ><SelectContent
            ><SelectItem value="__new__">{{ t('setting.agentInstances.newConnection') }}</SelectItem
            ><SelectItem
              v-for="provider in providers"
              :key="String(provider.id)"
              :value="String(provider.id)"
              >{{ provider.name }}</SelectItem
            ></SelectContent
          ></Select
        ><Button v-if="binding" variant="ghost" size="sm" :disabled="busy" @click="unlink"
          ><Unplug class="mr-1.5 size-3.5" />{{ t('setting.agentInstances.removeBinding') }}</Button
        >
      </div>
    </details>
    <div v-if="instance.revision > 0" class="flex justify-end px-3">
      <Button
        size="sm"
        variant="ghost"
        class="text-destructive"
        :disabled="busy"
        data-testid="ai-agent-delete"
        @click="emit('remove')"
        >{{
          instance.instanceId === 'mastra'
            ? t('setting.agentInstances.resetDefault')
            : t('setting.ai.deleteProvider')
        }}</Button
      >
    </div>
  </section>
</template>
