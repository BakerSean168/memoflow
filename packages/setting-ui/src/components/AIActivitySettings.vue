<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RefreshCw } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Badge, Button } from '@memoflow/ui-vue-shadcn';
import type {
  LocalGatewayAuditRecord,
  LocalMcpClient,
  PermissionAuditRecord,
  PermissionEffect,
} from '@memoflow/ai-contracts';
import { useSettingIdentityScope } from '../composables/useSettingIdentityScope';
import { settingUiHost } from '../setting-ui-host';

export type AIActivityTab = 'mcp' | 'permissions';

const { SettingsObjectCard, SettingsSection, SettingsStatusBlock } = settingUiHost.components;
const { t } = useI18n();
const local = inject(settingUiHost.AI_LOCAL_AGENT_KEY, undefined);
const identityScope = useSettingIdentityScope();

const tab = defineModel<AIActivityTab>('tab', { default: 'mcp' });

const mcpAudit = ref<LocalGatewayAuditRecord[]>([]);
const mcpClients = ref<LocalMcpClient[]>([]);
const mcpLoading = ref(false);
const mcpLoaded = ref(false);
const mcpError = ref('');

const permissionAudit = ref<PermissionAuditRecord[]>([]);
const permissionsLoading = ref(false);
const permissionsLoaded = ref(false);
const permissionsError = ref('');

let mcpGeneration = 0;
let permissionsGeneration = 0;
let disposed = false;

const clientNamesById = computed(
  () => new Map(mcpClients.value.map((client) => [client.id, client.name])),
);

function formatDate(value: number) {
  return new Date(value).toLocaleString();
}

function mcpOrigin(entry: LocalGatewayAuditRecord) {
  if (entry.origin === 'run') return t('setting.ai.localMcp.auditOriginRun');
  return clientNamesById.value.get(entry.connectionId) ?? t('setting.ai.localMcp.auditOriginClient');
}

function mcpEffect(entry: LocalGatewayAuditRecord) {
  return t(
    entry.effect === 'write'
      ? 'setting.ai.localMcp.auditEffectWrite'
      : 'setting.ai.localMcp.auditEffectRead',
  );
}

function mcpScopeDecision(entry: LocalGatewayAuditRecord) {
  return t(
    entry.scopeDecision === 'allowed'
      ? 'setting.ai.localMcp.auditAllowed'
      : 'setting.ai.localMcp.auditDenied',
  );
}

function effectLabel(effect: PermissionEffect) {
  return t(`setting.permissions.effects.${effect}`);
}

function permissionOperationLabel(record: PermissionAuditRecord) {
  if (record.object && record.action) {
    return `${t(`setting.permissions.objects.${record.object}`)} · ${t(`setting.permissions.actions.${record.action}`)}`;
  }
  return t('setting.ai.activity.operationFallback', { id: record.operationId });
}

async function refreshMcpAudit() {
  if (!local) return;
  const current = ++mcpGeneration;
  const expectedScope = identityScope.value;
  mcpLoading.value = true;
  mcpError.value = '';
  try {
    const [auditResult, clientsResult] = await Promise.allSettled([
      typeof local.listGatewayAudit === 'function' ? local.listGatewayAudit(20) : Promise.resolve([]),
      typeof local.listMcpClients === 'function' ? local.listMcpClients() : Promise.resolve([]),
    ]);
    if (disposed || current !== mcpGeneration || identityScope.value !== expectedScope) return;
    if (clientsResult.status === 'fulfilled') mcpClients.value = clientsResult.value;
    if (auditResult.status === 'fulfilled') {
      mcpAudit.value = auditResult.value;
      mcpLoaded.value = true;
    } else {
      mcpError.value = t('setting.ai.activity.mcpLoadError');
      mcpLoaded.value = true;
    }
  } finally {
    if (!disposed && current === mcpGeneration && identityScope.value === expectedScope) {
      mcpLoading.value = false;
    }
  }
}

