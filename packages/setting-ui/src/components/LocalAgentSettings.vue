<script setup lang="ts">
import { computed, inject, onBeforeUnmount, reactive, ref, useId, watch } from 'vue';
import { RefreshCw, RotateCcw, Trash2 } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Button, Input } from '@memoflow/ui-vue-shadcn';
import {
  LocalAgentConnectionInputSchema,
  LocalAgentAuthStateSchema,
  LOCAL_AGENT_DEFAULT_EXECUTABLES,
  type LocalAgentAuthFailure,
  type LocalAgentAuthState,
  type LocalAgentConnection,
  type LocalAgentConnectionInput,
  type LocalAgentDriver,
  type LocalAgentStatus,
} from '@memoflow/contracts/ai';
import { SystemChannels } from '@memoflow/contracts/electron';
import { settingUiHost } from '../setting-ui-host';

const { SettingsPropertyRow, AgentDriverIcon } = settingUiHost.components;
import AntigravityAcpDownload from './AntigravityAcpDownload.vue';
const props = defineProps<{
  connection: LocalAgentConnection | null;
  identity?: Pick<LocalAgentConnectionInput, 'name' | 'instanceSlug' | 'accentColor'>;
  driver: LocalAgentDriver;
  enabled?: boolean;
  status?: LocalAgentStatus;
  canProbe?: boolean;
  isDefault?: boolean;
  revision?: number;
  busy: boolean;
  error: boolean;
}>();
const emit = defineEmits<{
  save: [input: LocalAgentConnectionInput];
  check: [];
  remove: [];
  reset: [];
  cancel: [];
  verified: [status: LocalAgentStatus];
}>();
const { t } = useI18n();
const uid = `ai-native-${useId()}`;
const modelVisibility = settingUiHost.useNativeModelVisibility(
  settingUiHost.useServerStateIdentityScope(),
  () => (props.status?.status === 'ready' ? props.status.modelVisibilityContext : undefined),
);
const visibilityInstanceId = computed(
  () =>
    props.identity?.instanceSlug ??
    props.connection?.instanceSlug ??
    props.connection?.id ??
    props.driver,
);
function updateModelVisibility(modelId: string, event: Event) {
  const input = event.target as HTMLInputElement;
  if (!modelVisibility.setVisible(visibilityInstanceId.value, modelId, input.checked))
    input.checked = !input.checked;
}
const names = {
  codex: 'Codex',
  claude: 'Claude Code',
  pi: 'Pi',
  dsh: 'DSH',
  antigravity: 'Antigravity (AGY)',
};
const scopes = ['goals:write', 'tasks:write'] as const;
const form = reactive<LocalAgentConnectionInput>({
  driver: props.driver,
  name: '',
  executablePath: '',
  homePath: '',
  enabled: true,
  writeScopes: [],
});
watch(
  () => [props.connection?.id, props.connection?.revision, props.driver, props.enabled],
  () => {
    const current = props.connection;
    Object.assign(form, {
      driver: props.driver,
      name: current?.name ?? props.identity?.name ?? names[props.driver],
      instanceSlug: current?.instanceSlug ?? props.identity?.instanceSlug,
      accentColor: current?.accentColor ?? props.identity?.accentColor,
      executablePath: current?.executablePath ?? LOCAL_AGENT_DEFAULT_EXECUTABLES[props.driver],
      homePath: current?.homePath ?? '',
      enabled: props.enabled ?? current?.enabled ?? true,
      writeScopes: [...(current?.writeScopes ?? [])],
    });
  },
  { immediate: true },
);
const models = computed(() => (props.status?.status === 'ready' ? props.status.models : []));
const account = computed(() =>
  props.enabled !== false && props.status?.status === 'ready' ? props.status.account : undefined,
);
const showAccount = ref(false);
watch(
  () => [props.connection?.id, props.identity?.instanceSlug, props.driver, props.status],
  () => {
    showAccount.value = false;
  },
);
const accountLabel = computed(() => {
  const current = account.value;
  if (!current) return '';
  if (current.email) {
    if (showAccount.value) return current.email;
    const at = current.email.indexOf('@');
    return `${current.email[0]}***${current.email.slice(at)}`;
  }
  return t(
    current.type === 'chatgpt'
      ? 'setting.ai.chatgptAccount'
      : current.type === 'api_key'
        ? 'setting.ai.apiKeyAccount'
        : 'setting.ai.connectedAccount',
  );
});
const accountPlan = computed(() => {
  const current = account.value;
  if (current?.type !== 'chatgpt' || !current.planType || current.planType === 'free')
    return undefined;
  return `ChatGPT ${current.planType[0].toUpperCase()}${current.planType.slice(1)}`;
});
const statusLabel = computed(() => {
  if (!form.enabled) return t('setting.ai.inactiveProvider');
  if (props.status?.status === 'ready')
    return (
      settingUiHost.getNativeAgentExecutionFailureMessage(props.status.lastExecutionFailure, t) ||
      t('setting.agentInstances.discoveredModels', { count: props.status.models.length })
    );
  if (props.driver === 'antigravity') {
    if (props.status?.status === 'login_required')
      return t('setting.agentInstances.antigravityLoginRequired');
    if (props.status?.status === 'not_installed')
      return t('setting.agentInstances.antigravityExecutableMissing');
    if (props.status?.status === 'unavailable')
      return t('setting.agentInstances.antigravityUnavailable');
    return t('setting.agentInstances.unchecked');
  }
  return props.status?.message ?? t('setting.agentInstances.unchecked');
});
const validated = computed(() =>
  LocalAgentConnectionInputSchema.safeParse({
    ...form,
    homePath: form.homePath?.trim() || undefined,
  }),
);
function save() {
  if (validated.value.success) emit('save', validated.value.data);
}

