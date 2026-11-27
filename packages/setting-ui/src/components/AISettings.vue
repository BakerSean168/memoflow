<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, ChevronRight, Plus, RefreshCw } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useConfirm,
} from '@memoflow/ui-vue-shadcn';
import type {
  AgentInstance,
  AgentRegistrySnapshot,
  CreateAgentInstance,
  LocalAgentConnection,
  LocalAgentConnectionInput,
  LocalAgentStatus,
  LocalMcpClient,
  LocalMcpEndpoint,
  PermissionSnapshot,
} from '@memoflow/ai-contracts';
import { useSettingIdentityScope } from '../composables/useSettingIdentityScope';
import { settingUiHost } from '../setting-ui-host';

export type AISettingsPage = 'overview' | 'mcp-clients' | 'permissions' | 'activity';
export type AIActivityTab = 'mcp' | 'permissions';

const { SettingsSection, SettingsStatusBlock, AgentDriverIcon } = settingUiHost.components;
import AgentInstanceWizard from './AgentInstanceWizard.vue';
import LocalAgentSettings from './LocalAgentSettings.vue';
import MastraAgentSettings from './MastraAgentSettings.vue';
import AIActivitySettings from './AIActivitySettings.vue';
import AIPermissionSettings from './AIPermissionSettings.vue';
import ExternalMcpClients from './ExternalMcpClients.vue';
import NewSessionDefaultSettings from './NewSessionDefaultSettings.vue';

const page = defineModel<AISettingsPage>('page', { default: 'overview' });
const activityTab = defineModel<AIActivityTab>('activityTab', { default: 'mcp' });

const { t } = useI18n();
const registry = inject(settingUiHost.AI_AGENT_REGISTRY_KEY, undefined);
const local = inject(settingUiHost.AI_LOCAL_AGENT_KEY, undefined);
const ai = settingUiHost.useAiFacade();
const identityScope = useSettingIdentityScope();

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
let summaryGeneration = 0;
let disposed = false;

// Overview summaries load config/policy metadata only — never long gateway audit logs.
const mcpSummaryClients = ref<LocalMcpClient[] | null>(null);
const mcpSummaryEndpoint = ref<LocalMcpEndpoint | null>(null);
const mcpSummaryLoading = ref(false);
const mcpSummaryError = ref(false);
const mcpSummaryEndpointError = ref(false);
const permissionsSummarySnapshot = ref<PermissionSnapshot | null>(null);
const permissionsSummaryLoading = ref(false);
const permissionsSummaryError = ref(false);

const subpageHeading = ref<HTMLElement | null>(null);
const mcpNavTrigger = ref<{ $el: HTMLElement } | null>(null);
const permissionsNavTrigger = ref<{ $el: HTMLElement } | null>(null);
const activityNavTrigger = ref<{ $el: HTMLElement } | null>(null);
let lastNavSource: Exclude<AISettingsPage, 'overview'> | null = null;

// The authorization flow may finish while a previously started catalogue
// probe is still pending. Older replies must not overwrite verified models.
const probeEpochs = new Map<string, number>();
const instances = computed(() => settingUiHost.sortAgentInstances(snapshot.value?.instances ?? []));
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

const subpageTitle = computed(() => {
  if (page.value === 'mcp-clients') return t('setting.ai.localMcp.title');
  if (page.value === 'permissions') return t('setting.permissions.title');
  if (page.value === 'activity') return t('setting.ai.activity.title');
  return t('setting.ai.title');
});

