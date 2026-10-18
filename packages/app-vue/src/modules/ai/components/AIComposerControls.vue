<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  Brain,
  CircleAlert,
  Check,
  ChevronDown,
  Eye,
  LockKeyhole,
  Search,
  ShieldCheck,
  Star,
  Zap,
} from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import type {
  AgentDriverKind,
  AIChatPermissionMode,
  LocalAgentModelOptions,
} from '@memoflow/contracts/ai';
import type { ComposerModel, ModelCatalog } from '../composables/useAIModelCatalog';
import { useServerStateIdentityScope } from '../../../platform/server-state';
import AgentDriverIcon from './AgentDriverIcon.vue';

interface ComposerAgentOption {
  id: string;
  name: string;
  driver: AgentDriverKind;
  enabled: boolean;
  configured: boolean;
  accentColor?: string;
  switchBlockedReason?: 'incompatible' | 'busy' | 'loading';
}
const FAVORITES_KEY = 'ai:composer:model-favorites:v1';
const props = defineProps<{
  agents: ComposerAgentOption[];
  selectedAgentId: string;
  models: ComposerModel[];
  catalog?: ModelCatalog;
  selectedModelKey: string;
  permissionMode: AIChatPermissionMode;
  nativeModelOptions?: LocalAgentModelOptions;
  native: boolean;
  disabled: boolean;
  loading?: boolean;
  supportedPermissionModes?: AIChatPermissionMode[];
}>();
const emit = defineEmits<{
  refresh: [];
  selectModel: [modelKey: string, agentId: string];
  permission: [mode: AIChatPermissionMode];
  modelOption: [kind: keyof LocalAgentModelOptions, value?: string];
  settings: [];
}>();
const { t } = useI18n();
const resolveIdentityScope = useServerStateIdentityScope();
const favoritesStorageKey = computed(() => {
  const identity = resolveIdentityScope();
  return identity ? `${FAVORITES_KEY}:${identity}` : '';
});
const openMenu = ref<'models' | 'traits' | 'permissions' | null>(null);
const search = ref('');
const activeSection = ref('favorites');
const favorites = ref<string[]>([]);
const searchInput = ref<HTMLInputElement | null>(null);
const modelList = ref<HTMLElement | null>(null);

const currentAgent = computed(() =>
  props.agents.find((agent) => agent.id === props.selectedAgentId),
);
const selectedModel = computed(() =>
  props.models.find(
    (model) => model.key === props.selectedModelKey && model.agentKey === props.selectedAgentId,
  ),
);
defineExpose({
  openModelPicker() {
    if (!props.disabled) setMenu('models', true);
  },
});
const enabledAgents = computed(() => props.agents.filter((agent) => agent.enabled));
const providerUnavailable = computed(() => !props.loading && !enabledAgents.value.length);
const browsedCatalog = computed(() =>
  Object.values(props.catalog ?? {}).find((entry) => entry.agentKey === activeSection.value),
);
const browseLoading = computed(() =>
  browsedCatalog.value
    ? ['idle', 'loading'].includes(browsedCatalog.value.status)
    : Boolean(props.loading),
);
const emptyMessage = computed(() => {
  if (search.value) return t('aiAssistant.composer.noSearchResults');
  if (browseLoading.value) return t('aiAssistant.composer.loadingModels');
  if (activeSection.value === 'favorites') return t('aiAssistant.composer.noFavorites');
  if (browsedAgent.value?.switchBlockedReason) return blockedMessage(browsedAgent.value);
  const reason = browsedCatalog.value?.reason;
  return reason
    ? t('aiAssistant.composer.catalogReason.' + reason)
    : t('aiAssistant.composer.noAvailableModels');
});
const hasReasoningChoices = computed(
  () => (selectedModel.value?.reasoningEfforts?.length ?? 0) > 1,
);
const hasModelTraits = computed(
  () =>
    !providerUnavailable.value &&
    props.native &&
    Boolean(hasReasoningChoices.value || selectedModel.value?.serviceTiers?.length),
);
const selectedEffort = computed(
  () =>
    props.nativeModelOptions?.reasoningEffort ?? selectedModel.value?.defaultReasoningEffort ?? '',
);
const selectedServiceTier = computed(() => props.nativeModelOptions?.serviceTier ?? 'default');
const traitsLabel = computed(
  () =>
    (hasReasoningChoices.value ? selectedEffort.value : '') ||
    (selectedServiceTier.value !== 'default'
      ? selectedServiceTier.value
      : t('aiAssistant.composer.defaultOptions')),
);
function chooseTrait(kind: keyof LocalAgentModelOptions, value?: string) {
  if (props.disabled || !hasModelTraits.value) return;
  emit('modelOption', kind, value);
  openMenu.value = null;
}
const permissionModes = computed<AIChatPermissionMode[]>(() =>
  providerUnavailable.value || !currentAgent.value?.enabled || !selectedModel.value
    ? []
    : (props.supportedPermissionModes ??
      (props.native ? ['supervised', 'auto-approve'] : ['supervised', 'read-only'])),
);
const permissionHint = (mode: AIChatPermissionMode) =>
  t(
    'aiAssistant.composer.' +
      (mode === 'read-only'
        ? 'readOnlyHint'
        : mode === 'auto-approve'
          ? 'autoApproveHint'
          : 'supervisedHint'),
  );
