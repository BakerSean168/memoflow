<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { Copy, Plus, ShieldOff } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Input, Label } from '@memoflow/ui-vue-shadcn';
import type {
  LocalAgentWriteScope,
  LocalMcpClient,
  LocalMcpClientCredential,
  LocalMcpEndpoint,
} from '@memoflow/ai-contracts';
import { settingUiHost } from '../setting-ui-host';

const { t } = useI18n();
const local = inject(settingUiHost.AI_LOCAL_AGENT_KEY, undefined);
const clients = ref<LocalMcpClient[]>([]);
const endpoint = ref<LocalMcpEndpoint | null>(null);
const credential = ref<LocalMcpClientCredential | null>(null);
const name = ref('');
const writeScopes = ref<LocalAgentWriteScope[]>([]);
const busy = ref(false);
const loading = ref(false);
const error = ref('');
const copied = ref(false);

const scopes = [
  { value: 'tasks:write' as const, label: t('setting.ai.localMcp.scopeTasks') },
  { value: 'goals:write' as const, label: t('setting.ai.localMcp.scopeGoals') },
];
const active = computed(() => clients.value.filter((client) => client.revokedAt === null));
const canCreate = computed(() => Boolean(local) && name.value.trim().length > 0 && !busy.value);
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

async function refresh() {
  if (!local) return;
  loading.value = true;
  error.value = '';
  try {
    if (local.getMcpEndpoint) endpoint.value = await local.getMcpEndpoint();
    if (local.listMcpClients) clients.value = await local.listMcpClients();
  } catch {
    error.value = t('setting.ai.localMcp.error');
  } finally {
    loading.value = false;
  }
}

async function create() {
  if (!local?.createMcpClient || !canCreate.value) return;
  busy.value = true;
  error.value = '';
  try {
    credential.value = await local.createMcpClient({
      name: name.value.trim(),
      writeScopes: writeScopes.value,
    });
    name.value = '';
    writeScopes.value = [];
    copied.value = false;
    await refresh();
  } catch {
    error.value = t('setting.ai.localMcp.error');
  } finally {
    busy.value = false;
  }
}

async function revoke(client: LocalMcpClient) {
  if (!local?.revokeMcpClient || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await local.revokeMcpClient(client.id);
    if (credential.value?.client.id === client.id) credential.value = null;
    await refresh();
  } catch {
    error.value = t('setting.ai.localMcp.error');
  } finally {
    busy.value = false;
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

function scopeLabel(client: LocalMcpClient) {
  if (!client.writeScopes.length) return t('setting.ai.localMcp.readOnly');
  return client.writeScopes
    .map((value) =>
      t(
        value === 'tasks:write'
          ? 'setting.ai.localMcp.scopeTasks'
          : 'setting.ai.localMcp.scopeGoals',
      ),
    )
    .join(' · ');
}

function formatDate(value: number) {
  return new Date(value).toLocaleString();
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <section
    v-if="local"
    data-testid="ai-external-mcp-clients"
    class="space-y-3 rounded-xl border border-[hsl(var(--border-subtle))] p-3 sm:p-4"
  >
    <header class="space-y-1">
      <h3 class="text-[13px] font-semibold">{{ t('setting.ai.localMcp.title') }}</h3>
      <p class="text-[11px] leading-4 text-muted-foreground">
        {{ t('setting.ai.localMcp.description') }}
      </p>
    </header>

    <div class="space-y-1 text-[11px] text-muted-foreground">
      <p v-if="endpoint" class="break-all">
        <span class="font-medium text-foreground">{{ t('setting.ai.localMcp.endpoint') }}:</span>
        <code data-testid="ai-external-mcp-endpoint">{{ endpoint.url }}</code>
      </p>
      <p v-else>{{ t('setting.ai.localMcp.noEndpoint') }}</p>
      <p v-if="endpoint?.discoveryPath" class="break-all">
        <span class="font-medium text-foreground">{{ t('setting.ai.localMcp.discovery') }}:</span>
        <code>{{ endpoint.discoveryPath }}</code>
      </p>
    </div>

    <form class="flex flex-wrap items-end gap-2" @submit.prevent="create">
      <div class="min-w-48 flex-1 space-y-1">
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
      <div class="flex items-center gap-3 pb-2">
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
      <Button
        type="submit"
        size="sm"
        class="h-8 gap-1.5"
        :disabled="!canCreate"
        data-testid="ai-external-mcp-create"
        ><Plus class="size-3.5" />{{ t('setting.ai.localMcp.create') }}</Button
      >
    </form>

    <p v-if="error" class="text-[11px] text-destructive" data-testid="ai-external-mcp-error">
      {{ error }}
    </p>

    <div
      v-if="credential"
      class="space-y-2 rounded-lg border border-[hsl(var(--border-subtle))] bg-muted/20 p-3"
      data-testid="ai-external-mcp-credential"
    >
      <p class="text-[11px] font-medium">{{ t('setting.ai.localMcp.tokenOnce') }}</p>
      <div class="flex items-center gap-2">
        <code class="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 text-[11px]">{{
          credential.token
        }}</code>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 gap-1 px-2 text-[11px]"
          data-testid="ai-external-mcp-copy-token"
          @click="copy(credential.token)"
          ><Copy class="size-3.5" />{{
            copied ? t('setting.ai.localMcp.copied') : t('setting.ai.localMcp.copy')
          }}</Button
        >
      </div>
      <p class="text-[11px] text-muted-foreground">{{ t('setting.ai.localMcp.tokenWarning') }}</p>
      <div class="space-y-1">
        <p class="text-[11px] font-medium">{{ t('setting.ai.localMcp.config') }}</p>
        <pre
          class="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted px-2 py-1 text-[11px]"
          data-testid="ai-external-mcp-snippet"
          >{{ snippet }}</pre>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 gap-1 px-2 text-[11px]"
          data-testid="ai-external-mcp-copy-snippet"
          @click="copy(snippet)"
          ><Copy class="size-3.5" />{{
            copied ? t('setting.ai.localMcp.copied') : t('setting.ai.localMcp.copy')
          }}</Button
        >
      </div>
    </div>

    <p v-if="!active.length && !loading" class="text-[11px] text-muted-foreground">
      {{ t('setting.ai.localMcp.empty') }}
    </p>
    <ul v-else class="divide-y divide-[hsl(var(--border-subtle))]">
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
            {{ formatDate(client.createdAt) }} · <code>{{ client.tokenPrefix }}…</code>
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
  </section>
</template>
