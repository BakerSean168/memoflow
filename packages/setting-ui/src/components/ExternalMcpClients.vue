<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowUpRight, ChevronDown, Copy, Plus, RefreshCw, ShieldOff } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { extractStructuredResultError } from '@memoflow/transport-contracts/result';
import { Badge, Button, Checkbox, Dialog, Input, Label, useConfirm } from '@memoflow/ui-vue-shadcn';
import type {
  LocalAgentWriteScope,
  LocalMcpClient,
  LocalMcpClientCredential,
  LocalMcpEndpoint,
} from '@memoflow/ai-contracts';
import { useSettingIdentityScope } from '../composables/useSettingIdentityScope';
import { settingUiHost } from '../setting-ui-host';

const emit = defineEmits<{ 'open-activity': [] }>();

const { SettingsDialogShell, SettingsObjectCard, SettingsSection, SettingsStatusBlock } =
  settingUiHost.components;
const { t } = useI18n();
const local = inject(settingUiHost.AI_LOCAL_AGENT_KEY, undefined);
const identityScope = useSettingIdentityScope();

const clients = ref<LocalMcpClient[]>([]);
const endpoint = ref<LocalMcpEndpoint | null>(null);
const credential = ref<LocalMcpClientCredential | null>(null);
const name = ref('');
const writeScopes = ref<LocalAgentWriteScope[]>([]);
const busy = ref(false);
const loading = ref(false);
// Empty and loading are different facts: a zero-length list only means "none"
// after the host has replied, otherwise the section would claim no clients
// while the first read is still in flight.
const loaded = ref(false);
const error = ref('');
// Copy feedback is per control and self-clears, so the token and snippet
// buttons can never both claim to have been copied.
type CopyTarget = 'token' | 'snippet' | 'endpoint' | 'discovery';
const copied = ref<CopyTarget | null>(null);
const createOpen = ref(false);
const COPY_FEEDBACK_MS = 2000;
let copyTimer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
let disposed = false;

const scopes = [
  { value: 'tasks:write' as const, label: t('setting.ai.localMcp.scopeTasks') },
  { value: 'goals:write' as const, label: t('setting.ai.localMcp.scopeGoals') },
  {
    value: 'routines:write' as const,
    label: t('setting.ai.localMcp.scopeRoutines'),
  },
  {
    value: 'notifications:write' as const,
    label: t('setting.ai.localMcp.scopeNotifications'),
  },
  {
    value: 'schedules:write' as const,
    label: t('setting.ai.localMcp.scopeSchedules'),
  },
  {
    value: 'knowledge:write' as const,
    label: t('setting.ai.localMcp.scopeKnowledge'),
  },
];
const active = computed(() => clients.value.filter((client) => client.revokedAt === null));
const revoked = computed(() => clients.value.filter((client) => client.revokedAt !== null));
const canCreate = computed(
  () => Boolean(local && endpoint.value) && name.value.trim().length > 0 && !busy.value,
);
const snippet = computed(() => {
  const current = credential.value;
  const url = current?.endpoint.url;
  if (!current || !url) return '';
  return JSON.stringify(
    {
      mcpServers: {
        memoflow: {
          type: 'http',
          url,
          headers: { Authorization: `Bearer ${current.token}` },
        },
      },
    },
    null,
    2,
  );
});

function toggle(value: LocalAgentWriteScope, enabled: boolean | 'indeterminate') {
  writeScopes.value =
    enabled === true
      ? [...new Set([...writeScopes.value, value])]
      : writeScopes.value.filter((item) => item !== value);
}

function failureMessage(cause: unknown): string {
  switch (extractStructuredResultError(cause)?.code) {
    case 'LOCAL_MCP_PORT_IN_USE':
      return t('setting.ai.localMcp.portInUse');
    case 'LOCAL_MCP_BINDING_INVALID':
      return t('setting.ai.localMcp.bindingInvalid');
    default:
      return t('setting.ai.localMcp.error');
  }
}