async function refreshPermissionAudit() {
  if (!local || typeof local.permissions !== 'function') return;
  const current = ++permissionsGeneration;
  const expectedScope = identityScope.value;
  permissionsLoading.value = true;
  permissionsError.value = '';
  try {
    const snapshot = await local.permissions({ action: 'snapshot' });
    if (disposed || current !== permissionsGeneration || identityScope.value !== expectedScope) {
      return;
    }
    permissionAudit.value = snapshot.audit;
    permissionsLoaded.value = true;
  } catch {
    if (disposed || current !== permissionsGeneration || identityScope.value !== expectedScope) {
      return;
    }
    permissionsError.value = t('setting.ai.activity.permissionsLoadError');
    permissionsLoaded.value = true;
  } finally {
    if (!disposed && current === permissionsGeneration && identityScope.value === expectedScope) {
      permissionsLoading.value = false;
    }
  }
}

function loadActiveTabIfNeeded() {
  if (!local) return;
  if (tab.value === 'mcp' && !mcpLoaded.value && !mcpLoading.value) {
    void refreshMcpAudit();
  } else if (tab.value === 'permissions' && !permissionsLoaded.value && !permissionsLoading.value) {
    void refreshPermissionAudit();
  }
}

watch(tab, () => {
  loadActiveTabIfNeeded();
});

watch(identityScope, () => {
  mcpGeneration += 1;
  permissionsGeneration += 1;
  mcpAudit.value = [];
  mcpClients.value = [];
  mcpLoaded.value = false;
  mcpLoading.value = false;
  mcpError.value = '';
  permissionAudit.value = [];
  permissionsLoaded.value = false;
  permissionsLoading.value = false;
  permissionsError.value = '';
  loadActiveTabIfNeeded();
});

onMounted(() => {
  loadActiveTabIfNeeded();
});

onBeforeUnmount(() => {
  disposed = true;
  mcpGeneration += 1;
  permissionsGeneration += 1;
});
</script>

