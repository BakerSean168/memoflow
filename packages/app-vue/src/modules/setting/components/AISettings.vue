<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { Plus, RefreshCw } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Button, Switch } from '@memoflow/ui-vue-shadcn';
import type {
  AgentInstance,
  AgentRegistrySnapshot,
  CreateAgentInstance,
  LocalAgentConnection,
  LocalAgentConnectionInput,
  LocalAgentStatus,
} from '@memoflow/contracts/ai';
import { AI_AGENT_REGISTRY_KEY, AI_LOCAL_AGENT_KEY } from '../../../di/keys';
import { useAI } from '../../ai/composables/useAI';
import { getAIErrorMessage } from '../../ai/composables/error';
import AgentDriverIcon from '../../ai/components/AgentDriverIcon.vue';
import AgentInstanceWizard from './AgentInstanceWizard.vue';
import LocalAgentSettings from './LocalAgentSettings.vue';
import MastraAgentSettings from './MastraAgentSettings.vue';

const { t } = useI18n();
const registry = inject(AI_AGENT_REGISTRY_KEY, undefined);
const local = inject(AI_LOCAL_AGENT_KEY, undefined);
const ai = useAI();
const snapshot = ref<AgentRegistrySnapshot | null>(null);
const nativeConnections = ref<LocalAgentConnection[]>([]);
const statuses = ref<Record<string, LocalAgentStatus>>({});
const checking = ref<Record<string, boolean>>({});
const selectedId = ref('mastra');
const wizardOpen = ref(false);
const busy = ref(false);
const loading = ref(false);
const failure = ref('');
let generation = 0;
let disposed = false;
const instances = computed(() => snapshot.value?.instances ?? []);
const selected = computed(
  () => instances.value.find((item) => item.instanceId === selectedId.value) ?? null,
);
const selectedNative = computed(() =>
  selected.value?.legacyConnectionId
    ? (nativeConnections.value.find((item) => item.id === selected.value?.legacyConnectionId) ??
      null)
    : null,
);
const bindings = computed(
  () => snapshot.value?.bindings.filter((item) => item.instanceId === selectedId.value) ?? [],
);
function failureMessage(error: unknown) {
  return getAIErrorMessage(error, t, 'setting.agentInstances.instanceSaveError');
}
function statusLabel(instance: AgentInstance) {
  if (!instance.enabled) return t('setting.ai.inactiveProvider');
  if (checking.value[instance.instanceId]) return t('aiAssistant.local.checking');
  if (instance.driver === 'mastra')
    return snapshot.value?.bindings.some((binding) => binding.instanceId === instance.instanceId)
      ? t('setting.agentInstances.connectionReady')
      : t('setting.agentInstances.needsConfig');
  const status = statuses.value[instance.instanceId];
  return status?.status === 'ready'
    ? t('aiAssistant.local.ready', { count: status.models.length })
    : (status?.message ?? t('setting.agentInstances.unchecked'));
}
async function refresh() {
  if (!registry) {
    failure.value = t('setting.agentInstances.registryUnavailable');
    return;
  }
  const current = ++generation;
  loading.value = true;
  try {
    const [next, native] = await Promise.all([
      registry.list(),
      local ? local.listConnections() : Promise.resolve([]),
      ai.loadProviders(),
    ]);
    if (disposed || current !== generation) return;
    snapshot.value = next;
    nativeConnections.value = native;
    if (!next.instances.some((item) => item.instanceId === selectedId.value))
      selectedId.value = next.instances[0]?.instanceId ?? '';
    failure.value = '';
  } catch (error) {
    if (!disposed && current === generation) {
      snapshot.value = null;
      nativeConnections.value = [];
      failure.value = failureMessage(error);
    }
  } finally {
    if (!disposed && current === generation) loading.value = false;
  }
}
async function mutate(work: () => Promise<unknown>, after?: () => void) {
  if (!registry || busy.value) return;
  busy.value = true;
  failure.value = '';
  try {
    await work();
    ai.invalidateConfiguration();
    if (!disposed) {
      after?.();
      await refresh();
    }
  } catch (error) {
    if (!disposed) failure.value = failureMessage(error);
  } finally {
    if (!disposed) busy.value = false;
  }
}
async function toggle(instance: AgentInstance, enabled: boolean) {
  await mutate(() =>
    registry!.execute({
      action: 'update',
      instanceId: instance.instanceId,
      expectedRevision: instance.revision,
      patch: { enabled },
    }),
  );
}
async function createMastra(instance: CreateAgentInstance) {
  await mutate(
    () => registry!.execute({ action: 'create', instance }),
    () => {
      selectedId.value = instance.instanceId;
      wizardOpen.value = false;
    },
  );
}
async function createNative(input: LocalAgentConnectionInput) {
  if (!local || !input.instanceSlug) return;
  await mutate(
    () =>
      registry!.execute({
        action: 'create',
        instance: {
          instanceId: input.instanceSlug!,
          driver: input.driver,
          name: input.name,
          accentColor: input.accentColor ?? '#6469da',
          enabled: input.enabled,
          nativeConfig: {
            executablePath: input.executablePath,
            homePath: input.homePath,
            writeScopes: input.writeScopes,
          },
        },
      }),
    () => {
      selectedId.value = input.instanceSlug!;
      wizardOpen.value = false;
    },
  );
}
async function rename(name: string) {
  const current = selected.value;
  if (!current) return;
  await mutate(() =>
    registry!.execute({
      action: 'update',
      instanceId: current.instanceId,
      expectedRevision: current.revision,
      patch: { name },
    }),
  );
}
async function saveNative(input: LocalAgentConnectionInput) {
  const current = selected.value;
  if (!current || current.driver === 'mastra' || !local) return;
  await mutate(() =>
    registry!.execute({
      action: 'update',
      instanceId: current.instanceId,
      expectedRevision: current.revision,
      patch: {
        name: input.name,
        enabled: input.enabled,
        accentColor: input.accentColor,
        nativeConfig: {
          executablePath: input.executablePath,
          homePath: input.homePath,
          writeScopes: input.writeScopes,
        },
      },
    }),
  );
}
async function removeSelected() {
  const current = selected.value;
  if (!current?.revision) return;
  await mutate(() =>
    registry!.execute({
      action: 'remove',
      instanceId: current.instanceId,
      expectedRevision: current.revision,
    }),
  );
}
async function probe(instance: AgentInstance) {
  if (
    !local ||
    instance.driver === 'mastra' ||
    !instance.enabled ||
    checking.value[instance.instanceId]
  )
    return;
  const epoch = generation;
  checking.value[instance.instanceId] = true;
  try {
    const result = instance.legacyConnectionId
      ? await local.probeConnection(instance.legacyConnectionId)
      : await local.probeDefaultDriver(instance.driver);
    if (!disposed && epoch === generation) statuses.value[instance.instanceId] = result;
  } catch {
    if (!disposed && epoch === generation)
      statuses.value[instance.instanceId] = {
        status: 'unavailable',
        message: t('aiAssistant.local.actionFailed'),
      };
  } finally {
    if (!disposed) checking.value[instance.instanceId] = false;
  }
}
async function recheck() {
  await refresh();
  const candidates = instances.value.filter((item) => item.driver !== 'mastra' && item.enabled);
  for (let index = 0; index < candidates.length && !disposed; index += 2)
    await Promise.allSettled(candidates.slice(index, index + 2).map(probe));
}
function select(instance: AgentInstance) {
  selectedId.value = instance.instanceId;
  if (!statuses.value[instance.instanceId]) void probe(instance);
}
async function configured() {
  await refresh();
}
onMounted(() => {
  void recheck();
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
});
</script>