const mcpSummaryText = computed(() => {
  if (mcpSummaryLoading.value && mcpSummaryClients.value === null) {
    return t('setting.ai.overview.mcpClientsLoading');
  }
  if (mcpSummaryError.value) return t('setting.ai.overview.mcpClientsError');
  const clients = mcpSummaryClients.value;
  if (!clients) return t('setting.ai.localMcp.title');
  const activeCount = clients.filter((client) => client.revokedAt === null).length;
  const revokedCount = clients.length - activeCount;
  const base =
    clients.length === 0
      ? t('setting.ai.overview.mcpClientsNone')
      : t('setting.ai.overview.mcpClientsSummary', {
          active: activeCount,
          revoked: revokedCount,
        });
  if (mcpSummaryEndpointError.value || mcpSummaryEndpoint.value === null) {
    return `${base} · ${t('setting.ai.overview.mcpClientsEndpointUnavailable')}`;
  }
  return base;
});

const permissionsSummaryText = computed(() => {
  if (permissionsSummaryLoading.value && permissionsSummarySnapshot.value === null) {
    return t('setting.ai.overview.permissionsLoading');
  }
  if (permissionsSummaryError.value) return t('setting.ai.overview.permissionsError');
  const current = permissionsSummarySnapshot.value;
  if (!current) return t('setting.permissions.description');
  const preset = current.settings.preset === 'on_demand' ? 'confirm_each' : current.settings.preset;
  const presetLabel = t(`setting.permissions.presets.${preset}`);
  if (current.rules.length > 0) {
    return t('setting.ai.overview.permissionsSummary', {
      preset: presetLabel,
      rules: current.rules.length,
    });
  }
  return presetLabel;
});

function openPage(target: AISettingsPage) {
  if (target !== 'overview') lastNavSource = target;
  page.value = target;
}

function openActivity(targetTab: AIActivityTab) {
  activityTab.value = targetTab;
  openPage('activity');
}