const instanceName = (agent: ComposerAgentOption) => {
  const duplicates = props.agents.filter((item) => item.name === agent.name).length;
  return duplicates > 1 ? agent.name + ' · ' + agent.id.replace(/^(agent|local):/, '') : agent.name;
};
const modelIdentity = (model: ComposerModel) => {
  // An implicit native instance keeps its favorite when selection materializes
  // a Connection. Read the previous Connection-based tuple as well.
  const agent = props.agents.find((entry) => entry.id === model.agentKey);
  const owner =
    model.agentInstanceId && agent?.driver !== 'mastra'
      ? 'local:' + model.agentInstanceId
      : model.agentKey;
  return owner + '::' + model.key;
};
const favoriteIdentities = (model: ComposerModel) => [
  modelIdentity(model),
  model.agentKey + '::' + model.key,
];
const isFavorite = (model: ComposerModel) =>
  favoriteIdentities(model).some((key) => favorites.value.includes(key));

const visibleModels = computed(() => {
  const term = search.value.trim().toLocaleLowerCase();
  return props.models.filter((model) => {
    const agent = props.agents.find((entry) => entry.id === model.agentKey);
    if (!agent?.enabled) return false;
    if (term) {
      return [model.modelName, model.modelId, model.providerName, agent.name, agent.id].some(
        (value) => value.toLocaleLowerCase().includes(term),
      );
    }
    return activeSection.value === 'favorites'
      ? isFavorite(model)
      : model.agentKey === activeSection.value;
  });
});
const browsedAgent = computed(() => props.agents.find((entry) => entry.id === activeSection.value));
const canChooseModel = (model: ComposerModel) =>
  !props.disabled &&
  !props.loading &&
  (!props.catalog ||
    Object.values(props.catalog).some(
      (entry) =>
        entry.agentKey === model.agentKey &&
        entry.status === 'ready' &&
        entry.models.some((item) => item.key === model.key),
    )) &&
  Boolean(
    props.agents.find(
      (agent) => agent.id === model.agentKey && agent.enabled && !agent.switchBlockedReason,
    ),
  );