<template>
  <SettingsSection
    :title="t('setting.ai.activity.title')"
    :description="t('setting.ai.activity.description')"
    test-id="ai-activity-settings"
  >
    <SettingsStatusBlock
      v-if="!local"
      kind="info"
      :description="t('setting.ai.activity.unavailable')"
      test-id="ai-activity-unavailable"
    />

    <div v-else class="space-y-5">
      <div
        role="tablist"
        :aria-label="t('setting.ai.activity.title')"
        class="inline-flex flex-wrap gap-1 rounded-lg border border-border/70 bg-muted/25 p-1"
      >
        <Button
          type="button"
          role="tab"
          size="sm"
          :variant="tab === 'mcp' ? 'secondary' : 'ghost'"
          class="h-8 px-3 text-xs"
          :aria-selected="tab === 'mcp'"
          data-testid="ai-activity-tab-mcp"
          @click="tab = 'mcp'"
        >
          {{ t('setting.ai.activity.tabs.mcp') }}
        </Button>
        <Button
          type="button"
          role="tab"
          size="sm"
          :variant="tab === 'permissions' ? 'secondary' : 'ghost'"
          class="h-8 px-3 text-xs"
          :aria-selected="tab === 'permissions'"
          data-testid="ai-activity-tab-permissions"
          @click="tab = 'permissions'"
        >
          {{ t('setting.ai.activity.tabs.permissions') }}
        </Button>
      </div>

      <div
        v-if="tab === 'mcp'"
        role="tabpanel"
        class="space-y-4"
        data-testid="ai-activity-panel-mcp"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs leading-5 text-muted-foreground">
            {{ t('setting.ai.activity.mcpTabDescription') }}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-8 shrink-0 gap-1.5 text-xs"
            :disabled="mcpLoading"
            data-testid="ai-activity-mcp-refresh"
            @click="refreshMcpAudit"
          >
            <RefreshCw class="size-3.5" :class="{ 'animate-spin': mcpLoading }" />
            {{ t('setting.ai.activity.refresh') }}
          </Button>
        </div>

        <SettingsStatusBlock
          v-if="mcpLoading && !mcpAudit.length"
          kind="loading"
          :title="t('setting.ai.activity.loading')"
          test-id="ai-activity-mcp-loading"
        />

        <SettingsStatusBlock
          v-if="mcpError"
          kind="error"
          :description="mcpError"
          test-id="ai-activity-mcp-error"
        />

        <p
          v-if="mcpLoaded && !mcpError && !mcpAudit.length"
          class="text-xs text-muted-foreground"
          data-testid="ai-activity-mcp-empty"
        >
          {{ t('setting.ai.activity.emptyMcp') }}
        </p>

        <SettingsObjectCard v-else-if="mcpAudit.length">
          <ul class="divide-y divide-border/60" data-testid="ai-external-mcp-audit">
            <li
              v-for="entry in mcpAudit"
              :key="entry.id"
              class="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              :data-testid="`ai-activity-mcp-row-${entry.id}`"
            >
              <div class="min-w-0 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <code class="break-all text-xs font-semibold text-foreground">{{
                    entry.tool
                  }}</code>
                  <Badge variant="outline" class="text-[11px] font-normal">
                    {{ mcpOrigin(entry) }}
                  </Badge>
                  <Badge
                    variant="outline"
                    class="text-[11px] font-normal"
                    :data-testid="`ai-external-mcp-audit-effect-${entry.id}`"
                  >
                    {{ mcpEffect(entry) }}
                  </Badge>
                  <Badge
                    :variant="entry.scopeDecision === 'denied' ? 'destructive' : 'secondary'"
                    class="text-[11px] font-normal"
                  >
                    {{ mcpScopeDecision(entry) }}
                  </Badge>
                </div>
                <p class="break-words text-xs text-muted-foreground">
                  {{ entry.outcome }} · {{ entry.durationMs }}ms
                </p>
              </div>
              <span class="shrink-0 text-xs text-muted-foreground">
                {{ formatDate(entry.at) }}
              </span>
            </li>
          </ul>
        </SettingsObjectCard>
      </div>

      <div
        v-else
        role="tabpanel"
        class="space-y-4"
        data-testid="ai-activity-panel-permissions"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs leading-5 text-muted-foreground">
            {{ t('setting.ai.activity.permissionsTabDescription') }}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-8 shrink-0 gap-1.5 text-xs"
            :disabled="permissionsLoading"
            data-testid="ai-activity-permissions-refresh"
            @click="refreshPermissionAudit"
          >
            <RefreshCw class="size-3.5" :class="{ 'animate-spin': permissionsLoading }" />
            {{ t('setting.ai.activity.refresh') }}
          </Button>
        </div>

        <SettingsStatusBlock
          v-if="permissionsLoading && !permissionAudit.length"
          kind="loading"
          :title="t('setting.ai.activity.loading')"
          test-id="ai-activity-permissions-loading"
        />

        <SettingsStatusBlock
          v-if="permissionsError"
          kind="error"
          :description="permissionsError"
          test-id="ai-activity-permissions-error"
        />

        <p
          v-if="permissionsLoaded && !permissionsError && !permissionAudit.length"
          class="text-xs text-muted-foreground"
          data-testid="ai-activity-permissions-empty"
        >
          {{ t('setting.ai.activity.emptyPermissions') }}
        </p>

        <SettingsObjectCard v-else-if="permissionAudit.length">
          <ol class="divide-y divide-border/60" data-testid="ai-permission-activity-list">
            <li
              v-for="record in permissionAudit"
              :key="record.id"
              class="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              :data-testid="`ai-activity-permission-row-${record.id}`"
            >
              <div class="min-w-0 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-xs font-semibold text-foreground">
                    {{ permissionOperationLabel(record) }}
                  </span>
                  <Badge
                    :variant="record.decision === 'deny' ? 'destructive' : 'secondary'"
                    class="text-[11px] font-normal"
                  >
                    {{ effectLabel(record.decision) }}
                  </Badge>
                  <Badge variant="outline" class="text-[11px] font-normal">
                    {{ t(`setting.permissions.decidedBy.${record.decidedBy}`) }}
                  </Badge>
                  <Badge variant="outline" class="text-[11px] font-normal">
                    {{ t(`setting.permissions.executions.${record.execution}`) }}
                  </Badge>
                  <Badge
                    v-for="risk in record.risks ?? []"
                    :key="risk"
                    variant="outline"
                    class="text-[11px] font-normal"
                  >
                    {{ t(`setting.ai.activity.risks.${risk}`) }}
                  </Badge>
                </div>
                <p class="break-all font-mono text-[11px] text-muted-foreground">
                  {{ record.operationId }}
                </p>
              </div>
              <span class="shrink-0 text-xs text-muted-foreground">
                {{
                  record.occurredAt
                    ? formatDate(record.occurredAt)
                    : t('setting.permissions.unknownTime')
                }}
              </span>
            </li>
          </ol>
        </SettingsObjectCard>
      </div>
    </div>
  </SettingsSection>
</template>