function failureMessage(error: unknown) {
  return settingUiHost.getAIErrorMessage(error, t, 'setting.agentInstances.instanceSaveError');
}
function statusLabel(instance: AgentInstance) {
  if (!instance.enabled) return t('setting.ai.inactiveProvider');
  if (checking.value[instance.instanceId]) return t('aiAssistant.local.checking');
  if (instance.driver === 'mastra')
    return snapshot.value?.bindings.some((binding) => binding.instanceId === instance.instanceId)
      ? t('setting.agentInstances.connectionReady')
      : t('setting.agentInstances.needsConfig');
  const status = statuses.value[instance.instanceId];
  if (status?.status === 'ready')
    return (
      settingUiHost.getNativeAgentExecutionFailureMessage(status.lastExecutionFailure, t) ||
      t('setting.agentInstances.discoveredModels', {
        count: status.models.length,
      })
    );
  if (instance.driver === 'antigravity') {
    if (status?.status === 'login_required')
      return t('setting.agentInstances.antigravityLoginRequired');
    if (status?.status === 'not_installed')
      return t('setting.agentInstances.antigravityExecutableMissing');
    if (status?.status === 'unavailable') return t('setting.agentInstances.antigravityUnavailable');
    return t('setting.agentInstances.unchecked');
  }
  return status?.message ?? t('setting.agentInstances.unchecked');
}
function statusVersion(instanceId: string): string | undefined {
  const status = statuses.value[instanceId];
  return status?.status === 'ready' ? status.version : undefined;
}
async function refreshGovernanceSummary() {
  if (!local || page.value !== 'overview') return;
  const current = ++summaryGeneration;
  const expectedScope = identityScope.value;

  const canReadMcpClients = typeof local.listMcpClients === 'function';
  const canReadEndpoint = typeof local.getMcpEndpoint === 'function';
  const canReadPermissions = typeof local.permissions === 'function';

  if (canReadMcpClients || canReadEndpoint) {
    mcpSummaryLoading.value = true;
    mcpSummaryError.value = false;
    mcpSummaryEndpointError.value = false;
  }
  if (canReadPermissions) {
    permissionsSummaryLoading.value = true;
    permissionsSummaryError.value = false;
  }

  const [clientsResult, endpointResult, permissionsResult] = await Promise.allSettled([
    canReadMcpClients ? local.listMcpClients() : Promise.resolve(null),
    canReadEndpoint ? local.getMcpEndpoint() : Promise.resolve(null),
    canReadPermissions ? local.permissions({ action: 'snapshot' }) : Promise.resolve(null),
  ]);

  if (disposed || current !== summaryGeneration || identityScope.value !== expectedScope) return;

  if (canReadMcpClients) {
    if (clientsResult.status === 'fulfilled') mcpSummaryClients.value = clientsResult.value;
    else mcpSummaryError.value = true;
  }
  if (canReadEndpoint) {
    if (endpointResult.status === 'fulfilled') mcpSummaryEndpoint.value = endpointResult.value;
    else {
      mcpSummaryEndpoint.value = null;
      mcpSummaryEndpointError.value = true;
    }
  }
  mcpSummaryLoading.value = false;

  if (canReadPermissions) {
    if (permissionsResult.status === 'fulfilled') {
      permissionsSummarySnapshot.value = permissionsResult.value;
    } else {
      permissionsSummaryError.value = true;
    }
  }
  permissionsSummaryLoading.value = false;
}
async function refresh() {
  if (!registry) {
    failure.value = t('setting.agentInstances.registryUnavailable');
    return;
  }
  const current = ++generation;
  // A refresh may cross Desktop identities or Native Homes. Never expose a
  // previous profile's probe/account snapshot while a new Registry is loading.
  statuses.value = {};
  checking.value = {};
  loading.value = true;
  try {
    const [registryResult, nativeResult, providerResult] = await Promise.allSettled([
      registry.list(),
      local ? local.listConnections() : Promise.resolve([]),
      ai.loadProviders(),
    ]);
    if (disposed || current !== generation) return;
    if (registryResult.status === 'fulfilled') {
      snapshot.value = registryResult.value;
      if (!instances.value.some((item) => item.instanceId === selectedId.value))
        selectedId.value = instances.value[0]?.instanceId ?? '';
    }
    if (nativeResult.status === 'fulfilled') nativeConnections.value = nativeResult.value;
    const failed = [registryResult, nativeResult, providerResult].find(
      (result) => result.status === 'rejected',
    );
    failure.value = failed?.status === 'rejected' ? failureMessage(failed.reason) : '';
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
            nativePermissionMode: input.nativePermissionMode,
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
          nativePermissionMode: input.nativePermissionMode,
        },
      },
    }),
  );
}
async function resetSelected() {
  const current = selected.value;
  if (!current || current.instanceId !== current.driver) return;
  const confirmed = await useConfirm({
    title: t('setting.agentInstances.resetDefaultConfirmTitle'),
    description: t('setting.agentInstances.resetDefaultConfirmDescription'),
    confirmText: t('setting.agentInstances.resetDefault'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  await mutate(() =>
    registry!.execute({
      action: 'reset',
      instanceId: current.instanceId,
      expectedRevision: current.revision,
    }),
  );
  delete statuses.value[current.instanceId];
  if (selected.value) void probe(selected.value);
}
async function removeSelected() {
  const current = selected.value;
  if (!current?.revision || current.instanceId === current.driver) return;
  const confirmed = await useConfirm({
    title: t('setting.agentInstances.deleteProviderConfirmTitle'),
    description: t('setting.agentInstances.deleteProviderConfirmDescription', {
      count: bindings.value.length,
    }),
    confirmText: t('setting.ai.deleteProvider'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  await mutate(() =>
    registry!.execute({
      action: 'remove',
      instanceId: current.instanceId,
      expectedRevision: current.revision,
    }),
  );
}
function applyVerifiedModels(instanceId: string, status: LocalAgentStatus) {
  if (disposed || status.status !== 'ready') return;
  const instance = instances.value.find((item) => item.instanceId === instanceId);
  if (!instance || !instance.enabled || instance.driver !== 'antigravity') return;
  probeEpochs.set(instanceId, (probeEpochs.get(instanceId) ?? 0) + 1);
  statuses.value[instanceId] = status;
  checking.value[instanceId] = false;
}
async function probe(instance: AgentInstance, fresh = false) {
  if (
    !local ||
    instance.driver === 'mastra' ||
    !instance.enabled ||
    loading.value ||
    checking.value[instance.instanceId]
  )
    return;
  const epoch = generation;
  const probeId = (probeEpochs.get(instance.instanceId) ?? 0) + 1;
  probeEpochs.set(instance.instanceId, probeId);
  checking.value[instance.instanceId] = true;
  const isCurrent = () =>
    !disposed && epoch === generation && probeEpochs.get(instance.instanceId) === probeId;
  try {
    if (!fresh) {
      // Mount/selection reads the persisted snapshot only. A missing or
      // non-ready snapshot is presented as-is; Desktop schedules the refresh
      // and the next read/recheck converges without starting a process.
      const snapshot = await local.cachedCatalogConnection(
        instance.legacyConnectionId ?? `implicit:${instance.driver}`,
      );
      if (!isCurrent()) return;
      if (snapshot) statuses.value[instance.instanceId] = snapshot;
      else delete statuses.value[instance.instanceId];
      return;
    }
    // The explicit Recheck button, an inline check and the post-login verify
    // keep their synchronous probe semantics and write the resulting snapshot.
    const result = instance.legacyConnectionId
      ? await local.probeConnection(instance.legacyConnectionId)
      : await local.probeDefaultDriver(instance.driver);
    if (isCurrent()) statuses.value[instance.instanceId] = result;
  } catch {
    if (!isCurrent()) return;
    if (fresh)
      statuses.value[instance.instanceId] = {
        status: 'unavailable',
        message: t('aiAssistant.local.actionFailed'),
      };
    else delete statuses.value[instance.instanceId];
  } finally {
    if (isCurrent()) checking.value[instance.instanceId] = false;
  }
}
async function recheck(fresh = false) {
  await refresh();
  const candidates = instances.value
    .filter((item) => item.driver !== 'mastra' && item.enabled)
    // Let the cheap AGY snapshot hydrate before unrelated CLI checks.
    .sort((a, b) => Number(b.driver === 'antigravity') - Number(a.driver === 'antigravity'));
  for (let index = 0; index < candidates.length && !disposed; index += 2)
    await Promise.allSettled(
      candidates.slice(index, index + 2).map((instance) =>
        // A Google login may have completed and verified its models while
        // earlier provider checks were running. Do not probe AGY twice.
        instance.driver === 'antigravity' && statuses.value[instance.instanceId]?.status === 'ready'
          ? Promise.resolve()
          : probe(instance, fresh),
      ),
    );
}
function select(instance: AgentInstance) {
  selectedId.value = instance.instanceId;
  if (!statuses.value[instance.instanceId]) void probe(instance);
}
async function configured() {
  await refresh();
}

watch(page, async (value, previous) => {
  if (value === 'overview' && previous !== 'overview') {
    void refreshGovernanceSummary();
  }
  await nextTick();
  if (value !== 'overview') {
    subpageHeading.value?.focus();
    return;
  }
  if (previous !== 'overview') {
    const source = lastNavSource ?? (previous as Exclude<AISettingsPage, 'overview'>);
    const trigger =
      source === 'mcp-clients'
        ? mcpNavTrigger.value
        : source === 'permissions'
          ? permissionsNavTrigger.value
          : activityNavTrigger.value;
    trigger?.$el?.focus();
  }
});

watch(identityScope, () => {
  summaryGeneration += 1;
  mcpSummaryClients.value = null;
  mcpSummaryEndpoint.value = null;
  mcpSummaryError.value = false;
  mcpSummaryEndpointError.value = false;
  permissionsSummarySnapshot.value = null;
  permissionsSummaryError.value = false;
  if (page.value === 'overview') void refreshGovernanceSummary();
});

onMounted(() => {
  void recheck();
  if (page.value === 'overview') void refreshGovernanceSummary();
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  summaryGeneration++;
});
</script>

<template>
  <section data-testid="ai-settings-panel" class="space-y-8">
    <template v-if="page === 'overview'">
      <header class="flex items-center justify-between gap-3 px-1">
        <div class="flex items-center gap-1">
          <h2 class="text-xl font-semibold tracking-tight">{{ t('setting.ai.providerList') }}</h2>
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
          @click="recheck(true)"
          ><RefreshCw class="size-3.5" :class="{ 'animate-spin': loading }" />{{
            t('setting.ai.recheckProviders')
          }}</Button
        >
      </header>
      <SettingsStatusBlock
        v-if="failure"
        kind="error"
        :description="failure"
        test-id="ai-provider-error"
      />
      <div
        v-if="instances.length"
        class="grid min-h-[34rem] overflow-hidden border-b border-[hsl(var(--border-subtle))] lg:grid-cols-[15.5rem_minmax(0,1fr)]"
      >
        <TooltipProvider :delay-duration="300">
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
              class="flex h-20 min-h-0 items-center gap-2 overflow-hidden border-b border-[hsl(var(--border-subtle))] px-3 py-2 last:border-b-0"
              :class="selectedId === instance.instanceId ? 'bg-muted/50' : 'hover:bg-muted/25'"
            >
              <Tooltip>
                <TooltipTrigger as-child>
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-1.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    :class="[
                      selectedId === instance.instanceId ? 'ring-1 ring-inset ring-primary/65' : '',
                      !instance.enabled ? 'opacity-45' : '',
                    ]"
                    :aria-current="selectedId === instance.instanceId ? 'true' : undefined"
                    :aria-label="instance.name"
                    :data-testid="`ai-provider-select-agent:${instance.instanceId}`"
                    @click="select(instance)"
                  >
                    <AgentDriverIcon
                      :driver="instance.driver"
                      class="mt-0.5 size-4"
                      :style="{ color: instance.accentColor }"
                    />
                    <span class="min-w-0 flex-1"
                      ><span class="flex min-w-0 items-baseline gap-1.5"
                        ><span class="min-w-0 truncate text-[13px] font-semibold">{{
                          instance.name
                        }}</span
                        ><span
                          v-if="statusVersion(instance.instanceId)"
                          class="max-w-20 shrink-0 truncate font-mono text-[10px] text-muted-foreground"
                          :title="statusVersion(instance.instanceId)"
                          data-testid="ai-provider-list-runtime-version"
                          >{{ statusVersion(instance.instanceId) }}</span
                        ></span
                      ><span
                        class="mt-1 block max-w-full truncate whitespace-nowrap text-[11px] leading-4 text-muted-foreground"
                        >{{ statusLabel(instance) }}</span
                      ></span
                    >
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  align="start"
                  class="max-w-[min(28rem,calc(100vw-2rem))] whitespace-pre-wrap break-words text-left [overflow-wrap:anywhere]"
                  :aria-label="statusLabel(instance)"
                >
                  {{ statusLabel(instance) }}
                </TooltipContent>
              </Tooltip>
              <Switch
                :model-value="instance.enabled"
                :disabled="busy || loading"
                :aria-label="t('setting.ai.enableProvider', { name: instance.name })"
                :data-testid="`ai-provider-toggle-${instance.instanceId}`"
                @update:model-value="toggle(instance, $event)"
              />
            </div>
          </div>
        </TooltipProvider>
        <div class="min-w-0 py-4 lg:pl-6">
          <MastraAgentSettings
            v-if="selected?.driver === 'mastra'"
            :key="selected.instanceId"
            :instance="selected"
            :providers="ai.providers.value"
            :bindings="bindings"
            :all-bindings="snapshot?.bindings ?? []"
            :busy="busy"
            @changed="configured"
            @rename="rename"
            @remove="removeSelected"
            @reset="resetSelected"
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
            :is-default="selected.instanceId === selected.driver"
            :revision="selected.revision"
            :busy="busy || Boolean(checking[selected.instanceId])"
            :error="Boolean(failure)"
            @save="saveNative"
            @toggle="toggle(selected, $event)"
            @check="probe(selected, true)"
            @verified="applyVerifiedModels(selected.instanceId, $event)"
            @remove="removeSelected"
            @reset="resetSelected"
            @cancel="selectedId = instances[0]?.instanceId ?? ''"
          />
        </div>
      </div>
      <SettingsStatusBlock
        v-else-if="loading"
        kind="loading"
        :title="t('aiAssistant.local.checking')"
        test-id="ai-provider-loading"
      />
      <NewSessionDefaultSettings
        :instances="instances"
        :bindings="snapshot?.bindings ?? []"
        :providers="ai.providers.value"
      />
      <SettingsSection
        v-if="local"
        :title="t('setting.ai.moreSectionTitle')"
        :description="t('setting.ai.moreSectionDescription')"
        test-id="ai-governance-navigation"
      >
        <div class="divide-y divide-border/60">
          <Button
            ref="mcpNavTrigger"
            variant="ghost"
            type="button"
            data-testid="ai-nav-mcp-clients"
            class="flex h-auto w-full items-center justify-between gap-4 whitespace-normal rounded-md px-2 py-3.5 text-left font-normal hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="openPage('mcp-clients')"
          >
            <div class="min-w-0 space-y-0.5">
              <p class="text-sm font-medium text-foreground">
                {{ t('setting.ai.localMcp.title') }}
              </p>
              <p
                class="truncate text-xs text-muted-foreground"
                data-testid="ai-nav-mcp-clients-summary"
              >
                {{ mcpSummaryText }}
              </p>
            </div>
            <ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
          <Button
            ref="permissionsNavTrigger"
            variant="ghost"
            type="button"
            data-testid="ai-nav-permissions"
            class="flex h-auto w-full items-center justify-between gap-4 whitespace-normal rounded-md px-2 py-3.5 text-left font-normal hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="openPage('permissions')"
          >
            <div class="min-w-0 space-y-0.5">
              <p class="text-sm font-medium text-foreground">
                {{ t('setting.permissions.title') }}
              </p>
              <p
                class="truncate text-xs text-muted-foreground"
                data-testid="ai-nav-permissions-summary"
              >
                {{ permissionsSummaryText }}
              </p>
            </div>
            <ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
          <Button
            ref="activityNavTrigger"
            variant="ghost"
            type="button"
            data-testid="ai-nav-activity"
            class="flex h-auto w-full items-center justify-between gap-4 whitespace-normal rounded-md px-2 py-3.5 text-left font-normal hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="openActivity('mcp')"
          >
            <div class="min-w-0 space-y-0.5">
              <p class="text-sm font-medium text-foreground">
                {{ t('setting.ai.activity.title') }}
              </p>
              <p
                class="truncate text-xs text-muted-foreground"
                data-testid="ai-nav-activity-summary"
              >
                {{ t('setting.ai.overview.activitySummary') }}
              </p>
            </div>
            <ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        </div>
      </SettingsSection>
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
    </template>

    <div v-else class="space-y-6" data-testid="ai-settings-subpage">
      <div class="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          class="gap-2 px-2"
          data-testid="ai-subpage-back"
          @click="openPage('overview')"
        >
          <ArrowLeft class="size-4" aria-hidden="true" />
          {{ t('setting.ai.backToOverview') }}
        </Button>
      </div>
      <h2 ref="subpageHeading" tabindex="-1" class="sr-only outline-none">
        {{ subpageTitle }}
      </h2>
      <ExternalMcpClients v-if="page === 'mcp-clients'" @open-activity="openActivity('mcp')" />
      <AIPermissionSettings
        v-else-if="page === 'permissions'"
        @open-activity="openActivity('permissions')"
      />
      <AIActivitySettings v-else-if="page === 'activity'" v-model:tab="activityTab" />
    </div>
  </section>
</template>