function blockedMessage(agent?: ComposerAgentOption): string {
  return agent?.switchBlockedReason
    ? t('aiAssistant.composer.switchBlocked.' + agent.switchBlockedReason)
    : '';
}
function browseAgent(agent: ComposerAgentOption) {
  if (!agent.enabled || agent.switchBlockedReason || props.disabled) return;
  activeSection.value = agent.id;
  search.value = '';
}
function setMenu(menu: 'models' | 'traits' | 'permissions', opened: boolean) {
  if (opened && props.disabled) return;
  openMenu.value = opened ? menu : null;
  if (opened && menu === 'models') {
    search.value = '';
    activeSection.value = enabledAgents.value.some((agent) => agent.id === props.selectedAgentId)
      ? props.selectedAgentId
      : enabledAgents.value[0]?.id || 'favorites';
    emit('refresh');
    void nextTick(() => searchInput.value?.focus());
  }
}
function selectModel(model: ComposerModel) {
  if (!canChooseModel(model)) return;
  emit('selectModel', model.key, model.agentKey);
  openMenu.value = null;
}
function storeFavorites() {
  // Favorites are per cloud identity or desktop Profile, never shared by
  // different users of the same device. No identity means no persistence.
  if (!favoritesStorageKey.value) return;
  try {
    localStorage.setItem(favoritesStorageKey.value, JSON.stringify(favorites.value));
  } catch {
    // A denied storage permission never prevents choosing a model.
  }
}
function toggleFavorite(model: ComposerModel) {
  const key = modelIdentity(model);
  favorites.value = isFavorite(model)
    ? favorites.value.filter((item) => !favoriteIdentities(model).includes(item))
    : [...favorites.value, key].slice(-100);
  storeFavorites();
}
function keyboardNavigation(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const rows = Array.from(
    modelList.value?.querySelectorAll<HTMLButtonElement>(
      '[data-model-picker-row]:not(:disabled)',
    ) ?? [],
  );
  if (!rows.length) return;
  const current = rows.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === 'ArrowDown'
      ? (current + 1) % rows.length
      : (current < 0 ? rows.length - 1 : current + rows.length - 1) % rows.length;
  event.preventDefault();
  rows[next]?.focus();
}
watch(enabledAgents, (agents) => {
  if (
    activeSection.value !== 'favorites' &&
    !agents.some((agent) => agent.id === activeSection.value)
  )
    activeSection.value = 'favorites';
});
watch(
  () =>
    [
      props.disabled,
      hasModelTraits.value,
      providerUnavailable.value,
      permissionModes.value.length,
    ] as const,
  ([disabled, available, unavailable, modes]) => {
    if (
      disabled ||
      unavailable ||
      (!available && openMenu.value === 'traits') ||
      (modes < 2 && openMenu.value === 'permissions')
    )
      openMenu.value = null;
  },
);
watch(
  favoritesStorageKey,
  (key) => {
    favorites.value = [];
    if (!key) return;
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(value))
        favorites.value = value
          .filter((item): item is string => typeof item === 'string')
          .slice(0, 100);
    } catch {
      favorites.value = [];
    }
  },
  { immediate: true },
);
</script>

