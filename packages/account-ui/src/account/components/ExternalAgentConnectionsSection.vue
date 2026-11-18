<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  OAuthConnection,
  ScopedPatSummary,
  ExternalAgentFailureCode,
} from '@memoflow/agent-gateway';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from '@memoflow/ui-vue-shadcn';
import { Copy, LoaderCircle } from '@lucide/vue';
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
  'routines:read',
  'routines:write',
  'ai:read',
  'notifications:read',
  'schedules:read',
  'notifications:write',
  'labels:read',
  'relations:read',
] as const;
type PatScope = (typeof scopeOptions)[number];
const selectedScopes = ref<Record<PatScope, boolean>>({
  'goals:read': true,
  'goals:write': false,
  'tasks:read': true,
  'tasks:write': false,
  'routines:read': false,
  'routines:write': false,
  'ai:read': false,
  'notifications:read': false,
  'schedules:read': false,
  'notifications:write': false,
  'labels:read': false,
  'relations:read': false,
});
const expiryOptions = ['7', '30', '90', '365'] as const;
const expiresInDays = ref<(typeof expiryOptions)[number]>('90');
const chosenScopes = computed(() => scopeOptions.filter((scope) => selectedScopes.value[scope]));
const carriesWriteScope = computed(() =>
  chosenScopes.value.some((scope) => scope.endsWith(':write')),
);
const secret = ref('');
const replayed = ref(false);
const copied = ref(false);
const creating = ref(false);
const createOpen = ref(false);
const revokeTarget = ref<{ id: string; type: 'oauth' | 'pat'; name: string } | null>(null);
const revoking = ref(false);

/**
 * One key per submission intent. It stays stable across a failed/ambiguous
 * retry so the server can replay the original credential, and rotates when the
 * form starts a new intent (reopened form or edited input after a failure).
 */
const newIdempotencyKey = () => crypto.randomUUID();
const idempotencyKey = ref(newIdempotencyKey());
watch([name, expiresInDays, () => chosenScopes.value.join(',')], () => {
  if (!creating.value) idempotencyKey.value = newIdempotencyKey();
});
const scopeName = (scope: string) =>
  ({
    'goals:read': t('account.externalAgents.scopes.goalsRead'),
    'goals:write': t('account.externalAgents.scopes.goalsWrite'),
    'tasks:read': t('account.externalAgents.scopes.tasksRead'),
    'tasks:write': t('account.externalAgents.scopes.tasksWrite'),
    'routines:read': t('account.externalAgents.scopes.routinesRead'),
    'routines:write': t('account.externalAgents.scopes.routinesWrite'),
    'ai:read': t('account.externalAgents.scopes.aiRead'),
    'notifications:read': t('account.externalAgents.scopes.notificationsRead'),
    'schedules:read': t('account.externalAgents.scopes.schedulesRead'),
    'notifications:write': t('account.externalAgents.scopes.notificationsWrite'),
    'labels:read': t('account.externalAgents.scopes.labelsRead'),
    'relations:read': t('account.externalAgents.scopes.relationsRead'),
    offline_access: t('account.externalAgents.scopes.offlineAccess'),
  })[scope] ?? scope;
const status = (row: OAuthConnection) =>
  row.revokedAt
    ? t('account.externalAgents.statusRevoked')
    : Date.parse(row.expiresAt) <= Date.now()
      ? t('account.externalAgents.statusExpired')
      : t('account.externalAgents.statusActive');
/** Revoked and expired tokens stay server-side for audit but leave the list (#1010). */
const isLive = (row: { revokedAt: string | null; expiresAt: string }) =>
  !row.revokedAt && Date.parse(row.expiresAt) > Date.now();