async function refresh() {
  if (!local) return;
  const current = ++generation;
  const expectedScope = identityScope.value;
  loading.value = true;
  error.value = '';
  try {
    const [endpointResult, clientsResult] = await Promise.allSettled([
      typeof local.getMcpEndpoint === 'function' ? local.getMcpEndpoint() : Promise.resolve(null),
      typeof local.listMcpClients === 'function' ? local.listMcpClients() : Promise.resolve([]),
    ]);
    if (disposed || current !== generation || identityScope.value !== expectedScope) return;

    let endpointFailure = '';
    if (endpointResult.status === 'fulfilled') {
      endpoint.value = endpointResult.value;
    } else {
      endpoint.value = null;
      endpointFailure = failureMessage(endpointResult.reason);
    }

    let clientsFailure = '';
    if (clientsResult.status === 'fulfilled') {
      clients.value = clientsResult.value;
    } else {
      clientsFailure = t('setting.ai.localMcp.clientsError');
    }

    error.value = endpointFailure || clientsFailure;
  } finally {
    if (!disposed && current === generation && identityScope.value === expectedScope) {
      loading.value = false;
      loaded.value = true;
    }
  }
}

async function create() {
  if (!local?.createMcpClient || !canCreate.value) return;
  busy.value = true;
  error.value = '';
  try {
    const created = await local.createMcpClient({
      name: name.value.trim(),
      writeScopes: writeScopes.value,
    });
    if (disposed) return;
    credential.value = created;
    copied.value = null;
    name.value = '';
    writeScopes.value = [];
    await refresh();
    if (disposed) return;
    // The new client sits at the top regardless of the host's list ordering.
    clients.value = [
      created.client,
      ...clients.value.filter((client) => client.id !== created.client.id),
    ];
  } catch (cause) {
    if (!disposed) error.value = failureMessage(cause);
  } finally {
    if (!disposed) busy.value = false;
  }
}

function openCreateDialog() {
  error.value = '';
  name.value = '';
  writeScopes.value = [];
  credential.value = null;
  copied.value = null;
  createOpen.value = true;
}

function closeCreateDialog() {
  createOpen.value = false;
  credential.value = null;
  copied.value = null;
  name.value = '';
  writeScopes.value = [];
  error.value = '';
}

function handleCreateOpenChange(open: boolean) {
  if (open) openCreateDialog();
  else closeCreateDialog();
}

async function revoke(client: LocalMcpClient) {
  if (!local?.revokeMcpClient || busy.value) return;
  const confirmed = await useConfirm({
    title: t('setting.ai.localMcp.revokeConfirmTitle', { name: client.name }),
    description: t('setting.ai.localMcp.revokeConfirmDescription'),
    confirmText: t('setting.ai.localMcp.revoke'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed || busy.value || disposed) return;
  busy.value = true;
  error.value = '';
  try {
    await local.revokeMcpClient(client.id);
    if (disposed) return;
    if (credential.value?.client.id === client.id) credential.value = null;
    await refresh();
  } catch (cause) {
    if (!disposed) error.value = failureMessage(cause);
  } finally {
    if (!disposed) busy.value = false;
  }
}

async function copy(text: string, target: CopyTarget) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = target;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyTimer = null;
      copied.value = null;
    }, COPY_FEEDBACK_MS);
  } catch {
    copied.value = null;
  }
}

function scopeLabel(client: LocalMcpClient) {
  if (!client.writeScopes.length) return t('setting.ai.localMcp.readOnly');
  return client.writeScopes
    .map((value) =>
      t(
        value === 'tasks:write'
          ? 'setting.ai.localMcp.scopeTasks'
          : value === 'goals:write'
            ? 'setting.ai.localMcp.scopeGoals'
            : value === 'notifications:write'
              ? 'setting.ai.localMcp.scopeNotifications'
              : value === 'schedules:write'
                ? 'setting.ai.localMcp.scopeSchedules'
                : value === 'knowledge:write'
                  ? 'setting.ai.localMcp.scopeKnowledge'
                  : 'setting.ai.localMcp.scopeRoutines',
      ),
    )
    .join(' · ');
}

