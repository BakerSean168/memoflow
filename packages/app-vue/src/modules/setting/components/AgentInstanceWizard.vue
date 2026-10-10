<template>
  <Dialog v-if="open" :open="open" @update:open="!$event && $emit('close')">
    <SettingsDialogShell
      :title="t('setting.agentInstances.title')"
      :description="t('setting.agentInstances.description')"
      test-id="ai-agent-wizard"
      size="wide"
    >
      <ol class="mb-5 flex gap-4 text-sm" :aria-label="t('setting.agentInstances.steps')">
        <li
          v-for="(label, index) in ['agent', 'identity', 'config']"
          :key="label"
          :aria-current="step === index ? 'step' : undefined"
          :class="step === index ? 'text-primary font-semibold' : 'text-muted-foreground'"
        >
          {{ index + 1 }}. {{ t(`setting.agentInstances.${label}`) }}
        </li>
      </ol>
      <div v-if="step === 0" class="grid gap-3 sm:grid-cols-2">
        <button
          v-for="agent in agents"
          :key="agent.id"
          type="button"
          class="rounded-xl bg-muted/50 p-4 text-left hover:bg-muted"
          :data-testid="`ai-provider-catalog-${agent.id}`"
          @click="choose(agent.id)"
        >
          <p class="font-medium">{{ agent.name }}</p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{
              agent.id === 'mastra'
                ? t('setting.agentInstances.builtinHint')
                : t('setting.agentInstances.nativeHint')
            }}
          </p>
        </button>
      </div>
      <div v-else-if="step === 1" class="space-y-4">
        <div class="space-y-2">
          <Label for="ai-instance-name">{{ t('setting.ai.displayName') }}</Label
          ><Input
            id="ai-instance-name"
            v-model="name"
            :maxlength="driver === 'mastra' ? 100 : 120"
          />
        </div>
        <template v-if="driver !== 'mastra'">
          <div class="space-y-2">
            <Label for="ai-instance-slug">{{ t('setting.agentInstances.instanceId') }}</Label
            ><Input id="ai-instance-slug" v-model="slug" maxlength="64" />
            <p class="text-xs text-muted-foreground">
              {{ t('setting.agentInstances.slugHint') }}
            </p>
          </div>
          <div class="space-y-2">
            <Label for="ai-instance-accent">{{ t('setting.agentInstances.accent') }}</Label
            ><input id="ai-instance-accent" v-model="accent" type="color" />
          </div>
        </template>
        <p v-else class="text-xs text-muted-foreground">
          {{ t('setting.agentInstances.assignedIdHint') }}
        </p>
        <p v-if="!validIdentity" role="alert" class="text-sm text-destructive">
          {{ t('setting.agentInstances.identityError') }}
        </p>
      </div>
      <div v-else-if="driver === 'mastra'" class="space-y-4" data-testid="ai-mastra-config">
        <p class="text-sm text-muted-foreground">
          {{ t('setting.agentInstances.mastraConfigHint') }}
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <button
            v-for="service in catalog"
            :key="service.id"
            type="button"
            class="rounded-xl bg-muted/50 p-4 text-left hover:bg-muted"
            :data-testid="`ai-provider-catalog-${service.id}`"
            @click="$emit('configureMastra', service, name.trim())"
          >
            {{ service.name }}
          </button>
        </div>
        <p v-if="!catalog.length" role="status">
          {{ t('setting.agentInstances.catalogUnavailable') }}
        </p>
      </div>
      <KeepAlive>
        <LocalAgentSettings
          v-if="step === 2 && driver !== 'mastra'"
          :key="driver + slug + name"
          :connection="null"
          :driver="driver"
          :identity="{ name: name.trim(), instanceSlug: slug, accentColor: accent }"
          :busy="busy"
          :error="error"
          @save="$emit('saveLocal', $event)"
          @cancel="$emit('close')"
        />
      </KeepAlive>
      <template #footer>
        <div class="flex w-full justify-between gap-3">
          <Button v-if="step > 0" variant="ghost" :disabled="busy" @click="step--">{{
            t('setting.ai.back')
          }}</Button
          ><span v-else />
          <div class="flex gap-2">
            <Button variant="ghost" :disabled="busy" @click="$emit('close')">{{
              t('setting.ai.cancel')
            }}</Button
            ><Button
              v-if="step === 1"
              :disabled="!validIdentity"
              data-testid="ai-instance-continue"
              @click="step = 2"
              >{{ t('setting.ai.continue') }}</Button
            >
          </div>
        </div>
      </template>
    </SettingsDialogShell>
  </Dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog, Input, Label } from '@memoflow/ui-vue-shadcn';
import {
  AgentInstanceSlugSchema,
  type AIProviderCatalogEntryDTO,
  type LocalAgentConnectionInput,
  type LocalAgentDriver,
} from '@memoflow/contracts/ai';
import { SettingsDialogShell } from '../../../components/shared/settings';
import LocalAgentSettings from './LocalAgentSettings.vue';
const props = defineProps<{
  open: boolean;
  native: boolean;
  catalog: AIProviderCatalogEntryDTO[];
  existingSlugs: string[];
  busy: boolean;
  error: boolean;
}>();
defineEmits<{
  close: [];
  saveLocal: [input: LocalAgentConnectionInput];
  configureMastra: [service: AIProviderCatalogEntryDTO, name: string];
}>();
const { t } = useI18n();
const step = ref(0);
const driver = ref<'mastra' | LocalAgentDriver>('mastra');
const name = ref('');
const slug = ref('');
const accent = ref('#6469da');
const agents = computed(() => [
  { id: 'mastra' as const, name: 'Mastra' },
  ...(props.native
    ? [
        { id: 'codex' as const, name: 'Codex' },
        { id: 'claude' as const, name: 'Claude Code' },
        { id: 'pi' as const, name: 'Pi' },
        { id: 'dsh' as const, name: 'DSH' },
      ]
    : []),
]);
const validIdentity = computed(
  () =>
    Boolean(name.value.trim()) &&
    name.value.trim().length <= (driver.value === 'mastra' ? 100 : 120) &&
    (driver.value === 'mastra' ||
      (AgentInstanceSlugSchema.safeParse(slug.value).success &&
        !props.existingSlugs.includes(slug.value.trim()))),
);
function choose(id: 'mastra' | LocalAgentDriver) {
  driver.value = id;
  name.value = agents.value.find((agent) => agent.id === id)!.name;
  let candidate: string = id;
  let suffix = 2;
  while (props.existingSlugs.includes(candidate)) candidate = `${id}-${suffix++}`;
  slug.value = candidate;
  step.value = 1;
}
watch(
  () => props.open,
  () => {
    step.value = 0;
    name.value = '';
    slug.value = '';
  },
);
</script>
