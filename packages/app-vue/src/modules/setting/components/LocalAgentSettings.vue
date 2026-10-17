<script setup lang="ts">
import { computed, reactive, ref, useId, watch } from 'vue';
import { RefreshCw, RotateCcw, Trash2 } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Button, Input } from '@memoflow/ui-vue-shadcn';
import {
  LocalAgentConnectionInputSchema,
  LOCAL_AGENT_DEFAULT_EXECUTABLES,
  type LocalAgentConnection,
  type LocalAgentConnectionInput,
  type LocalAgentDriver,
  type LocalAgentStatus,
} from '@memoflow/contracts/ai';
import { getNativeAgentExecutionFailureMessage } from '../../ai/composables/error';
import { SettingsPropertyRow } from '../../../components/shared/settings';
import { useNativeModelVisibility } from '../../ai/composables/nativeModelVisibility';
import { useServerStateIdentityScope } from '../../../platform/server-state';
import AgentDriverIcon from '../../ai/components/AgentDriverIcon.vue';
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
}>();
const { t } = useI18n();
const uid = `ai-native-${useId()}`;
const modelVisibility = useNativeModelVisibility(useServerStateIdentityScope(), () =>
  props.status?.status === 'ready' ? props.status.modelVisibilityContext : undefined,
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
const statusLabel = computed(() =>
  !form.enabled
    ? t('setting.ai.inactiveProvider')
    : props.status?.status === 'ready'
      ? getNativeAgentExecutionFailureMessage(props.status.lastExecutionFailure, t) ||
        t('setting.agentInstances.discoveredModels', { count: props.status.models.length })
      : (props.status?.message ?? t('setting.agentInstances.unchecked')),
);
const validated = computed(() =>
  LocalAgentConnectionInputSchema.safeParse({
    ...form,
    homePath: form.homePath?.trim() || undefined,
  }),
);
function save() {
  if (validated.value.success) emit('save', validated.value.data);
}
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
          <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span role="status">{{ statusLabel }}</span>
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
