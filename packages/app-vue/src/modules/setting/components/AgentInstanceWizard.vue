<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { Check, ChevronRight, X } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
} from '@memoflow/ui-vue-shadcn';
import {
  AgentInstanceSlugSchema,
  LocalAgentConnectionInputSchema,
  type AgentDriverKind,
  type CreateAgentInstance,
  type LocalAgentConnectionInput,
} from '@memoflow/contracts/ai';
import { SettingsPropertyRow } from '../../../components/shared/settings';
import AgentDriverIcon from '../../ai/components/AgentDriverIcon.vue';

// T3's Agent -> Identity -> Config flow, expressed with MemoFlow's Vue primitives.
// Model API vendors and credentials are intentionally not part of instance creation.
const props = defineProps<{
  open: boolean;
  native: boolean;
  existingSlugs: string[];
  busy: boolean;
  error: boolean;
}>();
const emit = defineEmits<{
  close: [];
  saveLocal: [input: LocalAgentConnectionInput];
  createMastra: [input: CreateAgentInstance];
}>();
const { t } = useI18n();
const uid = `agent-add-${useId()}`;
const step = ref(0);
const attempted = ref(false);
const driver = ref<AgentDriverKind>('mastra');
const name = ref('Mastra');
const slug = ref('mastra');
const accent = ref('#6469da');
const executablePath = ref('');
const homePath = ref('');
const steps = ['agent', 'identity', 'config'] as const;
const palette = ['#6469da', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
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
const selectedAgent = computed(() => agents.value.find((entry) => entry.id === driver.value)!);
const validIdentity = computed(
  () =>
    name.value.trim().length > 0 &&
    name.value.trim().length <= 120 &&
    AgentInstanceSlugSchema.safeParse(slug.value).success &&
    !props.existingSlugs.includes(slug.value.trim()),
);
const nativeInput = computed(() =>
  LocalAgentConnectionInputSchema.safeParse({
    driver: driver.value,
    name: name.value.trim(),
    instanceSlug: slug.value.trim(),
    accentColor: accent.value,
    executablePath: executablePath.value.trim() || driver.value,
    homePath: homePath.value.trim() || undefined,
    enabled: true,
    writeScopes: [],
  }),
);
function defaultSlug(id: AgentDriverKind) {
  let candidate: string = id;
  for (let n = 2; props.existingSlugs.includes(candidate); n++) candidate = `${id}-${n}`;
  return candidate;
}
function choose(id: AgentDriverKind) {
  if (props.busy || driver.value === id) return;
  driver.value = id;
  name.value = agents.value.find((entry) => entry.id === id)!.name;
  slug.value = defaultSlug(id);
  executablePath.value = id === 'mastra' ? '' : id;
  homePath.value = '';
  attempted.value = false;
}
function navigate(index: number) {
  if (props.busy) return;
  if (index > 1 && !validIdentity.value) {
    attempted.value = true;
    step.value = 1;
    return;
  }
  step.value = index;
}
function finish() {
  attempted.value = true;
  if (props.busy || !validIdentity.value) return;
  if (driver.value === 'mastra') {
    emit('createMastra', {
      driver: 'mastra',
      instanceId: slug.value.trim(),
      name: name.value.trim(),
      accentColor: accent.value,
      enabled: true,
    });
  } else if (nativeInput.value.success) emit('saveLocal', nativeInput.value.data);
}
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    step.value = 0;
    attempted.value = false;
    driver.value = 'mastra';
    name.value = 'Mastra';
    slug.value = defaultSlug('mastra');
    accent.value = '#6469da';
    executablePath.value = '';
    homePath.value = '';
  },
  { immediate: true },
);
</script>

