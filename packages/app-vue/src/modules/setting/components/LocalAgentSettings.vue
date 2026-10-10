<template>
  <form
    class="flex min-w-0 flex-col rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.3)] p-5"
    data-testid="ai-provider-detail"
    @submit.prevent="save"
  >
    <header
      class="flex items-center justify-between gap-3 border-b border-[hsl(var(--border-subtle))] pb-4"
    >
      <h3 class="truncate text-base font-semibold">{{ connection?.name ?? names[driver] }}</h3>
      <span class="text-xs text-muted-foreground" role="status">{{ statusLabel }}</span>
    </header>
    <div class="space-y-5 py-5">
      <div class="space-y-2">
        <Label for="ai-native-name">{{ t('setting.ai.displayName') }}</Label
        ><Input
          id="ai-native-name"
          v-model="form.name"
          required
          :maxlength="120"
          :disabled="busy"
        />
      </div>
      <div class="space-y-2">
        <Label for="ai-native-id">{{ t('setting.agentInstances.instanceId') }}</Label>
        <Input
          id="ai-native-id"
          :model-value="connection?.instanceSlug ?? connection?.id ?? identity?.instanceSlug ?? ''"
          readonly
        />
      </div>
      <div class="space-y-2">
        <Label for="ai-native-executable">{{ t('aiAssistant.local.executable') }}</Label
        ><Input
          id="ai-native-executable"
          v-model="form.executablePath"
          required
          :maxlength="4096"
          :disabled="busy"
        />
      </div>
      <div class="space-y-2">
        <Label for="ai-native-home">{{ t('aiAssistant.local.home') }}</Label
        ><Input id="ai-native-home" v-model="form.homePath" :maxlength="4096" :disabled="busy" />
      </div>
      <fieldset class="space-y-2 text-sm">
        <legend class="mb-2 font-medium">{{ t('aiAssistant.local.writeScopes') }}</legend>
        <label v-for="scope in scopes" :key="scope" class="flex items-center gap-2"
          ><input v-model="form.writeScopes" type="checkbox" :value="scope" :disabled="busy" />{{
            t(
              scope === 'goals:write'
                ? 'aiAssistant.local.goalWrites'
                : 'aiAssistant.local.taskWrites',
            )
          }}</label
        >
      </fieldset>
      <div class="space-y-2">
        <div
          class="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] pb-2"
        >
          <h4 class="text-sm font-semibold">Models</h4>
          <Button
            v-if="connection"
            type="button"
            variant="link"
            size="sm"
            :disabled="busy"
            @click="$emit('check')"
            >{{ t('setting.ai.refreshModels') }}</Button
          >
        </div>
        <div
          v-for="model in models"
          :key="model.id"
          class="truncate rounded-lg bg-muted/50 px-3 py-3 text-sm"
        >
          {{ model.name }}
        </div>
        <p v-if="!models.length" class="py-3 text-xs text-muted-foreground">
          {{ t('setting.ai.modelInventoryHint') }}
        </p>
      </div>
      <p class="text-xs text-muted-foreground">{{ t('aiAssistant.local.removalHint') }}</p>
      <p v-if="error" role="alert" class="text-sm text-destructive">
        {{ t('aiAssistant.local.actionFailed') }}
      </p>
    </div>
    <div class="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
      <Button
        v-if="connection"
        type="button"
        variant="ghost"
        size="sm"
        class="text-destructive"
        :disabled="busy"
        @click="$emit('remove')"
        >{{ t('setting.ai.deleteProvider') }}</Button
      >
      <Button
        v-else
        type="button"
        variant="ghost"
        size="sm"
        :disabled="busy"
        @click="$emit('cancel')"
        >{{ t('aiAssistant.local.cancel') }}</Button
      >
      <div class="flex gap-2">
        <Button
          v-if="connection"
          type="button"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="$emit('check')"
          >{{ t('aiAssistant.local.check') }}</Button
        >
        <Button
          type="submit"
          size="sm"
          :disabled="busy || !validatedInput.success"
          data-testid="ai-native-save"
          >{{ t('setting.ai.saveConfiguration') }}</Button
        >
      </div>
    </div>
  </form>
</template>
<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Label } from '@memoflow/ui-vue-shadcn';
import {
  LocalAgentConnectionInputSchema,
  type LocalAgentConnection,
  type LocalAgentConnectionInput,
  type LocalAgentDriver,
  type LocalAgentStatus,
} from '@memoflow/contracts/ai';
const props = defineProps<{
  connection: LocalAgentConnection | null;
  identity?: Pick<LocalAgentConnectionInput, 'name' | 'instanceSlug' | 'accentColor'>;
  driver: LocalAgentDriver;
  status?: LocalAgentStatus;
  busy: boolean;
  error: boolean;
}>();
const emit = defineEmits<{
  save: [input: LocalAgentConnectionInput];
  check: [];
  remove: [];
  cancel: [];
}>();
const { t } = useI18n();
const names = { codex: 'Codex', claude: 'Claude Code', pi: 'Pi', dsh: 'DeepSeek Harness (DSH)' };
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
  () => [props.connection?.id, props.connection?.revision, props.driver],
  () => {
    const connection = props.connection;
    Object.assign(form, {
      driver: props.driver,
      name: connection?.name ?? props.identity?.name ?? names[props.driver],
      instanceSlug: connection?.instanceSlug ?? props.identity?.instanceSlug,
      accentColor: connection?.accentColor ?? props.identity?.accentColor,
      executablePath: connection?.executablePath ?? props.driver,
      homePath: connection?.homePath ?? '',
      enabled: connection?.enabled ?? true,
      writeScopes: [...(connection?.writeScopes ?? [])],
    });
  },
  { immediate: true },
);
const models = computed(() => (props.status?.status === 'ready' ? props.status.models : []));
const statusLabel = computed(() =>
  props.status?.status === 'ready'
    ? t('aiAssistant.local.ready', { count: props.status.models.length })
    : (props.status?.message ?? t('setting.agentInstances.unchecked')),
);
const validatedInput = computed(() =>
  LocalAgentConnectionInputSchema.safeParse({
    ...form,
    homePath: form.homePath?.trim() || undefined,
  }),
);
function save() {
  if (validatedInput.value.success) emit('save', validatedInput.value.data);
}
</script>