function formatDate(value: number) {
  return new Date(value).toLocaleString();
}

watch(identityScope, () => {
  generation += 1;
  clients.value = [];
  endpoint.value = null;
  credential.value = null;
  loaded.value = false;
  error.value = '';
  createOpen.value = false;
  void refresh();
});

onMounted(() => {
  void refresh();
});

onBeforeUnmount(() => {
  disposed = true;
  generation += 1;
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<template>
  <SettingsSection
    v-if="local"
    :title="t('setting.ai.localMcp.title')"
    :description="t('setting.ai.localMcp.description')"
    test-id="ai-external-mcp-clients"
  >
    <template #actions>
      <Button
        variant="ghost"
        size="sm"
        class="h-8 gap-1.5"
        data-testid="ai-external-mcp-open-activity"
        @click="emit('open-activity')"
      >
        {{ t('setting.ai.localMcp.openActivity') }}
        <ArrowUpRight class="size-3.5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-8 gap-1.5"
        :disabled="loading"
        data-testid="ai-external-mcp-refresh"
        @click="refresh"
      >
        <RefreshCw class="size-3.5" :class="{ 'animate-spin': loading }" />
        {{ t('setting.ai.localMcp.refresh') }}
      </Button>
      <Button
        size="sm"
        class="h-8 shrink-0 gap-1.5"
        data-testid="ai-external-mcp-create-open"
        :disabled="!endpoint || loading"
        @click="openCreateDialog"
      >
        <Plus class="size-3.5" />{{ t('setting.ai.localMcp.createClient') }}
      </Button>
    </template>

    <div class="space-y-5">
      <SettingsObjectCard>
        <div class="space-y-3">
          <div v-if="endpoint" class="flex flex-wrap items-center justify-between gap-2">
            <p class="min-w-0 flex-1 break-all text-xs text-muted-foreground">
              <span class="mr-1.5 font-medium text-foreground">
                {{ t('setting.ai.localMcp.endpoint') }}:
              </span>
              <code data-testid="ai-external-mcp-endpoint">{{ endpoint.url }}</code>
            </p>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 shrink-0 gap-1 px-2 text-xs"
              data-testid="ai-external-mcp-copy-endpoint"
              @click="copy(endpoint.url, 'endpoint')"
            >
              <Copy class="size-3.5" />
              {{
                copied === 'endpoint'
                  ? t('setting.ai.localMcp.copied')
                  : t('setting.ai.localMcp.copyEndpoint')
              }}
            </Button>
          </div>
          <div v-else class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <p>{{ t('setting.ai.localMcp.noEndpoint') }}</p>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-xs"
              :disabled="loading"
              data-testid="ai-external-mcp-retry"
              @click="refresh"
            >
              {{ t('setting.ai.localMcp.retry') }}
            </Button>
          </div>

          <details
            v-if="endpoint?.discoveryPath"
            class="group border-t border-border/60 pt-2.5"
            data-testid="ai-external-mcp-technical-details"
          >
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
            >
              <span>{{ t('setting.ai.localMcp.technicalDetails') }}</span>
              <ChevronDown
                class="size-4 shrink-0 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p class="min-w-0 flex-1 break-all text-xs text-muted-foreground">
                <span class="mr-1.5 font-medium text-foreground">
                  {{ t('setting.ai.localMcp.discovery') }}:
                </span>
                <code data-testid="ai-external-mcp-discovery-path">{{
                  endpoint.discoveryPath
                }}</code>
              </p>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 shrink-0 gap-1 px-2 text-xs"
                data-testid="ai-external-mcp-copy-discovery"
                @click="copy(endpoint.discoveryPath, 'discovery')"
              >
                <Copy class="size-3.5" />
                {{
                  copied === 'discovery'
                    ? t('setting.ai.localMcp.copied')
                    : t('setting.ai.localMcp.copyDiscoveryPath')
                }}
              </Button>
            </div>
          </details>
        </div>
      </SettingsObjectCard>

      <SettingsStatusBlock
        v-if="error && !createOpen"
        kind="error"
        :description="error"
        test-id="ai-external-mcp-error"
      />

      <Dialog :open="createOpen" @update:open="handleCreateOpenChange">
        <SettingsDialogShell
          :title="
            credential
              ? t('setting.ai.localMcp.createdTitle')
              : t('setting.ai.localMcp.createClient')
          "
          :description="
            credential
              ? t('setting.ai.localMcp.createdDescription')
              : t('setting.ai.localMcp.createDescription')
          "
          test-id="ai-external-mcp-create-dialog"
        >
          <form
            v-if="!credential"
            id="ai-external-mcp-create-form"
            class="space-y-3"
            data-testid="ai-external-mcp-create-form"
            @submit.prevent="create"
          >
            <div class="space-y-1">
              <Label for="ai-external-mcp-name" class="text-xs">{{
                t('setting.ai.localMcp.name')
              }}</Label>
              <Input
                id="ai-external-mcp-name"
                v-model="name"
                :placeholder="t('setting.ai.localMcp.namePlaceholder')"
                maxlength="80"
                data-testid="ai-external-mcp-name"
              />
            </div>
            <div class="space-y-1">
              <p class="text-xs font-medium text-foreground">
                {{ t('setting.ai.localMcp.scopes') }}
              </p>
              <div class="flex flex-wrap items-center gap-3">
                <label
                  v-for="scope in scopes"
                  :key="scope.value"
                  class="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Checkbox
                    :model-value="writeScopes.includes(scope.value)"
                    :data-testid="`ai-external-mcp-scope-${scope.value}`"
                    @update:model-value="toggle(scope.value, $event)"
                  />
                  {{ scope.label }}
                </label>
              </div>
            </div>
            <p v-if="error" class="text-xs text-destructive" data-testid="ai-external-mcp-error">
              {{ error }}
            </p>
          </form>

          <div
            v-else
            class="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3"
            data-testid="ai-external-mcp-credential"
          >
            <p class="text-xs font-medium">
              {{ t('setting.ai.localMcp.tokenOnce') }}
            </p>
            <div class="flex items-center gap-2">
              <code class="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{{
                credential.token
              }}</code>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 gap-1 px-2 text-xs"
                data-testid="ai-external-mcp-copy-token"
                @click="copy(credential.token, 'token')"
              >
                <Copy class="size-3.5" />{{
                  copied === 'token'
                    ? t('setting.ai.localMcp.copied')
                    : t('setting.ai.localMcp.copy')
                }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ t('setting.ai.localMcp.tokenWarning') }}
            </p>
            <div class="space-y-1">
              <p class="text-xs font-medium">
                {{ t('setting.ai.localMcp.config') }}
              </p>
              <pre
                class="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted px-2 py-1 text-xs"
                data-testid="ai-external-mcp-snippet"
                >{{ snippet }}</pre>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 gap-1 px-2 text-xs"
                data-testid="ai-external-mcp-copy-snippet"
                @click="copy(snippet, 'snippet')"
              >
                <Copy class="size-3.5" />{{
                  copied === 'snippet'
                    ? t('setting.ai.localMcp.copied')
                    : t('setting.ai.localMcp.copy')
                }}
              </Button>
            </div>
          </div>

          <template #footer>
            <template v-if="credential">
              <Button data-testid="ai-external-mcp-create-done" @click="closeCreateDialog">{{
                t('common.close')
              }}</Button>
            </template>
            <template v-else>
              <Button
                variant="outline"
                data-testid="ai-external-mcp-create-cancel"
                @click="closeCreateDialog"
              >
                {{ t('common.cancel') }}
              </Button>
              <Button
                type="submit"
                form="ai-external-mcp-create-form"
                :disabled="!canCreate"
                data-testid="ai-external-mcp-create"
                >{{ t('setting.ai.localMcp.create') }}</Button
              >
            </template>
          </template>
        </SettingsDialogShell>
      </Dialog>

      <SettingsStatusBlock
        v-if="!loaded"
        kind="loading"
        :title="t('setting.ai.localMcp.loading')"
        test-id="ai-external-mcp-loading"
      />
      <p
        v-else-if="!clients.length && !error"
        class="text-xs text-muted-foreground"
        data-testid="ai-external-mcp-empty"
      >
        {{ t('setting.ai.localMcp.empty') }}
      </p>
      <p
        v-else-if="clients.length && !active.length"
        class="text-xs text-muted-foreground"
        data-testid="ai-external-mcp-empty-active"
      >
        {{ t('setting.ai.localMcp.emptyActive') }}
      </p>

      <SettingsObjectCard v-if="active.length">
        <div class="space-y-2">
          <h3 class="text-xs font-semibold text-foreground">
            {{ t('setting.ai.localMcp.activeTitle') }}
          </h3>
          <ul class="divide-y divide-border/60">
            <li
              v-for="client in active"
              :key="client.id"
              class="flex flex-col gap-2 py-3 first:pt-1 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              :data-testid="`ai-external-mcp-client-${client.id}`"
            >
              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="break-words text-sm font-medium text-foreground">{{ client.name }}</p>
                  <Badge variant="secondary" class="text-[11px] font-normal">
                    {{ t('setting.ai.localMcp.activeStatus') }}
                  </Badge>
                </div>
                <p class="break-words text-xs text-muted-foreground">
                  {{ scopeLabel(client) }} · {{ t('setting.ai.localMcp.createdAt') }}
                  {{ formatDate(client.createdAt) }} ·
                  <code>{{ client.tokenPrefix }}…</code>
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 shrink-0 gap-1 self-start px-2 text-xs sm:self-center"
                :disabled="busy"
                :data-testid="`ai-external-mcp-revoke-${client.id}`"
                @click="revoke(client)"
              >
                <ShieldOff class="size-3.5" />{{ t('setting.ai.localMcp.revoke') }}
              </Button>
            </li>
          </ul>
        </div>
      </SettingsObjectCard>

      <SettingsObjectCard v-if="revoked.length" test-id="ai-external-mcp-revoked">
        <div class="space-y-2">
          <h3 class="text-xs font-semibold text-foreground">
            {{ t('setting.ai.localMcp.revokedTitle') }}
          </h3>
          <ul class="divide-y divide-border/60">
            <li
              v-for="client in revoked"
              :key="client.id"
              class="flex flex-col gap-2 py-3 first:pt-1 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              :data-testid="`ai-external-mcp-revoked-client-${client.id}`"
            >
              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="break-words text-sm font-medium text-foreground">{{ client.name }}</p>
                  <Badge variant="outline" class="text-[11px] font-normal text-muted-foreground">
                    {{ t('setting.ai.localMcp.revoked') }}
                  </Badge>
                </div>
                <p class="break-words text-xs text-muted-foreground">
                  {{ scopeLabel(client) }} · {{ t('setting.ai.localMcp.createdAt') }}
                  {{ formatDate(client.createdAt) }} · {{ t('setting.ai.localMcp.revokedAt') }}
                  {{ formatDate(client.revokedAt ?? 0) }} ·
                  <code>{{ client.tokenPrefix }}…</code>
                </p>
              </div>
            </li>
          </ul>
        </div>
      </SettingsObjectCard>
    </div>
  </SettingsSection>
</template>
