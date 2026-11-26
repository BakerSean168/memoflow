<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { Copy, Plus, RefreshCw, ShieldOff } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { extractStructuredResultError } from '@memoflow/transport-contracts/result';
import { Button, Checkbox, Dialog, Input, Label, useConfirm } from '@memoflow/ui-vue-shadcn';
import type {
  LocalAgentWriteScope,
  LocalGatewayAuditRecord,
  LocalMcpClient,
  LocalMcpClientCredential,
  LocalMcpEndpoint,
} from '@memoflow/ai-contracts';
import { settingUiHost } from '../setting-ui-host';

const { SettingsDialogShell } = settingUiHost.components;
const { t } = useI18n();
const local = inject(settingUiHost.AI_LOCAL_AGENT_KEY, undefined);
const clients = ref<LocalMcpClient[]>([]);
const audit = ref<LocalGatewayAuditRecord[]>([]);
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
type CopyTarget = 'token' | 'snippet';
const copied = ref<CopyTarget | null>(null);
const createOpen = ref(false);
const COPY_FEEDBACK_MS = 2000;
let copyTimer: ReturnType<typeof setTimeout> | null = null;

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
  loading.value = true;
  error.value = '';
  try {
    if (local.getMcpEndpoint) {
      endpoint.value = await local.getMcpEndpoint().catch((cause: unknown) => {
        error.value = failureMessage(cause);
        return null;
      });
    }
    if (local.listMcpClients) clients.value = await local.listMcpClients();
    if (local.listGatewayAudit) audit.value = await local.listGatewayAudit(20);
  } catch (cause) {
    error.value = failureMessage(cause);
  } finally {
    loading.value = false;
    loaded.value = true;
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
    credential.value = created;
    copied.value = null;
    name.value = '';
    writeScopes.value = [];
    await refresh();
    // The new client sits at the top regardless of the host's list ordering.
    clients.value = [
      created.client,
      ...clients.value.filter((client) => client.id !== created.client.id),
    ];
  } catch (cause) {
    error.value = failureMessage(cause);
  } finally {
    busy.value = false;
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
  if (!confirmed || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await local.revokeMcpClient(client.id);
    if (credential.value?.client.id === client.id) credential.value = null;
    await refresh();
  } catch (cause) {
    error.value = failureMessage(cause);
  } finally {
    busy.value = false;
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

function auditOrigin(entry: LocalGatewayAuditRecord) {
  if (entry.origin === 'run') return t('setting.ai.localMcp.auditOriginRun');
  return (
    clients.value.find((client) => client.id === entry.connectionId)?.name ??
    t('setting.ai.localMcp.auditOriginClient')
  );
}

function auditDecision(entry: LocalGatewayAuditRecord) {
  return t(
    entry.scopeDecision === 'allowed'
      ? 'setting.ai.localMcp.auditAllowed'
      : 'setting.ai.localMcp.auditDenied',
  );
}

function auditEffect(entry: LocalGatewayAuditRecord) {
  return t(
    entry.effect === 'write'
      ? 'setting.ai.localMcp.auditEffectWrite'
      : 'setting.ai.localMcp.auditEffectRead',
  );
}

onMounted(() => {
  void refresh();
});

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<template>
  <section
    v-if="local"
    data-testid="ai-external-mcp-clients"
    class="space-y-5 border-b border-border pb-8"
  >
    <header class="flex items-start justify-between gap-3">
      <div class="space-y-1">
        <h3 class="text-xl font-semibold tracking-tight">
          {{ t('setting.ai.localMcp.title') }}
        </h3>
      </div>
      <Button
        size="sm"
        class="h-8 shrink-0 gap-1.5"
        data-testid="ai-external-mcp-create-open"
        :disabled="!endpoint || loading"
        @click="openCreateDialog"
        ><Plus class="size-3.5" />{{ t('setting.ai.localMcp.createClient') }}</Button
      >
    </header>

    <div class="space-y-1 text-[11px] text-muted-foreground">
      <p v-if="endpoint" class="break-all">
        <span class="font-medium text-foreground">{{ t('setting.ai.localMcp.endpoint') }}:</span>
        <code data-testid="ai-external-mcp-endpoint">{{ endpoint.url }}</code>
      </p>
      <div v-else class="flex items-center gap-2">
        <p>{{ t('setting.ai.localMcp.noEndpoint') }}</p>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 px-2 text-[11px]"
          :disabled="loading"
          data-testid="ai-external-mcp-retry"
          @click="refresh"
          >{{ t('setting.ai.localMcp.retry') }}</Button
        >
      </div>
      <p v-if="endpoint?.discoveryPath" class="break-all">
        <span class="font-medium text-foreground">{{ t('setting.ai.localMcp.discovery') }}:</span>
        <code>{{ endpoint.discoveryPath }}</code>
      </p>
    </div>

    <p
      v-if="error && !createOpen"
      class="text-[11px] text-destructive"
      data-testid="ai-external-mcp-error"
    >
      {{ error }}
    </p>

    <Dialog :open="createOpen" @update:open="handleCreateOpenChange">
      <SettingsDialogShell
        :title="
          credential ? t('setting.ai.localMcp.createdTitle') : t('setting.ai.localMcp.createClient')
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
            <Label for="ai-external-mcp-name" class="text-[11px]">{{
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
            <p class="text-[11px] font-medium text-foreground">
              {{ t('setting.ai.localMcp.scopes') }}
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <label
                v-for="scope in scopes"
                :key="scope.value"
                class="flex items-center gap-1.5 text-[11px] text-muted-foreground"
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
          <p v-if="error" class="text-[11px] text-destructive" data-testid="ai-external-mcp-error">
            {{ error }}
          </p>
        </form>

        <div
          v-else
          class="space-y-2 rounded-lg border border-[hsl(var(--border-subtle))] bg-muted/20 p-3"
          data-testid="ai-external-mcp-credential"
        >
          <p class="text-[11px] font-medium">
            {{ t('setting.ai.localMcp.tokenOnce') }}
          </p>
          <div class="flex items-center gap-2">
            <code class="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 text-[11px]">{{
              credential.token
            }}</code>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 gap-1 px-2 text-[11px]"
              data-testid="ai-external-mcp-copy-token"
              @click="copy(credential.token, 'token')"
              ><Copy class="size-3.5" />{{
                copied === 'token' ? t('setting.ai.localMcp.copied') : t('setting.ai.localMcp.copy')
              }}</Button
            >
          </div>
          <p class="text-[11px] text-muted-foreground">
            {{ t('setting.ai.localMcp.tokenWarning') }}
          </p>
          <div class="space-y-1">
            <p class="text-[11px] font-medium">
              {{ t('setting.ai.localMcp.config') }}
            </p>
            <pre
              class="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted px-2 py-1 text-[11px]"
              data-testid="ai-external-mcp-snippet"
              >{{ snippet }}</pre>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 gap-1 px-2 text-[11px]"
              data-testid="ai-external-mcp-copy-snippet"
              @click="copy(snippet, 'snippet')"
              ><Copy class="size-3.5" />{{
                copied === 'snippet'
                  ? t('setting.ai.localMcp.copied')
                  : t('setting.ai.localMcp.copy')
              }}</Button
            >
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

    <p
      v-if="!loaded"
      class="text-[11px] text-muted-foreground"
      data-testid="ai-external-mcp-loading"
    >
      {{ t('setting.ai.localMcp.loading') }}
    </p>
    <p
      v-else-if="!clients.length"
      class="text-[11px] text-muted-foreground"
      data-testid="ai-external-mcp-empty"
    >
      {{ t('setting.ai.localMcp.empty') }}
    </p>
    <p
      v-else-if="!active.length"
      class="text-[11px] text-muted-foreground"
      data-testid="ai-external-mcp-empty-active"
    >
      {{ t('setting.ai.localMcp.emptyActive') }}
    </p>
    <ul v-if="active.length" class="divide-y divide-[hsl(var(--border-subtle))]">
      <li
        v-for="client in active"
        :key="client.id"
        class="flex items-center gap-3 py-2"
        :data-testid="`ai-external-mcp-client-${client.id}`"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-[12px] font-medium">{{ client.name }}</p>
          <p class="truncate text-[11px] text-muted-foreground">
            {{ scopeLabel(client) }} · {{ t('setting.ai.localMcp.createdAt') }}
            {{ formatDate(client.createdAt) }} ·
            <code>{{ client.tokenPrefix }}…</code>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 gap-1 px-2 text-[11px]"
          :disabled="busy"
          :data-testid="`ai-external-mcp-revoke-${client.id}`"
          @click="revoke(client)"
          ><ShieldOff class="size-3.5" />{{ t('setting.ai.localMcp.revoke') }}</Button
        >
      </li>
    </ul>

    <div
      v-if="revoked.length"
      class="space-y-1 border-t border-[hsl(var(--border-subtle))] pt-3"
      data-testid="ai-external-mcp-revoked"
    >
      <h4 class="text-[12px] font-semibold">
        {{ t('setting.ai.localMcp.revokedTitle') }}
      </h4>
      <ul class="divide-y divide-[hsl(var(--border-subtle))]">
        <li
          v-for="client in revoked"
          :key="client.id"
          class="flex items-center gap-3 py-2"
          :data-testid="`ai-external-mcp-revoked-client-${client.id}`"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-[12px] font-medium">{{ client.name }}</p>
            <p class="truncate text-[11px] text-muted-foreground">
              {{ scopeLabel(client) }} · {{ t('setting.ai.localMcp.createdAt') }}
              {{ formatDate(client.createdAt) }} · {{ t('setting.ai.localMcp.revokedAt') }}
              {{ formatDate(client.revokedAt ?? 0) }} ·
              <code>{{ client.tokenPrefix }}…</code>
            </p>
          </div>
          <span class="text-[11px] text-muted-foreground">{{
            t('setting.ai.localMcp.revoked')
          }}</span>
        </li>
      </ul>
    </div>

    <div class="space-y-2 border-t border-[hsl(var(--border-subtle))] pt-3">
      <div class="flex items-center justify-between gap-2">
        <h4 class="text-[12px] font-semibold">
          {{ t('setting.ai.localMcp.auditTitle') }}
        </h4>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 gap-1 px-2 text-[11px]"
          :disabled="loading"
          data-testid="ai-external-mcp-audit-refresh"
          @click="refresh"
          ><RefreshCw class="size-3.5" />{{ t('setting.ai.localMcp.refresh') }}</Button
        >
      </div>
      <p
        v-if="loaded && !audit.length"
        class="text-[11px] text-muted-foreground"
        data-testid="ai-external-mcp-audit-empty"
      >
        {{ t('setting.ai.localMcp.auditEmpty') }}
      </p>
      <ul v-else-if="audit.length" class="space-y-1" data-testid="ai-external-mcp-audit">
        <li
          v-for="entry in audit"
          :key="entry.id"
          class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground"
        >
          <code class="text-foreground">{{ entry.tool }}</code>
          <span>{{ auditOrigin(entry) }}</span>
          <span :data-testid="`ai-external-mcp-audit-effect-${entry.id}`"
            >· {{ auditEffect(entry) }}</span
          >
          <span>· {{ auditDecision(entry) }}</span>
          <span>· {{ entry.outcome }}</span>
          <span>· {{ entry.durationMs }}ms</span>
          <span class="ml-auto">{{ formatDate(entry.at) }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