<template>
  <div
    class="flex min-w-0 max-w-full items-center gap-0.5"
    data-testid="ai-composer-agent-controls"
  >
    <button
      v-if="providerUnavailable"
      type="button"
      class="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      data-testid="ai-composer-provider-unavailable"
      @click="emit('settings')"
    >
      <CircleAlert class="size-3.5 shrink-0" />{{ t('aiAssistant.composer.openProviderSettings') }}
    </button>
    <!-- T3: one provider-instance + model picker, not two unrelated selects. -->
    <Popover v-else :open="openMenu === 'models'" @update:open="setMenu('models', $event)">
      <PopoverTrigger as-child>
        <button
          type="button"
          class="flex h-7 min-w-0 max-w-[clamp(6.5rem,40cqw,12.5rem)] items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45"
          :disabled="disabled"
          :title="
            blockedMessage(currentAgent) ||
            (selectedModel
              ? selectedModel.modelName + ' · ' + selectedModel.providerName
              : t('aiAssistant.composer.chooseModel'))
          "
          :aria-label="t('aiAssistant.composer.model')"
          data-testid="ai-chat-model-selector"
        >
          <AgentDriverIcon :driver="currentAgent?.driver ?? 'mastra'" class="size-3.5 shrink-0" />
          <span class="min-w-0 truncate font-medium">
            {{ selectedModel?.modelName ?? t('aiAssistant.composer.chooseModel') }}
          </span>
          <ChevronDown class="size-3 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        :side-offset="7"
        :collision-padding="12"
        class="w-[min(360px,calc(100vw-24px))] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl p-0"
        data-testid="ai-model-picker"
      >
        <div class="flex h-[min(346px,calc(100dvh-80px))] min-h-0" @keydown="keyboardNavigation">
          <nav
            class="composer-agent-sidebar flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border/60 bg-muted/25 px-1 py-2"
            :aria-label="t('aiAssistant.composer.agents')"
            data-testid="ai-model-picker-sidebar"
          >
            <button
              type="button"
              class="relative grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :class="
                activeSection === 'favorites' && !search ? 'bg-foreground/10 text-foreground' : ''
              "
              :aria-label="t('aiAssistant.composer.favorites')"
              :aria-pressed="activeSection === 'favorites' && !search"
              data-testid="ai-model-picker-favorites"
              @click="
                activeSection = 'favorites';
                search = '';
              "
            >
              <Star class="size-4 fill-current" />
              <span
                v-if="activeSection === 'favorites' && !search"
                aria-hidden="true"
                class="pointer-events-none absolute -right-1.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-l-full bg-primary"
                data-testid="ai-model-picker-active-indicator"
              />
            </button>
            <div class="mx-auto my-0.5 h-px w-6 shrink-0 bg-border/70" />
            <button
              v-for="agent in enabledAgents"
              :key="agent.id"
              type="button"
              class="relative grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-35 disabled:hover:bg-transparent"
              :class="
                agent.switchBlockedReason
                  ? 'opacity-35 hover:bg-transparent hover:text-muted-foreground'
                  : activeSection === agent.id && !search
                    ? 'bg-foreground/10 text-foreground'
                    : ''
              "
              :disabled="!agent.enabled"
              :title="blockedMessage(agent) || instanceName(agent)"
              :aria-label="
                blockedMessage(agent)
                  ? instanceName(agent) + ' · ' + blockedMessage(agent)
                  : instanceName(agent)
              "
              :aria-disabled="Boolean(agent.switchBlockedReason) || !agent.enabled"
              :aria-pressed="activeSection === agent.id && !search"
              :data-testid="'ai-model-picker-agent-' + agent.id"
              @click="browseAgent(agent)"
            >
              <AgentDriverIcon :driver="agent.driver" class="size-4" />
              <LockKeyhole
                v-if="agent.switchBlockedReason === 'incompatible'"
                class="absolute bottom-1 right-1 size-2.5"
                aria-hidden="true"
              />
              <span
                v-if="activeSection === agent.id && !search"
                aria-hidden="true"
                class="pointer-events-none absolute -right-1.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-l-full bg-primary"
                data-testid="ai-model-picker-active-indicator"
              />
            </button>
          </nav>
          <div class="flex min-w-0 flex-1 flex-col">
            <label class="flex h-11 shrink-0 items-center gap-2 border-b border-border/65 px-3">
              <Search class="size-3.5 shrink-0 text-muted-foreground" />
              <input
                ref="searchInput"
                v-model="search"
                type="search"
                class="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                :placeholder="t('aiAssistant.composer.searchModels')"
                :aria-label="t('aiAssistant.composer.searchModels')"
                data-testid="ai-model-picker-search"
              />
            </label>
            <div
              ref="modelList"
              class="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5"
              data-testid="ai-model-picker-results"
            >
              <template v-if="visibleModels.length">
                <div
                  v-for="model in visibleModels"
                  :key="modelIdentity(model)"
                  class="group flex min-w-0 items-center gap-0.5 rounded-lg"
                  :class="canChooseModel(model) ? 'hover:bg-muted/60' : ''"
                  :title="blockedMessage(agents.find((agent) => agent.id === model.agentKey))"
                  :tabindex="
                    agents.find((agent) => agent.id === model.agentKey)?.switchBlockedReason
                      ? 0
                      : undefined
                  "
                  :aria-label="
                    agents.find((agent) => agent.id === model.agentKey)?.switchBlockedReason
                      ? model.modelName +
                        ' · ' +
                        blockedMessage(agents.find((agent) => agent.id === model.agentKey))
                      : undefined
                  "
                >
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45"
                    :disabled="!canChooseModel(model)"
                    :aria-pressed="
                      selectedAgentId === model.agentKey && selectedModelKey === model.key
                    "
                    data-model-picker-row
                    data-testid="ai-model-picker-option"
                    :data-model-key="model.key"
                    :title="
                      blockedMessage(agents.find((agent) => agent.id === model.agentKey)) ||
                      model.modelName + ' · ' + model.providerName
                    "
                    @click="selectModel(model)"
                  >
                    <AgentDriverIcon
                      :driver="
                        agents.find((agent) => agent.id === model.agentKey)?.driver ?? 'mastra'
                      "
                      class="mt-0.5 size-3.5"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-xs font-medium text-foreground">{{
                        model.modelName
                      }}</span>
                      <span class="mt-0.5 block truncate text-[10px] text-muted-foreground">
                        {{ instanceName(agents.find((agent) => agent.id === model.agentKey)!) }} ·
                        {{ model.providerName }}
                      </span>
                    </span>
                    <Check
                      v-if="selectedAgentId === model.agentKey && selectedModelKey === model.key"
                      class="mt-0.5 size-3.5 shrink-0 text-primary"
                    />
                  </button>
                  <LockKeyhole
                    v-if="
                      agents.find((agent) => agent.id === model.agentKey)?.switchBlockedReason ===
                      'incompatible'
                    "
                    class="size-3 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    class="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    :aria-label="
                      isFavorite(model)
                        ? t('aiAssistant.composer.unfavorite')
                        : t('aiAssistant.composer.favorite')
                    "
                    :aria-pressed="isFavorite(model)"
                    data-testid="ai-model-picker-toggle-favorite"
                    @click.stop="toggleFavorite(model)"
                  >
                    <Star
                      class="size-3.5"
                      :class="isFavorite(model) ? 'fill-current text-primary' : ''"
                    />
                  </button>
                </div>
              </template>
              <div
                v-else
                class="px-2.5 py-3 text-left text-xs leading-relaxed"
                data-testid="ai-model-picker-empty"
                role="status"
              >
                <p class="text-muted-foreground">
                  {{ emptyMessage }}
                </p>
                <template v-if="browsedAgent && !search && !browseLoading">
                  <button
                    type="button"
                    class="mt-1.5 block text-left font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    data-testid="ai-model-picker-empty-settings"
                    @click="
                      openMenu = null;
                      emit('settings');
                    "
                  >
                    {{ t('aiAssistant.composer.openAgentSetup') }}
                  </button>
                  <button
                    type="button"
                    class="mt-2 block text-left text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    data-testid="ai-model-picker-recheck"
                    @click="emit('refresh')"
                  >
                    {{ t('aiAssistant.composer.recheckModels') }}
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>

    <!-- T3 parity: show Traits ONLY when a native model actually advertises
         executable options; Web Mastra / Pi / DSH remain two-control layouts. -->
    <Popover
      v-if="hasModelTraits"
      :open="openMenu === 'traits'"
      @update:open="setMenu('traits', $event)"
    >
      <PopoverTrigger as-child>
        <button
          type="button"
          class="flex h-7 max-w-[8.5rem] shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45"
          :disabled="disabled"
          :aria-label="t('aiAssistant.composer.modelOptions')"
          data-testid="ai-chat-traits-selector"
        >
          <Brain class="size-3.5 shrink-0" />
          <span class="max-w-[6rem] truncate">{{ traitsLabel }}</span>
          <ChevronDown class="size-3 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        :side-offset="7"
        :collision-padding="12"
        class="w-[min(16.5rem,calc(100vw-1.5rem))] max-h-[min(21rem,calc(100dvh-5rem))] overflow-y-auto p-1"
        data-testid="ai-model-traits-menu"
      >
        <template v-if="hasReasoningChoices">
          <p class="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
            {{ t('aiAssistant.composer.reasoningEffort') }}
          </p>
          <button
            v-for="effort in selectedModel?.reasoningEfforts"
            :key="effort"
            type="button"
            class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            :data-testid="'ai-traits-effort-' + effort"
            @click="chooseTrait('reasoningEffort', effort)"
          >
            <span>{{
              effort === 'xhigh'
                ? 'Extra High'
                : effort === 'super-high'
                  ? 'Super High'
                  : effort === 'ultra'
                    ? 'Ultra'
                    : effort.charAt(0).toUpperCase() + effort.slice(1)
            }}</span>
            <Check v-if="selectedEffort === effort" class="size-3.5 text-primary" />
          </button>
        </template>
        <template v-if="selectedModel?.serviceTiers?.length">
          <div v-if="hasReasoningChoices" class="my-1 h-px bg-border/60" />
          <p class="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
            {{ t('aiAssistant.composer.serviceTier') }}
          </p>
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            data-testid="ai-traits-tier-default"
            @click="chooseTrait('serviceTier', 'default')"
          >
            <span>{{ t('aiAssistant.composer.defaultOptions') }}</span>
            <Check v-if="selectedServiceTier === 'default'" class="size-3.5 text-primary" />
          </button>
          <button
            v-for="tier in selectedModel.serviceTiers"
            :key="tier.id"
            type="button"
            class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            :data-testid="'ai-traits-tier-' + tier.id"
            @click="chooseTrait('serviceTier', tier.id)"
          >
            <span>{{ tier.name }}</span>
            <Check v-if="selectedServiceTier === tier.id" class="size-3.5 text-primary" />
          </button>
        </template>
      </PopoverContent>
    </Popover>

    <Popover
      v-if="permissionModes.length > 1"
      :open="openMenu === 'permissions'"
      @update:open="setMenu('permissions', $event)"
    >
      <PopoverTrigger as-child>
        <button
          type="button"
          class="flex h-7 min-w-0 max-w-[8.75rem] shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45"
          :disabled="disabled"
          :aria-label="t('aiAssistant.composer.permissions')"
          :title="permissionHint(permissionMode)"
          data-testid="ai-chat-permission-selector"
        >
          <Eye v-if="permissionMode === 'read-only'" class="size-3.5 shrink-0" />
          <Zap v-else-if="permissionMode === 'auto-approve'" class="size-3.5 shrink-0" />
          <ShieldCheck v-else class="size-3.5 shrink-0" />
          <span class="min-w-0 truncate">{{ t('aiAssistant.composer.' + permissionMode) }}</span>
          <ChevronDown class="size-3 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        :side-offset="7"
        :collision-padding="12"
        class="w-[min(16.5rem,calc(100vw-1.5rem))] space-y-0.5 p-1"
        data-testid="ai-permission-picker"
      >
        <button
          v-for="mode in permissionModes"
          :key="mode"
          type="button"
          class="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          :data-testid="'ai-permission-option-' + mode"
          @click="
            emit('permission', mode);
            openMenu = null;
          "
        >
          <ShieldCheck v-if="mode === 'supervised'" class="mt-0.5 size-3.5 shrink-0" />
          <Eye v-else-if="mode === 'read-only'" class="mt-0.5 size-3.5 shrink-0" />
          <Zap v-else class="mt-0.5 size-3.5 shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="block text-xs font-medium">{{ t('aiAssistant.composer.' + mode) }}</span>
            <span class="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{{
              permissionHint(mode)
            }}</span>
          </span>
          <Check v-if="permissionMode === mode" class="mt-0.5 size-3.5 shrink-0 text-primary" />
        </button>
      </PopoverContent>
    </Popover>
  </div>
</template>

<style scoped>
.composer-agent-sidebar {
  overflow-x: hidden;
  scrollbar-width: none;
}

.composer-agent-sidebar::-webkit-scrollbar {
  display: none;
}
</style>