<template>
  <Dialog :open="open" @update:open="!$event && !busy && emit('close')">
    <DialogContent
      data-testid="ai-agent-wizard"
      class="flex max-h-[min(90dvh,46rem)] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border border-[hsl(var(--border-subtle))] bg-background p-0 outline-none ring-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
      @escape-key-down="busy && $event.preventDefault()"
    >
      <header class="relative space-y-3 px-6 pb-4 pt-5">
        <div class="pr-8">
          <DialogTitle class="text-lg font-semibold">{{
            t('setting.agentInstances.title')
          }}</DialogTitle>
          <DialogDescription class="mt-1 text-sm text-muted-foreground">{{
            t('setting.agentInstances.description')
          }}</DialogDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="absolute right-4 top-3 size-8 text-muted-foreground"
          :disabled="busy"
          :aria-label="t('common.close')"
          @click="emit('close')"
          ><X class="size-4"
        /></Button>
        <ol
          class="grid grid-cols-3 gap-1 rounded-xl bg-muted/40 p-1"
          :aria-label="t('setting.agentInstances.steps')"
          data-testid="ai-agent-wizard-steps"
        >
          <li v-for="(label, index) in steps" :key="label" class="min-w-0">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-50"
              :class="
                step === index
                  ? 'bg-background font-medium text-foreground ring-1 ring-inset ring-[hsl(var(--border-subtle))]'
                  : 'text-muted-foreground hover:bg-background/60'
              "
              :aria-current="step === index ? 'step' : undefined"
              :disabled="busy"
              @click="navigate(index)"
            >
              <span
                class="grid size-5 shrink-0 place-items-center rounded-full text-xs ring-1"
                :class="
                  index < step
                    ? 'bg-primary text-primary-foreground ring-primary'
                    : index === step
                      ? 'bg-primary/10 text-primary ring-primary/50'
                      : 'bg-muted text-muted-foreground ring-[hsl(var(--border-subtle))]'
                "
                aria-hidden="true"
                ><Check v-if="index < step" class="size-3.5" /><template v-else>{{
                  index + 1
                }}</template></span
              >
              <span class="truncate">{{ t(`setting.agentInstances.${label}`) }}</span>
            </button>
          </li>
        </ol>
      </header>
      <div
        class="min-h-[16rem] min-w-0 flex-1 overflow-y-auto border-y border-[hsl(var(--border-subtle))] bg-muted/10 px-6 py-6"
        data-testid="ai-agent-wizard-body"
      >
        <div v-if="step === 0" class="space-y-3">
          <p class="text-sm font-medium">{{ t('setting.agentInstances.agent') }}</p>
          <div
            role="radiogroup"
            :aria-label="t('setting.agentInstances.agent')"
            class="grid gap-3 sm:grid-cols-2"
          >
            <button
              v-for="agent in agents"
              :key="agent.id"
              type="button"
              role="radio"
              :aria-checked="driver === agent.id"
              :disabled="busy"
              class="flex min-h-16 items-center gap-3 rounded-xl border px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
              :class="
                driver === agent.id
                  ? 'border-primary/70 bg-primary/10'
                  : 'border-[hsl(var(--border-subtle))] bg-muted/20 hover:bg-muted/40'
              "
              :data-testid="`ai-provider-catalog-${agent.id}`"
              @click="choose(agent.id)"
            >
              <AgentDriverIcon :driver="agent.id" class="size-5" />
              <span class="min-w-0 flex-1"
                ><span class="block text-sm font-medium">{{ agent.name }}</span
                ><span class="mt-0.5 block text-xs leading-5 text-muted-foreground">{{
                  agent.id === 'mastra'
                    ? t('setting.agentInstances.builtinHint')
                    : t('setting.agentInstances.nativeHint')
                }}</span></span
              >
              <span
                v-if="driver === agent.id"
                class="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
                aria-hidden="true"
                ><Check class="size-3.5"
              /></span>
            </button>
          </div>
        </div>
        <div v-else-if="step === 1" class="space-y-3">
          <SettingsPropertyRow
            :label="t('setting.ai.displayName')"
            :description="t('setting.agentInstances.nameHint')"
            :html-for="`${uid}-name`"
          >
            <Input
              :id="`${uid}-name`"
              v-model="name"
              maxlength="120"
              data-testid="ai-instance-name"
              class="h-8 rounded-lg bg-background"
              :disabled="busy"
            />
          </SettingsPropertyRow>
          <SettingsPropertyRow
            :label="t('setting.agentInstances.instanceId')"
            :description="t('setting.agentInstances.slugHint')"
            :html-for="`${uid}-slug`"
          >
            <Input
              :id="`${uid}-slug`"
              v-model="slug"
              maxlength="64"
              data-testid="ai-instance-slug"
              class="h-8 rounded-lg bg-background"
              :aria-invalid="attempted && !validIdentity"
              :disabled="busy"
            />
          </SettingsPropertyRow>
          <SettingsPropertyRow
            :label="t('setting.agentInstances.accent')"
            :description="t('setting.agentInstances.accentHint')"
            :html-for="`${uid}-accent`"
          >
            <div class="flex items-center gap-2 sm:justify-end">
              <button
                v-for="color in palette"
                :key="color"
                type="button"
                class="size-5 rounded-full ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-primary"
                :class="accent === color ? 'ring-2 ring-primary ring-offset-2' : ''"
                :style="{ backgroundColor: color }"
                :aria-label="`${t('setting.agentInstances.accent')}: ${color}`"
                :aria-pressed="accent === color"
                :disabled="busy"
                @click="accent = color"
              />
              <input
                :id="`${uid}-accent`"
                v-model="accent"
                type="color"
                class="size-7 cursor-pointer rounded-md border-0 bg-transparent p-0"
                :disabled="busy"
                :aria-label="t('setting.agentInstances.customColor')"
              />
            </div>
          </SettingsPropertyRow>
          <p v-if="attempted && !validIdentity" role="alert" class="text-xs text-destructive">
            {{ t('setting.agentInstances.identityError') }}
          </p>
        </div>
        <div v-else class="space-y-4" data-testid="ai-agent-wizard-config">
          <div class="flex items-center gap-3 rounded-xl bg-muted/35 px-4 py-3">
            <AgentDriverIcon :driver="driver" :style="{ color: accent }" />
            <div>
              <p class="text-sm font-medium">{{ name }}</p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {{ selectedAgent.name }} · {{ slug }}
              </p>
            </div>
          </div>
          <p
            v-if="driver === 'mastra'"
            class="max-w-xl text-sm leading-6 text-muted-foreground"
            data-testid="ai-mastra-config"
          >
            {{ t('setting.agentInstances.saveBeforeConfigHint') }}
          </p>
          <template v-else>
            <SettingsPropertyRow
              :label="t('aiAssistant.local.executable')"
              :description="t('setting.agentInstances.binaryHint')"
              :html-for="`${uid}-binary`"
              ><Input
                :id="`${uid}-binary`"
                v-model="executablePath"
                data-testid="ai-instance-executable"
                :placeholder="driver"
                class="h-8 rounded-lg bg-background"
                :disabled="busy"
            /></SettingsPropertyRow>
            <SettingsPropertyRow
              :label="t('aiAssistant.local.home')"
              :description="t('setting.agentInstances.homeHint')"
              :html-for="`${uid}-home`"
              ><Input
                :id="`${uid}-home`"
                v-model="homePath"
                data-testid="ai-instance-home"
                class="h-8 rounded-lg bg-background"
                :disabled="busy"
            /></SettingsPropertyRow>
          </template>
          <p v-if="error" role="alert" class="text-xs text-destructive">
            {{ t('setting.agentInstances.instanceSaveError') }}
          </p>
        </div>
      </div>
      <footer
        class="flex shrink-0 items-center justify-between gap-3 px-6 py-4"
        data-testid="ai-agent-wizard-footer"
      >
        <Button
          v-if="step > 0"
          type="button"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="navigate(step - 1)"
          >{{ t('setting.ai.back') }}</Button
        ><span v-else />
        <div class="flex gap-2">
          <Button type="button" variant="ghost" size="sm" :disabled="busy" @click="emit('close')">{{
            t('setting.ai.cancel')
          }}</Button>
          <Button
            v-if="step < 2"
            type="button"
            size="sm"
            :disabled="busy || (step === 1 && !validIdentity)"
            data-testid="ai-instance-continue"
            @click="navigate(step + 1)"
            >{{ t('setting.ai.continue') }}<ChevronRight class="ml-1 size-3.5"
          /></Button>
          <Button
            v-else
            type="button"
            size="sm"
            :disabled="busy || !validIdentity || (driver !== 'mastra' && !nativeInput.success)"
            data-testid="ai-agent-instance-save"
            @click="finish"
            >{{
              busy ? t('setting.ai.savingProvider') : t('setting.agentInstances.createInstance')
            }}</Button
          >
        </div>
      </footer>
    </DialogContent>
  </Dialog>
</template>
