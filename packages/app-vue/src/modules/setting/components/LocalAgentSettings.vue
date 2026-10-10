<script setup lang="ts">
import { computed, reactive, useId, watch } from 'vue';
import { RefreshCw } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Switch } from '@memoflow/ui-vue-shadcn';
import {
  LocalAgentConnectionInputSchema,
  type LocalAgentConnection,
  type LocalAgentConnectionInput,
  type LocalAgentDriver,
  type LocalAgentStatus,
} from '@memoflow/contracts/ai';
import { SettingsPropertyRow } from '../../../components/shared/settings';
import AgentDriverIcon from '../../ai/components/AgentDriverIcon.vue';
const props = defineProps<{
  connection: LocalAgentConnection | null;
  identity?: Pick<LocalAgentConnectionInput, 'name' | 'instanceSlug' | 'accentColor'>;
  driver: LocalAgentDriver;
  enabled?: boolean;
  status?: LocalAgentStatus;
  canProbe?: boolean;
  busy: boolean;
  error: boolean;
}>();
const emit = defineEmits<{
  save: [input: LocalAgentConnectionInput];
  toggle: [enabled: boolean];
  check: [];
  remove: [];
  cancel: [];
}>();
const { t } = useI18n();
const uid = `ai-native-${useId()}`;
const names = { codex: 'Codex', claude: 'Claude Code', pi: 'Pi', dsh: 'DSH' };
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
      executablePath: current?.executablePath ?? props.driver,
      homePath: current?.homePath ?? '',
      enabled: props.enabled ?? current?.enabled ?? true,
      writeScopes: [...(current?.writeScopes ?? [])],
    });
  },
  { immediate: true },
);
const models = computed(() => (props.status?.status === 'ready' ? props.status.models : []));
const statusLabel = computed(() =>
  !form.enabled
    ? t('setting.ai.inactiveProvider')
    : props.status?.status === 'ready'
      ? t('aiAssistant.local.ready', { count: props.status.models.length })
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
    <header class="flex items-center justify-between gap-4 px-3 py-2">
      <div class="flex min-w-0 items-center gap-3">
        <AgentDriverIcon
          :driver="driver"
          class="size-5"
          :style="{ color: identity?.accentColor }"
        />
        <div class="min-w-0">
          <h3 class="truncate text-base font-semibold">
            {{ connection?.name ?? identity?.name ?? names[driver] }}
          </h3>
          <p class="mt-1 text-xs text-muted-foreground" role="status">{{ statusLabel }}</p>
        </div>
      </div>
      <Switch
        :model-value="form.enabled"
        :disabled="busy"
        :aria-label="t('setting.ai.enableProvider', { name: form.name })"
        data-testid="ai-provider-detail-toggle"
        @update:model-value="emit('toggle', $event)"
      />
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
    <section class="space-y-3">
      <h4 class="px-3 text-xs font-medium text-muted-foreground">
        {{ t('aiAssistant.local.runtime') }}
      </h4>
      <div class="rounded-xl border border-[hsl(var(--border-subtle))] bg-muted/10 px-4 py-4">
        <SettingsPropertyRow
          :label="t('aiAssistant.local.executable')"
          :description="t('setting.agentInstances.binaryHint')"
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
          :description="t('setting.agentInstances.homeHint')"
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
        <div
          v-for="model in models"
          :key="model.id"
          class="truncate border-b border-[hsl(var(--border-subtle))] py-2 text-xs last:border-b-0"
        >
          {{ model.name }}
        </div>
      </div>
    </section>
    <p v-if="error" role="alert" class="px-3 text-xs text-destructive">
      {{ t('aiAssistant.local.actionFailed') }}
    </p>
    <footer class="flex items-center justify-between gap-3 px-3">
      <Button
        v-if="connection"
        type="button"
        variant="ghost"
        size="sm"
        class="text-destructive"
        :disabled="busy"
        @click="emit('remove')"
        >{{ t('setting.ai.deleteProvider') }}</Button
      ><span v-else />
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
