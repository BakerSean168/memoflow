<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { CircleAlert, Check, ChevronDown, LockKeyhole, Search, Star } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import type {
  AIChatPermissionMode,
  AgentDriverKind,
  LocalAgentModelOptions,
} from '@memoflow/ai-contracts';
import type { ComposerModel, ModelCatalog } from '../composables/useAIModelCatalog';
import { aiUiHost } from '../ai-ui-host';
import AgentDriverIcon from './AgentDriverIcon.vue';
import AIModelTraitsPanel from './AIModelTraitsPanel.vue';

interface ComposerAgentOption {
  id: string;
  name: string;
  driver: AgentDriverKind;
  enabled: boolean;
  configured: boolean;
  accentColor?: string;
  nativePermissionMode?: 'supervised' | 'auto-approve';
  switchBlockedReason?: 'incompatible' | 'busy' | 'loading';
}
const FAVORITES_KEY = 'ai:composer:model-favorites:v1';
const props = defineProps<{
  agents: ComposerAgentOption[];
  selectedAgentId: string;
  models: ComposerModel[];
  catalog?: ModelCatalog;
  selectedModelKey: string;
  nativeModelOptions?: LocalAgentModelOptions;
  native: boolean;
  permissionMode?: AIChatPermissionMode;
  disabled: boolean;
  loading?: boolean;
}>();
const emit = defineEmits<{
  refresh: [];
  selectModel: [modelKey: string, agentId: string];
  modelOption: [kind: keyof LocalAgentModelOptions, value?: string];
  settings: [];
  permission: [mode: AIChatPermissionMode];
}>();
const { t } = useI18n();
const resolveIdentityScope = aiUiHost.useServerStateIdentityScope();
const favoritesStorageKey = computed(() => {
  const identity = resolveIdentityScope();
  return identity ? `${FAVORITES_KEY}:${identity}` : '';
});
const openMenu = ref<'models' | null>(null);
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
const providerUnavailable = computed(() => {
  if (props.loading) return false;
  if (!enabledAgents.value.length) return true;
  const catalog = props.catalog;
  if (!catalog) return false;
  const enabledEntries = Object.values(catalog).filter((entry) =>
    enabledAgents.value.some((agent) => agent.id === entry.agentKey),
  );
  if (enabledEntries.length !== enabledAgents.value.length) return false;
  if (enabledEntries.some((entry) => entry.status === 'ready' && entry.models.length)) return false;
  if (enabledEntries.some((entry) => ['idle', 'loading'].includes(entry.status))) return false;
  if (enabledAgents.value.some((agent) => agent.driver !== 'mastra')) return false;
  return enabledEntries.every((entry) => ['ready', 'error', 'unavailable'].includes(entry.status));
});
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
const selectedServiceTier = computed(
  () =>
    props.nativeModelOptions?.serviceTier ?? selectedModel.value?.defaultServiceTier ?? 'default',
);
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
}
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
function setMenu(menu: 'models', opened: boolean) {
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
  // Keep the picker open so the committed model's configuration can be chosen next.
  openMenu.value = 'models';
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
  if (event.isComposing || event.repeat) return;
  if (
    openMenu.value === 'models' &&
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.shiftKey &&
    /^[1-9]$/.test(event.key)
  ) {
    event.preventDefault();
    event.stopPropagation();
    const model = visibleModels.value[Number(event.key) - 1];
    if (model) selectModel(model);
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
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
  () => [props.disabled, providerUnavailable.value] as const,
  ([disabled, unavailable]) => {
    if (disabled || unavailable) openMenu.value = null;
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
          class="flex h-7 min-w-0 max-w-[clamp(7rem,42cqw,15rem)] items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45"
          :disabled="disabled"
          :title="
            blockedMessage(currentAgent) ||
            (selectedModel
              ? [
                  selectedModel.modelName,
                  currentAgent && instanceName(currentAgent),
                  selectedModel.providerName,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : t('aiAssistant.composer.chooseModel'))
          "
          :aria-label="t('aiAssistant.composer.model')"
          data-testid="ai-chat-model-selector"
        >
          <AgentDriverIcon :driver="currentAgent?.driver ?? 'mastra'" class="size-3.5 shrink-0" />
          <span class="min-w-0 truncate font-medium">
            {{ selectedModel?.modelName ?? t('aiAssistant.composer.chooseModel') }}
          </span>
          <span
            v-if="selectedModel"
            class="max-w-12 shrink-0 truncate text-[10px] font-normal opacity-70"
            data-testid="ai-chat-model-effort-label"
            >{{ traitsLabel }}</span
          >
          <ChevronDown class="size-3 shrink-0 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        :side-offset="7"
        :collision-padding="12"
        class="w-[min(35rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl p-0"
        data-testid="ai-model-picker"
      >
        <div class="flex h-[min(346px,calc(100dvh-80px))] min-h-0" @keydown="keyboardNavigation">
          <nav
            class="composer-agent-sidebar flex h-full min-h-0 w-12 shrink-0 flex-col items-center gap-1 overflow-hidden border-r border-border/60 bg-muted/25 px-1 py-2"
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
          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
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
                  v-for="(model, index) in visibleModels"
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
                        {{ instanceName(agents.find((agent) => agent.id === model.agentKey)!) }}
                        ·
                        {{ model.providerName }}
                      </span>
                    </span>
                    <kbd v-if="index < 9" class="mt-0.5 shrink-0 text-[9px] text-muted-foreground"
                      >Ctrl+{{ index + 1 }}</kbd
                    >
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
          <AIModelTraitsPanel
            v-if="selectedModel"
            :reasoning-efforts="hasModelTraits ? selectedModel?.reasoningEfforts : undefined"
            :service-tiers="hasModelTraits ? selectedModel?.serviceTiers : undefined"
            :selected-effort="selectedEffort"
            :selected-service-tier="selectedServiceTier"
            :disabled="disabled || loading"
            :permission-mode="
              native
                ? (currentAgent?.nativePermissionMode ?? 'supervised')
                : (permissionMode ?? 'supervised')
            "
            :native="native"
            @permission="emit('permission', $event)"
            @model-option="chooseTrait"
          />
        </div>
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
