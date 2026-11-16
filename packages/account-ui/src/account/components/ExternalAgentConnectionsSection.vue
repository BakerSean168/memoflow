<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  OAuthConnection,
  ScopedPatSummary,
  ExternalAgentFailureCode,
} from '@memoflow/agent-gateway';
import {
  Button,
  Checkbox,
  Input,
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from '@memoflow/ui-vue-shadcn';
import { accountUiHost } from '../../account-ui-host';

const injected = inject(accountUiHost.EXTERNAL_AGENT_SERVICE_KEY);
if (!injected) throw new Error('External agent service is required');
const service = injected;
const { t } = useI18n();
const visible = ref(true);
const oauthEnabled = ref(false);
const busy = ref(false);
const error = ref<ExternalAgentFailureCode>();
const connections = ref<OAuthConnection[]>([]);
const pats = ref<ScopedPatSummary[]>([]);
const name = ref('');
const scopeOptions = [
  'goals:read',
  'goals:write',
  'tasks:read',
  'tasks:write',
  'routines:write',
  'ai:read',
] as const;
type PatScope = (typeof scopeOptions)[number];
const selectedScopes = ref<Record<PatScope, boolean>>({
  'goals:read': true,
  'goals:write': false,
  'tasks:read': true,
  'tasks:write': false,
  'routines:write': false,
  'ai:read': false,
});
const expiryOptions = ['7', '30', '90', '365'] as const;
const expiresInDays = ref<(typeof expiryOptions)[number]>('90');
const chosenScopes = computed(() => scopeOptions.filter((scope) => selectedScopes.value[scope]));
const carriesWriteScope = computed(() =>
  chosenScopes.value.some((scope) => scope.endsWith(':write')),
);
const secret = ref('');
const scopeName = (scope: string) =>
  ({
    'goals:read': t('account.externalAgents.scopes.goalsRead'),
    'goals:write': t('account.externalAgents.scopes.goalsWrite'),
    'tasks:read': t('account.externalAgents.scopes.tasksRead'),
    'tasks:write': t('account.externalAgents.scopes.tasksWrite'),
    'routines:write': t('account.externalAgents.scopes.routinesWrite'),
    'ai:read': t('account.externalAgents.scopes.aiRead'),
    offline_access: t('account.externalAgents.scopes.offlineAccess'),
  })[scope] ?? scope;
const status = (row: OAuthConnection | ScopedPatSummary) =>
  row.revokedAt ? '已撤销' : Date.parse(row.expiresAt) <= Date.now() ? '已过期' : '已连接';

async function load() {
  busy.value = true;
  error.value = undefined;
  try {
    const capabilities = await service.capabilities();
    if (!capabilities.ok) {
      if (capabilities.error.code === 'EAG_SERVICE_DISABLED') visible.value = false;
      else error.value = capabilities.error.code;
      return;
    }
    oauthEnabled.value = capabilities.data.oauth;
    const patList = await service.listPats();
    if (patList.ok) pats.value = patList.data;
    else error.value = patList.error.code;
    if (oauthEnabled.value) {
      const oauthList = await service.listConnections();
      if (oauthList.ok) connections.value = oauthList.data;
      else error.value = oauthList.error.code;
    }
  } finally {
    busy.value = false;
  }
}
async function createPat() {
  if (!name.value.trim() || chosenScopes.value.length === 0) return;
  busy.value = true;
  error.value = undefined;
  secret.value = '';
  try {
    const result = await service.createPat({
      name: name.value,
      expiresInDays: Number(expiresInDays.value),
      scopes: [...chosenScopes.value],
    });
    if (!result.ok) {
      error.value = result.error.code;
      return;
    }
    secret.value = result.data.secret;
    name.value = '';
    await load();
  } finally {
    busy.value = false;
  }
}
async function revoke(id: string, type: 'oauth' | 'pat') {
  busy.value = true;
  error.value = undefined;
  secret.value = '';
  try {
    const result = await (type === 'oauth' ? service.revokeConnection(id) : service.revokePat(id));
    if (!result.ok) {
      error.value = result.error.code;
      return;
    }
    await load();
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>

<template>
  <section
    v-if="visible"
    class="space-y-5"
    aria-labelledby="external-agents-heading"
    :aria-busy="busy"
  >
    <header>
      <h2 id="external-agents-heading" class="text-lg font-semibold">已连接的应用 / 外部 Agent</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        管理可访问你的 Goals、Tasks 和 Routines 的应用。撤销后，新的访问请求立即失效。
      </p>
    </header>
    <p v-if="error" role="alert" class="text-sm text-destructive">
      {{ t(`errors.${error}`) }}
      <Button variant="ghost" :disabled="busy" @click="load">重试</Button>
    </p>
    <div v-if="oauthEnabled" class="space-y-3">
      <h3 class="font-medium">OAuth 应用</h3>
      <p v-if="!connections.length && !busy" class="text-sm text-muted-foreground">
        还没有已连接的应用。在 Codex 或 Claude Code 中添加 MemoFlow 后，登录并授权即可。
      </p>
      <article
        v-for="connection in connections"
        :key="connection.id"
        class="space-y-2 rounded-lg border p-4"
      >
        <div class="flex items-center justify-between gap-3">
          <h4 class="font-medium">{{ connection.name }}</h4>
          <span class="text-xs text-muted-foreground">{{ status(connection) }}</span>
        </div>
        <p class="break-all text-xs text-muted-foreground">{{ connection.clientId }}</p>
        <p class="text-sm">{{ connection.scopes.map(scopeName).join(' · ') }}</p>
        <p class="text-xs text-muted-foreground">
          连接于 {{ accountUiHost.formatProductDateTime(connection.createdAt) }} · 最近使用
          {{ accountUiHost.formatProductDateTime(connection.lastUsedAt) }}
        </p>
        <p class="text-xs text-muted-foreground">
          到期：{{ accountUiHost.formatProductDateTime(connection.expiresAt) }}
        </p>
        <Button
          v-if="status(connection) === '已连接'"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="revoke(connection.id, 'oauth')"
          >撤销 {{ connection.name }}</Button
        >
      </article>
    </div>
    <div class="space-y-3">
      <h3 class="font-medium">Personal Access Tokens</h3>
      <p class="text-sm text-muted-foreground">
        用于自己的脚本和自托管 Agent。Token 有效期可选 7/30/90/365 天，默认 90
        天；完整密钥只显示一次。
      </p>
      <article v-for="pat in pats" :key="pat.id" class="rounded-lg border p-4 text-sm">
        <div class="flex items-center justify-between gap-3">
          <strong>{{ pat.name }}</strong
          ><span class="text-xs text-muted-foreground">{{ status(pat) }}</span>
        </div>
        <p class="mt-2 font-mono">{{ pat.prefix }}…</p>
        <p class="mt-1">{{ pat.scopes.map(scopeName).join(' · ') }}</p>
        <p class="mt-1 text-xs text-muted-foreground">
          到期：{{ accountUiHost.formatProductDateTime(pat.expiresAt) }}
        </p>
        <Button
          v-if="status(pat) === '已连接'"
          class="mt-2"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="revoke(pat.id, 'pat')"
          >撤销 {{ pat.name }}</Button
        >
      </article>
      <form class="space-y-3 rounded-lg border p-4" @submit.prevent="createPat">
        <label for="external-pat-name" class="block text-sm font-medium">新 Token 名称</label>
        <Input
          id="external-pat-name"
          v-model="name"
          maxlength="80"
          required
          placeholder="例如：我的脚本"
          :disabled="busy"
        />
        <fieldset :disabled="busy">
          <legend class="mb-2 text-sm font-medium">权限范围</legend>
          <div class="grid gap-2 text-sm sm:grid-cols-2">
            <label
              v-for="scope in scopeOptions"
              :key="scope"
              class="flex items-center gap-2"
              :data-testid="`pat-scope-${scope}`"
            >
              <Checkbox v-model="selectedScopes[scope]" :aria-label="scopeName(scope)" />
              {{ scopeName(scope) }}
            </label>
          </div>
        </fieldset>
        <fieldset :disabled="busy">
          <legend class="mb-2 text-sm font-medium">有效期</legend>
          <RadioGroup v-model="expiresInDays" class="flex flex-wrap gap-4 text-sm">
            <label
              v-for="days in expiryOptions"
              :key="days"
              class="flex items-center gap-2"
              :data-testid="`pat-expiry-${days}`"
            >
              <RadioGroupItem :value="days" :aria-label="`${days} 天`" />
              {{ days }} 天{{ days === '90' ? '（默认）' : '' }}
            </label>
          </RadioGroup>
        </fieldset>
        <p
          v-if="carriesWriteScope"
          role="status"
          data-testid="pat-write-warning"
          class="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"
        >
          {{ t('account.externalAgents.writeWarning') }}
        </p>
        <Button type="submit" :disabled="busy || !name.trim() || chosenScopes.length === 0"
          >创建 Token</Button
        >
      </form>
      <div v-if="secret" class="space-y-2 rounded-lg border p-4" role="status">
        <label for="external-pat-secret" class="block text-sm font-medium"
          >请立即复制，关闭后无法再次查看</label
        >
        <Textarea
          id="external-pat-secret"
          :model-value="secret"
          readonly
          rows="2"
          class="w-full rounded border bg-muted p-2 font-mono text-sm"
        />
        <Button variant="outline" @click="secret = ''">已保存，隐藏密钥</Button>
      </div>
    </div>
  </section>
</template>