const livePats = computed(() => pats.value.filter(isLive));

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
function openCreate() {
  createOpen.value = true;
  error.value = undefined;
  secret.value = '';
  replayed.value = false;
  copied.value = false;
}
function closeCreate() {
  if (creating.value) return;
  createOpen.value = false;
  secret.value = '';
  replayed.value = false;
  copied.value = false;
}
function handleCreateOpenChange(open: boolean) {
  if (!open) closeCreate();
}
async function copySecret() {
  try {
    await navigator.clipboard.writeText(secret.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}
async function createPat() {
  if (creating.value || !name.value.trim() || chosenScopes.value.length === 0) return;
  creating.value = true;
  busy.value = true;
  error.value = undefined;
  secret.value = '';
  replayed.value = false;
  copied.value = false;
  try {
    const result = await service.createPat({
      name: name.value,
      expiresInDays: Number(expiresInDays.value),
      scopes: [...chosenScopes.value],
      idempotencyKey: idempotencyKey.value,
    });
    if (!result.ok) {
      error.value = result.error.code;
      return;
    }
    if (result.data.secret) secret.value = result.data.secret;
    else replayed.value = true;
    name.value = '';
    idempotencyKey.value = newIdempotencyKey();
    await load();
  } finally {
    creating.value = false;
    busy.value = false;
  }
}
function askRevoke(id: string, type: 'oauth' | 'pat', name: string) {
  error.value = undefined;
  revokeTarget.value = { id, type, name };
}
function cancelRevoke() {
  if (revoking.value) return;
  revokeTarget.value = null;
}
async function confirmRevoke() {
  const target = revokeTarget.value;
  if (!target || revoking.value) return;
  revoking.value = true;
  error.value = undefined;
  try {
    const result = await (target.type === 'oauth'
      ? service.revokeConnection(target.id)
      : service.revokePat(target.id));
    if (!result.ok) {
      error.value = result.error.code;
      return;
    }
    revokeTarget.value = null;
    await load();
  } finally {
    revoking.value = false;
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
      <h2 id="external-agents-heading" class="text-lg font-semibold">
        {{ t('account.externalAgents.sectionTitle') }}
      </h2>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ t('account.externalAgents.sectionDescription') }}
      </p>
    </header>
    <p v-if="error && !createOpen" role="alert" class="text-sm text-destructive">
      {{ t(`errors.${error}`) }}
      <Button variant="ghost" :disabled="busy" @click="load">
        {{ t('account.externalAgents.retry') }}
      </Button>
    </p>
    <div v-if="oauthEnabled" class="space-y-3">
      <h3 class="font-medium">{{ t('account.externalAgents.oauthTitle') }}</h3>
      <p v-if="!connections.length && !busy" class="text-sm text-muted-foreground">
        {{ t('account.externalAgents.oauthEmpty') }}
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
          {{
            t('account.externalAgents.connectedOn', {
              date: accountUiHost.formatProductDateTime(connection.createdAt),
            })
          }}
          ·
          {{
            t('account.externalAgents.lastUsedOn', {
              date: accountUiHost.formatProductDateTime(connection.lastUsedAt),
            })
          }}
        </p>
        <p class="text-xs text-muted-foreground">
          {{
            t('account.externalAgents.expiresOn', {
              date: accountUiHost.formatProductDateTime(connection.expiresAt),
            })
          }}
        </p>
        <Button
          v-if="isLive(connection)"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="askRevoke(connection.id, 'oauth', connection.name)"
          >{{ t('account.externalAgents.revokeNamed', { name: connection.name }) }}</Button
        >
      </article>
    </div>
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h3 class="font-medium">{{ t('account.externalAgents.patTitle') }}</h3>
        <Button size="sm" :disabled="busy" data-testid="pat-create-open" @click="openCreate">
          {{ t('account.externalAgents.create') }}
        </Button>
      </div>
      <p v-if="!livePats.length && !busy" class="text-sm text-muted-foreground">
        {{ t('account.externalAgents.patEmpty') }}
      </p>
      <article v-for="pat in livePats" :key="pat.id" class="rounded-lg border p-4 text-sm">
        <div class="flex items-center justify-between gap-3">
          <strong>{{ pat.name }}</strong>
        </div>
        <p class="mt-2 font-mono">{{ pat.prefix }}…</p>
        <p class="mt-1">{{ pat.scopes.map(scopeName).join(' · ') }}</p>
        <p class="mt-1 text-xs text-muted-foreground">
          {{
            t('account.externalAgents.expiresOn', {
              date: accountUiHost.formatProductDateTime(pat.expiresAt),
            })
          }}
        </p>
        <Button
          class="mt-2"
          variant="outline"
          size="sm"
          :disabled="busy"
          data-testid="pat-revoke-open"
          @click="askRevoke(pat.id, 'pat', pat.name)"
          >{{ t('account.externalAgents.revokeNamed', { name: pat.name }) }}</Button
        >
      </article>
    </div>
    <Dialog :open="createOpen" @update:open="handleCreateOpenChange">
      <DialogContent data-testid="pat-create-dialog" class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ t('account.externalAgents.createDialogTitle') }}</DialogTitle>
          <DialogDescription>
            {{ t('account.externalAgents.createDialogDescription') }}
          </DialogDescription>
        </DialogHeader>
        <p v-if="error" role="alert" class="text-sm text-destructive">
          {{ t(`errors.${error}`) }}
        </p>
        <template v-if="secret">
          <div class="space-y-2" role="status" data-testid="pat-create-secret">
            <p class="text-sm font-medium">
              {{ t('account.externalAgents.secretTitle') }}
            </p>
            <div class="flex items-start gap-2">
              <Textarea
                id="external-pat-secret"
                :model-value="secret"
                readonly
                rows="2"
                class="flex-1 font-mono"
                :aria-label="t('account.externalAgents.secretTitle')"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="pat-copy-secret"
                @click="copySecret"
              >
                <Copy class="size-4" aria-hidden="true" />
                {{ copied ? t('account.externalAgents.copied') : t('account.externalAgents.copy') }}
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ t('account.externalAgents.secretNotice') }}
            </p>
          </div>
          <DialogFooter>
            <Button data-testid="pat-create-done" @click="closeCreate">
              {{ t('account.externalAgents.done') }}
            </Button>
          </DialogFooter>
        </template>
        <template v-else-if="replayed">
          <p
            role="status"
            data-testid="pat-create-replayed"
            class="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"
          >
            {{ t('account.externalAgents.createReplayed') }}
          </p>
          <DialogFooter>
            <Button data-testid="pat-create-done" @click="closeCreate">
              {{ t('account.externalAgents.done') }}
            </Button>
          </DialogFooter>
        </template>
        <form v-else class="space-y-4" @submit.prevent="createPat">
          <div class="space-y-1.5">
            <Label for="external-pat-name">{{ t('account.externalAgents.nameLabel') }}</Label>
            <Input
              id="external-pat-name"
              v-model="name"
              maxlength="80"
              required
              :placeholder="t('account.externalAgents.namePlaceholder')"
              :disabled="busy"
            />
          </div>
          <fieldset :disabled="busy">
            <legend class="mb-2 text-sm font-medium">
              {{ t('account.externalAgents.scopesLegend') }}
            </legend>
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
            <legend class="mb-2 text-sm font-medium">
              {{ t('account.externalAgents.expiryLegend') }}
            </legend>
            <RadioGroup v-model="expiresInDays" class="flex flex-wrap gap-4 text-sm">
              <label
                v-for="days in expiryOptions"
                :key="days"
                class="flex items-center gap-2"
                :data-testid="`pat-expiry-${days}`"
              >
                <RadioGroupItem :value="days" :aria-label="`${days}`" />
                {{
                  days === '90'
                    ? t('account.externalAgents.expiryDefault', { days })
                    : t('account.externalAgents.expiryDays', { days })
                }}
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
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              :disabled="creating"
              data-testid="pat-create-cancel"
              @click="closeCreate"
            >
              {{ t('account.externalAgents.cancel') }}
            </Button>
            <Button
              type="submit"
              data-testid="pat-create-submit"
              :disabled="busy || creating || !name.trim() || chosenScopes.length === 0"
            >
              <LoaderCircle v-if="creating" class="mr-2 size-4 animate-spin" aria-hidden="true" />
              {{
                creating ? t('account.externalAgents.creating') : t('account.externalAgents.create')
              }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog
      :open="Boolean(revokeTarget)"
      @update:open="
        (open) => {
          if (!open) cancelRevoke();
        }
      "
    >
      <AlertDialogContent data-testid="pat-revoke-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ t('account.externalAgents.revokeTitle', { name: revokeTarget?.name ?? '' }) }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('account.externalAgents.revokeDescription') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p v-if="error" role="alert" class="text-sm text-destructive">
          {{ t(`errors.${error}`) }}
        </p>
        <AlertDialogFooter>
          <Button
            variant="outline"
            :disabled="revoking"
            data-testid="pat-revoke-cancel"
            @click="cancelRevoke"
          >
            {{ t('account.externalAgents.cancel') }}
          </Button>
          <Button
            variant="destructive"
            :disabled="revoking"
            data-testid="pat-revoke-confirm"
            @click="confirmRevoke"
          >
            {{
              revoking
                ? t('account.externalAgents.revoking')
                : t('account.externalAgents.revokeConfirmText')
            }}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