<template>
  <section data-testid="ai-settings-panel" class="space-y-4">
    <header class="flex items-center justify-between gap-3 px-1">
      <div class="flex items-center gap-1">
        <h2 class="text-sm font-medium text-muted-foreground">Providers</h2>
        <Button
          size="icon"
          variant="ghost"
          class="size-7 rounded-lg text-muted-foreground"
          :disabled="busy || !snapshot"
          :aria-label="t('setting.ai.addProvider')"
          data-testid="ai-provider-add"
          @click="wizardOpen = true"
          ><Plus class="size-4"
        /></Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
        :disabled="busy || loading"
        data-testid="ai-provider-recheck"
        @click="recheck"
        ><RefreshCw class="size-3.5" :class="{ 'animate-spin': loading }" />{{
          t('setting.ai.recheckProviders')
        }}</Button
      >
    </header>
    <p v-if="failure" role="alert" class="px-2 text-sm text-destructive">{{ failure }}</p>
    <div
      v-if="instances.length"
      class="grid min-h-[34rem] overflow-hidden rounded-xl border border-[hsl(var(--border-subtle))] lg:grid-cols-[15.5rem_minmax(0,1fr)]"
    >
      <div
        class="max-h-[18rem] overflow-y-auto border-b border-[hsl(var(--border-subtle))] bg-muted/10 lg:max-h-none lg:border-b-0 lg:border-r"
        role="list"
        :aria-label="t('setting.ai.providerList')"
        data-testid="ai-provider-list"
      >
        <div
          v-for="instance in instances"
          :key="instance.instanceId"
          role="listitem"
          class="flex min-h-20 items-center gap-2 border-b border-[hsl(var(--border-subtle))] px-3 py-2.5 last:border-b-0"
          :class="selectedId === instance.instanceId ? 'bg-muted/50' : 'hover:bg-muted/25'"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
            :class="selectedId === instance.instanceId ? 'ring-1 ring-inset ring-primary/65' : ''"
            :aria-current="selectedId === instance.instanceId ? 'true' : undefined"
            :data-testid="`ai-provider-select-agent:${instance.instanceId}`"
            @click="select(instance)"
          >
            <AgentDriverIcon
              :driver="instance.driver"
              class="mt-0.5 size-4"
              :style="{ color: instance.accentColor }"
            />
            <span class="min-w-0 flex-1"
              ><span class="block truncate text-[13px] font-semibold">{{ instance.name }}</span
              ><span class="mt-1 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">{{
                statusLabel(instance)
              }}</span></span
            >
          </button>
          <Switch
            :model-value="instance.enabled"
            :disabled="busy || loading"
            :aria-label="t('setting.ai.enableProvider', { name: instance.name })"
            :data-testid="`ai-provider-toggle-${instance.instanceId}`"
            @update:model-value="toggle(instance, $event)"
          />
        </div>
      </div>
      <div class="min-w-0 p-3 sm:p-4">
        <MastraAgentSettings
          v-if="selected?.driver === 'mastra'"
          :key="selected.instanceId"
          :instance="selected"
          :providers="ai.providers.value"
          :bindings="bindings"
          :all-bindings="snapshot?.bindings ?? []"
          :busy="busy"
          @changed="configured"
          @toggle="toggle(selected, $event)"
          @rename="rename"
          @remove="removeSelected"
        />
        <LocalAgentSettings
          v-else-if="selected"
          :key="selected.instanceId"
          :connection="selectedNative"
          :driver="selected.driver"
          :identity="{
            name: selected.name,
            instanceSlug: selected.instanceId,
            accentColor: selected.accentColor,
          }"
          :enabled="selected.enabled"
          :status="statuses[selected.instanceId]"
          :can-probe="true"
          :busy="busy || Boolean(checking[selected.instanceId])"
          :error="Boolean(failure)"
          @save="saveNative"
          @toggle="toggle(selected, $event)"
          @check="probe(selected)"
          @remove="removeSelected"
          @cancel="selectedId = instances[0]?.instanceId ?? ''"
        />
      </div>
    </div>
    <p v-else-if="loading" role="status" class="px-2 text-sm text-muted-foreground">
      {{ t('aiAssistant.local.checking') }}
    </p>
    <AgentInstanceWizard
      :open="wizardOpen"
      :native="Boolean(local)"
      :existing-slugs="instances.map((item) => item.instanceId)"
      :busy="busy"
      :error="Boolean(failure)"
      @close="wizardOpen = false"
      @create-mastra="createMastra"
      @save-local="createNative"
    />
  </section>
</template>