// Explicit Google sign-in is a dedicated main-process flow. It never runs as a
// side effect of refresh, startup or chat restore.
const local = inject(settingUiHost.AI_LOCAL_AGENT_KEY, undefined);
const bridge = inject(settingUiHost.DESKTOP_BRIDGE_KEY, undefined);
const auth = ref<LocalAgentAuthState | null>(null);
const authFailure = ref<LocalAgentAuthFailure | null>(null);
const authBusy = ref(false);
const callbackOpen = ref(false);
const callbackValue = ref('');
const copied = ref(false);
const openFailed = ref(false);
const isAntigravity = computed(() => props.driver === 'antigravity');
const connectionId = computed(() => props.connection?.id);
const signingIn = computed(
  () => authBusy.value || ['starting', 'waiting', 'verifying'].includes(auth.value?.phase ?? ''),
);
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollGeneration = 0;
let openedUrl: string | undefined;

function stopPolling() {
  pollGeneration++;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
}
function failureMessage(failure: LocalAgentAuthFailure) {
  return t(`setting.agentInstances.antigravityAuthFailure.${failure}`);
}
const loginMessage = computed(() => {
  if (authFailure.value) return failureMessage(authFailure.value);
  if (isAntigravity.value && draftDirty.value)
    return t('setting.agentInstances.antigravityLoginSaveFirst');
  if (isAntigravity.value && props.status?.status === 'not_installed')
    return t('setting.agentInstances.antigravityExecutableMissing');
  const state = auth.value;
  if (state?.phase === 'starting') return t('setting.agentInstances.antigravityLoginStarting');
  if (state?.phase === 'waiting') {
    if (!state.authorizationUrl) return t('setting.agentInstances.antigravityLoginBrowserPending');
    if (openFailed.value) return t('setting.agentInstances.antigravityLoginOpenFailed');
    return t('setting.agentInstances.antigravityLoginWaiting');
  }
  if (state?.phase === 'verifying') return t('setting.agentInstances.antigravityLoginVerifying');
  if (state?.phase === 'succeeded') return t('setting.agentInstances.antigravityLoginSucceeded');
  if (state?.phase === 'cancelled') return t('setting.agentInstances.antigravityLoginCancelled');
  if (!isAntigravity.value) return '';
  if (props.status?.status === 'login_required')
    return t('setting.agentInstances.antigravityLoginRequired');
  if (props.status?.status === 'unavailable')
    return t('setting.agentInstances.antigravityUnavailable');
  return '';
});
const draftDirty = computed(() => {
  if (!connectionId.value) return false;
  const connection = props.connection;
  if (!connection) return false;
  return (
    form.executablePath !== connection.executablePath ||
    (form.homePath?.trim() ?? '') !== (connection.homePath ?? '')
  );
});
const showLoginAction = computed(
  () =>
    isAntigravity.value &&
    Boolean(local) &&
    Boolean(connectionId.value) &&
    form.enabled !== false &&
    !signingIn.value &&
    auth.value?.phase !== 'succeeded' &&
    props.status?.status !== 'not_installed' &&
    (props.status?.status !== 'ready' ||
      auth.value?.phase === 'failed' ||
      auth.value?.phase === 'cancelled'),
);
const showSignedInActions = computed(
  () =>
    isAntigravity.value &&
    Boolean(connectionId.value) &&
    !signingIn.value &&
    (auth.value?.phase === 'succeeded' || props.status?.status === 'ready'),
);
const showLoginLink = computed(
  () => auth.value?.phase === 'waiting' && Boolean(auth.value.authorizationUrl),
);
const authorizationUrl = computed(() => auth.value?.authorizationUrl ?? '');
async function openAuthorization(url: string) {
  if (!bridge) {
    openFailed.value = true;
    return;
  }
  try {
    const result = await bridge.invoke(SystemChannels.OPEN_EXTERNAL_URL, { url });
    openFailed.value = !(
      result &&
      typeof result === 'object' &&
      'ok' in result &&
      (result as { ok?: unknown }).ok === true
    );
  } catch {
    openFailed.value = true;
  }
}
function applyAuth(raw: unknown, options: { keepFailure?: boolean; restore?: boolean } = {}) {
  const parsed = LocalAgentAuthStateSchema.safeParse(raw);
  if (!parsed.success) {
    stopPolling();
    auth.value = null;
    authFailure.value = 'unavailable';
    return;
  }
  const state = parsed.data;
  auth.value = state;
  if (state.failure && !options.keepFailure) authFailure.value = state.failure;
  if (state.authorizationUrl && state.authorizationUrl !== openedUrl) {
    openedUrl = state.authorizationUrl;
    // Returning to settings restores a pending flow without reopening the browser.
    // The user can explicitly reopen the existing link instead.
    if (!options.restore) void openAuthorization(state.authorizationUrl);
  }
  if (['failed', 'cancelled', 'idle', 'succeeded'].includes(state.phase)) {
    stopPolling();
    // Login already performed a full native ACP probe. Reuse its verified
    // model catalogue instead of spawning a second expensive probe.
    if (state.phase === 'succeeded') {
      if (state.status?.status === 'ready') emit('verified', state.status);
      else emit('check');
    } else if (state.phase === 'idle') emit('check');
  }
}
function schedulePoll() {
  stopPolling();
  const generation = pollGeneration;
  const tick = async () => {
    const client = local;
    const id = connectionId.value;
    if (!client || !id || generation !== pollGeneration) return;
    try {
      const state = await client.loginStatus(id);
      if (generation !== pollGeneration) return;
      applyAuth(state, { keepFailure: true });
    } catch {
      if (generation !== pollGeneration) return;
    }
    if (generation === pollGeneration && signingIn.value) pollTimer = setTimeout(tick, 1_000);
  };
  pollTimer = setTimeout(tick, 1_000);
}
async function restoreLogin() {
  const client = local;
  const id = connectionId.value;
  const generation = pollGeneration;
  if (!isAntigravity.value || !client || !id) return;
  try {
    const state = await client.loginStatus(id);
    if (generation !== pollGeneration || id !== connectionId.value) return;
    applyAuth(state, { restore: true });
    if (signingIn.value) schedulePoll();
  } catch {
    // A transient status failure must not start an authorization flow.
  }
}
async function startLogin() {
  const client = local;
  const id = connectionId.value;
  if (!client || !id || authBusy.value) return;
  // Ignore any in-flight restoration when the user explicitly starts a new flow.
  stopPolling();
  authBusy.value = true;
  authFailure.value = null;
  copied.value = false;
  openFailed.value = false;
  callbackOpen.value = false;
  callbackValue.value = '';
  openedUrl = undefined;
  try {
    applyAuth(await client.startLogin(id));
    if (signingIn.value) schedulePoll();
  } catch {
    authFailure.value = 'unavailable';
  } finally {
    authBusy.value = false;
  }
}
async function cancelLogin() {
  const client = local;
  const id = connectionId.value;
  const flowId = auth.value?.flowId;
  if (!client || !id || !flowId) return;
  try {
    applyAuth(await client.cancelLogin(id, flowId));
  } catch {
    authFailure.value = 'unavailable';
  }
}
async function signOut() {
  const client = local;
  const id = connectionId.value;
  if (!client || !id || authBusy.value) return;
  authBusy.value = true;
  authFailure.value = null;
  try {
    applyAuth(await client.signOut(id));
    auth.value = null;
  } catch {
    authFailure.value = 'unavailable';
  } finally {
    authBusy.value = false;
  }
}
async function copyAuthorization() {
  const url = auth.value?.authorizationUrl;
  if (!url || typeof navigator === 'undefined' || !navigator.clipboard) {
    copied.value = false;
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}
function selectAuthorization(event: Event) {
  const input = event.target as HTMLInputElement;
  input.select();
}
async function submitCallback() {
  const client = local;
  const id = connectionId.value;
  const flowId = auth.value?.flowId;
  const value = callbackValue.value.trim();
  if (!client || !id || !flowId || !value) return;
  try {
    const state = await client.completeLogin(id, flowId, value);
    applyAuth(state, { keepFailure: true });
    if (state.failure) authFailure.value = state.failure;
    else callbackValue.value = '';
  } catch {
    authFailure.value = 'unavailable';
  }
}
watch(
  () => [connectionId.value, props.driver],
  () => {
    stopPolling();
    auth.value = null;
    authFailure.value = null;
    copied.value = false;
    openFailed.value = false;
    callbackOpen.value = false;
    callbackValue.value = '';
    openedUrl = undefined;
    void restoreLogin();
  },
  { immediate: true },
);
onBeforeUnmount(stopPolling);
</script>

<template>
  <form
    data-testid="ai-provider-detail"
    class="min-w-0 space-y-6 p-1 sm:p-2"
    @submit.prevent="save"
  >
    <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2">
      <div class="flex min-w-0 flex-1 basis-40 items-center gap-3">
        <AgentDriverIcon
          :driver="driver"
          class="size-5"
          :style="{ color: identity?.accentColor }"
        />
        <div class="min-w-0">
          <h3 class="truncate text-base font-semibold">
            {{ connection?.name ?? identity?.name ?? names[driver] }}
          </h3>
          <div class="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span class="min-w-0 truncate whitespace-nowrap" role="status" :title="statusLabel">{{
              statusLabel
            }}</span>
          </div>
        </div>
      </div>
      <div class="ml-auto flex shrink-0 items-center gap-1.5">
        <span
          v-if="status?.status === 'ready' && status.version"
          class="max-w-24 shrink-0 truncate font-mono text-xs text-muted-foreground"
          data-testid="ai-provider-runtime-version"
          >v{{ status.version.replace(/^v/, '') }}</span
        >
        <Button
          v-if="revision ? revision > 0 : Boolean(connection)"
          type="button"
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 rounded-md text-muted-foreground"
          :class="
            isDefault
              ? 'hover:bg-muted/70 hover:text-foreground'
              : 'hover:bg-destructive/10 hover:text-destructive'
          "
          :disabled="busy"
          :aria-label="
            isDefault ? t('setting.agentInstances.resetDefault') : t('setting.ai.deleteProvider')
          "
          :title="
            isDefault
              ? t('setting.agentInstances.resetDefaultHint')
              : t('setting.ai.deleteProvider')
          "
          :data-testid="isDefault ? 'ai-agent-reset' : 'ai-agent-delete'"
          @click="isDefault ? emit('reset') : emit('remove')"
        >
          <RotateCcw v-if="isDefault" class="size-3.5" /><Trash2 v-else class="size-3.5" />
        </Button>
      </div>
    </header>
    <div class="rounded-xl border border-[hsl(var(--border-subtle))] bg-muted/10 px-4 py-4">
      <SettingsPropertyRow
        :label="t('setting.ai.displayName')"
        :description="t('setting.agentInstances.nameHint')"
        :html-for="`${uid}-name`"
        ><Input
          :id="`${uid}-name`"
          v-model="form.name"
          data-testid="ai-native-name"
          required
          :maxlength="120"
          :disabled="busy"
          class="h-8 rounded-lg text-sm"
      /></SettingsPropertyRow>
      <SettingsPropertyRow
        :label="t('setting.agentInstances.instanceId')"
        :description="t('setting.agentInstances.idReadonlyHint')"
        :html-for="`${uid}-id`"
        ><Input
          :id="`${uid}-id`"
          :model-value="identity?.instanceSlug ?? connection?.instanceSlug ?? connection?.id ?? ''"
          data-testid="ai-native-id"
          readonly
          class="h-8 rounded-lg text-xs text-muted-foreground"
      /></SettingsPropertyRow>
    </div>
    <div
      v-if="account"
      class="flex flex-wrap items-center gap-2 px-3 text-xs text-muted-foreground"
      data-testid="ai-native-auth-summary"
    >
      <span>{{ t('setting.ai.authenticatedAs') }}</span>
      <span
        class="min-w-0 break-all font-medium text-foreground"
        data-testid="ai-native-auth-identity"
      >
        {{ accountLabel }}
      </span>
      <span v-if="accountPlan" data-testid="ai-native-auth-plan">· {{ accountPlan }}</span>
      <Button
        v-if="account.email"
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 px-1.5 text-xs"
        :aria-label="t(showAccount ? 'setting.ai.hideAccount' : 'setting.ai.revealAccount')"
        :disabled="busy"
        data-testid="ai-native-auth-toggle"
        @click="showAccount = !showAccount"
        >{{ t(showAccount ? 'setting.ai.hideAccount' : 'setting.ai.revealAccount') }}</Button
      >
    </div>
    <section v-if="isAntigravity" class="space-y-3" data-testid="ai-agy-account">
      <h4 class="px-3 text-xs font-medium text-muted-foreground">
        {{ t('setting.agentInstances.antigravityLoginTitle') }}
      </h4>
      <div class="rounded-xl border border-[hsl(var(--border-subtle))] bg-muted/10 px-4 py-4">
        <p
          class="min-w-0 truncate text-xs leading-5 text-muted-foreground"
          role="status"
          :title="loginMessage"
          data-testid="ai-agy-login-status"
        >
          {{ loginMessage }}
        </p>
        <p
          v-if="isAntigravity && !connectionId && !signingIn"
          class="mt-1 min-w-0 truncate text-[11px] leading-4 text-muted-foreground"
          :title="t('setting.agentInstances.antigravityLoginNoConnection')"
          data-testid="ai-agy-login-no-connection"
        >
          {{ t('setting.agentInstances.antigravityLoginNoConnection') }}
        </p>
        <div v-if="local" class="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            v-if="showLoginAction"
            type="button"
            size="sm"
            class="h-8"
            :disabled="busy || authBusy || !connectionId || draftDirty"
            data-testid="ai-agy-login"
            @click="startLogin"
            >{{
              auth?.phase === 'failed' || auth?.phase === 'cancelled'
                ? t('setting.agentInstances.antigravityLoginRetry')
                : t('setting.agentInstances.antigravityLoginAction')
            }}</Button
          >
          <template v-if="showLoginLink">
            <Button
              type="button"
              size="sm"
              variant="outline"
              class="h-8"
              data-testid="ai-agy-login-open"
              @click="openAuthorization(authorizationUrl)"
              >{{ t('setting.agentInstances.antigravityLoginOpen') }}</Button
            >
            <Button
              type="button"
              size="sm"
              variant="ghost"
              class="h-8"
              data-testid="ai-agy-login-copy"
              @click="copyAuthorization"
              >{{
                copied
                  ? t('setting.agentInstances.antigravityLoginCopied')
                  : t('setting.agentInstances.antigravityLoginCopy')
              }}</Button
            >
          </template>
          <Button
            v-if="signingIn"
            type="button"
            size="sm"
            variant="ghost"
            class="h-8"
            data-testid="ai-agy-login-cancel"
            @click="cancelLogin"
            >{{ t('setting.agentInstances.antigravityLoginCancel') }}</Button
          >
          <template v-if="showSignedInActions">
            <Button
              type="button"
              size="sm"
              variant="outline"
              class="h-8"
              :disabled="busy || authBusy"
              data-testid="ai-agy-login-switch"
              @click="startLogin"
              >{{ t('setting.agentInstances.antigravityLoginSwitch') }}</Button
            >
            <Button
              type="button"
              size="sm"
              variant="ghost"
              class="h-8"
              :disabled="busy || authBusy"
              data-testid="ai-agy-sign-out"
              @click="signOut"
              >{{ t('setting.agentInstances.antigravityLoginSignOut') }}</Button
            >
          </template>
        </div>
        <div v-if="showLoginLink" class="mt-2 min-w-0 space-y-2">
          <Input
            :model-value="authorizationUrl"
            readonly
            class="h-8 min-w-0 text-[11px]"
            data-testid="ai-agy-login-link"
            :aria-label="t('setting.agentInstances.antigravityLoginCopy')"
            @focus="selectAuthorization"
          />
          <button
            type="button"
            class="text-[11px] leading-4 text-muted-foreground underline-offset-2 hover:underline"
            data-testid="ai-agy-callback-toggle"
            @click="callbackOpen = !callbackOpen"
          >
            {{ t('setting.agentInstances.antigravityLoginCallbackHint') }}
          </button>
          <form
            v-if="callbackOpen"
            class="flex min-w-0 items-center gap-2"
            @submit.prevent="submitCallback"
          >
            <Input
              v-model="callbackValue"
              class="h-8 min-w-0 flex-1 text-[11px]"
              :placeholder="t('setting.agentInstances.antigravityLoginCallbackPlaceholder')"
              data-testid="ai-agy-callback-input"
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              class="h-8"
              :disabled="!callbackValue.trim()"
              data-testid="ai-agy-callback-submit"
              >{{ t('setting.agentInstances.antigravityLoginCallbackAction') }}</Button
            >
          </form>
        </div>
      </div>
    </section>
    <section class="space-y-3">
      <h4 class="px-3 text-xs font-medium text-muted-foreground">
        {{ t('aiAssistant.local.runtime') }}
      </h4>
      <div class="rounded-xl border border-[hsl(var(--border-subtle))] bg-muted/10 px-4 py-4">
        <SettingsPropertyRow
          :label="t('aiAssistant.local.executable')"
          :description="
            t(
              driver === 'antigravity'
                ? 'setting.agentInstances.antigravityBinaryHint'
                : 'setting.agentInstances.binaryHint',
            )
          "
          :html-for="`${uid}-executable`"
          ><Input
            :id="`${uid}-executable`"
            v-model="form.executablePath"
            data-testid="ai-native-executable"
            required
            :maxlength="4096"
            :disabled="busy"
            class="h-8 rounded-lg text-xs"
        /></SettingsPropertyRow>
        <AntigravityAcpDownload v-if="driver === 'antigravity'" :disabled="busy" />
        <SettingsPropertyRow
          :label="t('aiAssistant.local.home')"
          :description="
            t(
              driver === 'antigravity'
                ? 'setting.agentInstances.antigravityHomeHint'
                : 'setting.agentInstances.homeHint',
            )
          "
          :html-for="`${uid}-home`"
          ><Input
            :id="`${uid}-home`"
            v-model="form.homePath"
            data-testid="ai-native-home"
            :maxlength="4096"
            :disabled="busy"
            class="h-8 rounded-lg text-xs"
        /></SettingsPropertyRow>
      </div>
    </section>
    <section class="space-y-3">
      <h4 class="px-3 text-xs font-medium text-muted-foreground">
        {{ t('aiAssistant.local.writeScopes') }}
      </h4>
      <div class="rounded-xl border border-[hsl(var(--border-subtle))] bg-muted/10 px-4 py-4">
        <p class="mb-3 text-xs leading-5 text-muted-foreground">
          {{ t('setting.agentInstances.nativePermissionHint') }}
        </p>
        <fieldset class="flex flex-wrap gap-x-5 gap-y-3">
          <legend class="sr-only">{{ t('aiAssistant.local.writeScopes') }}</legend>
          <label v-for="scope in scopes" :key="scope" class="flex items-center gap-2 text-xs"
            ><input
              v-model="form.writeScopes"
              type="checkbox"
              :value="scope"
              :disabled="busy"
              class="accent-primary"
            />{{
              t(
                scope === 'goals:write'
                  ? 'aiAssistant.local.goalWrites'
                  : 'aiAssistant.local.taskWrites',
              )
            }}</label
          >
        </fieldset>
      </div>
    </section>
    <section class="space-y-3">
      <div class="flex items-center justify-between px-3">
        <h4 class="text-xs font-medium text-muted-foreground">
          {{ t('setting.agentInstances.models') }}
        </h4>
        <Button
          v-if="connection || canProbe"
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 px-1 text-xs"
          :disabled="busy || !form.enabled"
          @click="emit('check')"
          ><RefreshCw class="mr-1.5 size-3" />{{ t('setting.ai.refreshModels') }}</Button
        >
      </div>
      <div class="rounded-xl border border-[hsl(var(--border-subtle))] bg-muted/10 px-4 py-4">
        <p v-if="!models.length" class="text-xs leading-5 text-muted-foreground">
          {{ t('setting.ai.modelInventoryHint') }}
        </p>
        <p
          v-if="models.length && !modelVisibility.canPersist.value"
          data-testid="ai-native-model-visibility-unavailable"
          class="mb-2 text-xs leading-5 text-muted-foreground"
        >
          {{ t('setting.ai.modelVisibilityContextUnavailable') }}
        </p>
        <div
          v-for="model in models"
          :key="model.id"
          class="min-w-0 border-b border-[hsl(var(--border-subtle))] py-2 text-xs last:border-b-0"
          data-testid="ai-native-model"
        >
          <div class="flex min-w-0 items-center justify-between gap-2">
            <p class="min-w-0 truncate font-medium" :title="model.name">{{ model.name }}</p>
            <label class="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                class="accent-primary"
                :checked="modelVisibility.isVisible(visibilityInstanceId, model.id)"
                :disabled="busy || enabled === false || !modelVisibility.canPersist.value"
                :aria-label="t('setting.ai.showModelNamed', { name: model.name })"
                :data-testid="`ai-native-model-visible:${model.id}`"
                @change="updateModelVisibility(model.id, $event)"
              />
              {{ t('setting.ai.showModel') }}
            </label>
          </div>
          <p
            class="mt-0.5 break-all font-mono text-[11px] text-muted-foreground"
            data-testid="ai-native-model-id"
          >
            {{ model.id }}
          </p>
          <div
            v-if="model.reasoningEfforts?.length || model.serviceTiers?.length"
            class="mt-1.5 flex flex-wrap gap-1.5"
          >
            <span
              v-if="model.reasoningEfforts?.length"
              class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              :title="model.reasoningEfforts.join(', ')"
              data-testid="ai-native-model-reasoning"
              >{{ t('setting.ai.modelReasoning') }}</span
            >
            <span
              v-if="model.serviceTiers?.length"
              class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              :title="model.serviceTiers.map((tier) => tier.name).join(', ')"
              data-testid="ai-native-model-service-tier"
              >{{ t('setting.ai.modelServiceTiers') }}</span
            >
          </div>
        </div>
      </div>
    </section>
    <p
      v-if="error"
      role="alert"
      class="min-w-0 truncate whitespace-nowrap px-3 text-xs leading-5 text-muted-foreground"
      :title="t('aiAssistant.local.actionFailed')"
    >
      {{ t('aiAssistant.local.actionFailed') }}
    </p>
    <footer class="flex items-center justify-end gap-3 px-3">
      <div class="flex gap-2">
        <Button
          v-if="connection || canProbe"
          type="button"
          variant="outline"
          size="sm"
          :disabled="busy || !form.enabled"
          @click="emit('check')"
          >{{ t('aiAssistant.local.check') }}</Button
        ><Button
          type="submit"
          size="sm"
          :disabled="busy || !validated.success"
          data-testid="ai-native-save"
          >{{ t('setting.ai.saveConfiguration') }}</Button
        >
      </div>
    </footer>
  </form>
</template>
