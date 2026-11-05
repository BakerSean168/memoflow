<script setup lang="ts">
import { computed, nextTick, onUpdated, ref, watch } from 'vue';
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  LockKeyhole,
  Search,
  Lock,
  PenLine,
  Sparkles,
  ShieldOff,
  Star,
  Zap,
} from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import { AIChatPermissionModeSchema, resolveCompatibleRuntimeMode } from '@memoflow/ai-contracts';
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
  supportedRuntimeModes?: readonly AIChatPermissionMode[];
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
const permissionMenuOpen = ref(false);
const search = ref('');
const activeSection = ref('favorites');
const favorites = ref<string[]>([]);
const searchInput = ref<HTMLInputElement | null>(null);
const modelList = ref<HTMLElement | null>(null);
const sidebar = ref<HTMLElement | null>(null);
const traitsPanel = ref<InstanceType<typeof AIModelTraitsPanel> | null>(null);
const indicatorTop = ref<number | null>(null);
const pendingTraitFocus = ref(false);

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
/**
 * The model the options column describes. T3-aligned: the column follows the
 * committed selection while browsing, so the current model's levels stay
 * directly adjustable without re-clicking its model row. Only an Agent section
 * without any committed model previews that Agent's default/first model, and
 * that preview stays read-only until a model is committed. Favorites and
 * search keep the committed selection because no single Agent owns those rows.
 */
const browsedModel = computed<ComposerModel | undefined>(() => {
  if (selectedModel.value) return selectedModel.value;
  const agent = browsedAgent.value;
  if (!agent) return undefined;
  const agentModels = props.models.filter((model) => model.agentKey === agent.id);
  return agentModels.find((model) => model.key === props.selectedModelKey) ?? agentModels[0];
});
const browsedModelCommitted = computed(
  () => Boolean(browsedModel.value) && browsedModel.value === selectedModel.value,
);
const browsedEffort = computed(() => {
  const model = browsedModel.value;
  if (!model) return '';
  if (browsedModelCommitted.value)
    return props.nativeModelOptions?.reasoningEffort ?? model.defaultReasoningEffort ?? '';
  return model.defaultReasoningEffort ?? model.reasoningEfforts?.[0] ?? '';
});
const browsedServiceTier = computed(() => {
  const model = browsedModel.value;
  if (!model) return 'default';
  if (browsedModelCommitted.value)
    return props.nativeModelOptions?.serviceTier ?? model.defaultServiceTier ?? 'default';
  return model.defaultServiceTier ?? 'default';
});
const lockedTraitsHint = computed(() =>
  browsedModel.value && !browsedModelCommitted.value
    ? t('aiAssistant.composer.selectModelToAdjust')
    : '',
);
const speedOptions = computed(() => {
  // Service tiers are discovered model parameters, like reasoning levels.
  const tiers = browsedModel.value?.serviceTiers ?? [];
  return tiers.length
    ? [
        { id: 'default', label: t('aiAssistant.composer.standardMode') },
        ...tiers.map((tier) => ({ id: tier.id, label: tier.name })),
      ]
    : [];
});
const permissionOptions = computed(() => {
  const supported = currentAgent.value?.supportedRuntimeModes;
  return AIChatPermissionModeSchema.options
    .filter((mode) => !supported || supported.includes(mode))
    .map((id) => ({
      id,
      label: t('aiAssistant.composer.runtimeModes.' + id + '.label'),
      hint: t('aiAssistant.composer.runtimeModes.' + id + '.hint'),
      icon: {
        'approval-required': Lock,
        'auto-accept-edits': PenLine,
        auto: Sparkles,
        'full-access': ShieldOff,
      }[id],
    }));
});
const permissionValue = computed(() =>
  resolveCompatibleRuntimeMode(
    props.permissionMode ?? 'approval-required',
    permissionOptions.value.map((option) => option.id),
  ),
);
const permissionLabel = computed(
  () => permissionOptions.value.find((option) => option.id === permissionValue.value)?.label ?? '',
);
const permissionIcon = computed(
  () => permissionOptions.value.find((option) => option.id === permissionValue.value)?.icon ?? Lock,
);
const previewPermission = ref<AIChatPermissionMode | null>(null);
const permissionPreview = computed(
  () =>
    permissionOptions.value.find(
      (option) => option.id === (previewPermission.value ?? permissionValue.value),
    ) ?? permissionOptions.value[0],
);
watch(permissionMenuOpen, () => {
  previewPermission.value = null;
});
const canAdjustBrowsed = computed(
  () => browsedModelCommitted.value && !props.disabled && !props.loading,
);

function chooseTrait(kind: keyof LocalAgentModelOptions, value?: string) {
  if (!canAdjustBrowsed.value) return;
  emit('modelOption', kind, value);
}
function chooseSpeed(value: string) {
  if (!canAdjustBrowsed.value || value === browsedServiceTier.value) return;
  emit('modelOption', 'serviceTier', value);
}
function movePermissionFocus(event: KeyboardEvent) {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
  const target = event.currentTarget as HTMLElement;
  const rows = Array.from(
    target.parentElement?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
  );
  const index = rows.indexOf(target as HTMLButtonElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? rows.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + rows.length) % rows.length;
  event.preventDefault();
  rows[next]?.focus();
}
function selectPermission(mode: AIChatPermissionMode) {
  permissionMenuOpen.value = false;
  if (props.disabled || mode === permissionValue.value) return;
  emit('permission', mode);
}
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
  if (!opened) permissionMenuOpen.value = false;
  if (opened && menu === 'models') {
    search.value = '';
    activeSection.value = enabledAgents.value.some((agent) => agent.id === props.selectedAgentId)
      ? props.selectedAgentId
      : enabledAgents.value[0]?.id || 'favorites';
    emit('refresh');
    void nextTick(() => searchInput.value?.focus());
  }
}
function focusTraits() {
  traitsPanel.value?.focusSelected();
}
function selectModel(model: ComposerModel) {
  if (!canChooseModel(model)) return;
  const changed = model.key !== props.selectedModelKey || model.agentKey !== props.selectedAgentId;
  emit('selectModel', model.key, model.agentKey);
  // Keep the picker open so the committed model's configuration can be chosen next.
  openMenu.value = 'models';
  // The column renders the new model's levels on commit, then takes focus.
  if (changed) pendingTraitFocus.value = true;
  else void nextTick(focusTraits);
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
function measureIndicator() {
  const active = sidebar.value?.querySelector<HTMLElement>('[data-rail-active="true"]');
  indicatorTop.value = active ? active.offsetTop + active.offsetHeight / 2 - 10 : null;
}
function cycleProvider(direction: 1 | -1) {
  const sections = ['favorites', ...enabledAgents.value.map((agent) => agent.id)];
  const index = sections.indexOf(activeSection.value);
  const next = sections[(index + direction + sections.length) % sections.length]!;
  if (next === 'favorites') activeSection.value = 'favorites';
  else {
    const agent = enabledAgents.value.find((entry) => entry.id === next);
    if (agent) browseAgent(agent);
  }
  search.value = '';
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
  if (
    openMenu.value === 'models' &&
    event.ctrlKey &&
    event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    (event.key === 'ArrowUp' || event.key === 'ArrowDown')
  ) {
    event.preventDefault();
    event.stopPropagation();
    cycleProvider(event.key === 'ArrowDown' ? 1 : -1);
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
    if (disabled || unavailable) {
      openMenu.value = null;
      permissionMenuOpen.value = false;
    }
  },
);
watch(
  () => [props.selectedModelKey, props.selectedAgentId] as const,
  () => {
    if (!pendingTraitFocus.value) return;
    pendingTraitFocus.value = false;
    void nextTick(focusTraits);
  },
  { flush: 'post' },
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
// The rail indicator follows the browsed item's measured offset, so it slides
// instead of blinking between items.
onUpdated(measureIndicator);
watch([activeSection, search, () => enabledAgents.value.length], () => {
  void nextTick(measureIndicator);
});
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
            v-if="hasModelTraits"
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
        class="w-[min(37.25rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl p-0 transition-[width,height,scale,opacity] duration-150 data-[state=open]:zoom-in-[0.98]! data-[state=closed]:zoom-out-[0.98]! data-[side=top]:slide-in-from-bottom-0!"
        data-testid="ai-model-picker"
      >
        <div
          class="flex h-[min(346px,calc(100dvh-80px))] flex-col"
          data-testid="ai-model-picker-frame"
          @keydown="keyboardNavigation"
        >
          <div class="flex min-h-0 flex-1" data-testid="ai-model-picker-body">
            <nav
              ref="sidebar"
              class="composer-agent-sidebar relative flex h-full min-h-0 w-11 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border/60 bg-muted/25 p-1"
              :aria-label="t('aiAssistant.composer.agents')"
              data-testid="ai-model-picker-sidebar"
            >
              <span
                v-if="indicatorTop !== null"
                aria-hidden="true"
                class="pointer-events-none absolute right-0 top-0 z-10 h-5 w-[3px] rounded-l-full bg-primary transition-[top] duration-200 ease-out motion-reduce:transition-none"
                :style="{ top: indicatorTop + 'px' }"
                data-testid="ai-model-picker-active-indicator"
              />
              <button
                type="button"
                class="relative grid aspect-square w-full shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                :class="
                  activeSection === 'favorites' && !search ? 'bg-foreground/10 text-foreground' : ''
                "
                :aria-label="t('aiAssistant.composer.favorites')"
                :aria-pressed="activeSection === 'favorites' && !search"
                :data-rail-active="activeSection === 'favorites' && !search ? 'true' : undefined"
                data-testid="ai-model-picker-favorites"
                @click="
                  activeSection = 'favorites';
                  search = '';
                "
              >
                <Star class="size-4 fill-current" />
              </button>
              <div class="border-b border-border/70" aria-hidden="true" />
              <button
                v-for="agent in enabledAgents"
                :key="agent.id"
                type="button"
                class="relative grid aspect-square w-full shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-35 disabled:hover:bg-transparent"
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
                :data-rail-active="activeSection === agent.id && !search ? 'true' : undefined"
                :data-testid="'ai-model-picker-agent-' + agent.id"
                @click="browseAgent(agent)"
              >
                <AgentDriverIcon :driver="agent.driver" class="size-4" />
                <LockKeyhole
                  v-if="agent.switchBlockedReason === 'incompatible'"
                  class="absolute bottom-1 right-1 size-2.5"
                  aria-hidden="true"
                />
              </button>
            </nav>
            <div class="flex min-h-0 min-w-0 max-w-90 flex-1 flex-col">
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
              ref="traitsPanel"
              :model="browsedModel"
              :reasoning-efforts="browsedModel?.reasoningEfforts"
              :selected-effort="browsedEffort"
              :disabled="disabled || Boolean(loading)"
              :locked-hint="lockedTraitsHint"
              @model-option="chooseTrait"
            />
          </div>
          <div
            class="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/65 bg-muted/40 px-3 py-2"
            data-testid="ai-model-picker-footer"
          >
            <div
              v-if="speedOptions.length"
              role="radiogroup"
              :aria-label="t('aiAssistant.composer.serviceTier')"
              class="flex rounded-lg bg-input/40 p-0.5"
              data-testid="ai-model-picker-speed"
            >
              <button
                v-for="option in speedOptions"
                :key="option.id"
                type="button"
                role="radio"
                class="flex h-6 items-center justify-center gap-1 rounded-md px-2 text-xs outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45"
                :class="
                  browsedServiceTier === option.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground'
                "
                :aria-checked="browsedServiceTier === option.id"
                :disabled="!canAdjustBrowsed"
                :data-testid="'ai-model-picker-speed-' + option.id"
                @click="chooseSpeed(option.id)"
              >
                <Zap v-if="option.id !== 'default'" class="size-3 shrink-0" aria-hidden="true" />{{
                  option.label
                }}
              </button>
            </div>
            <Popover :open="permissionMenuOpen" @update:open="permissionMenuOpen = $event">
              <PopoverTrigger as-child>
                <button
                  type="button"
                  class="ms-auto flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  :aria-label="t('aiAssistant.composer.permissions') + ': ' + permissionLabel"
                  data-testid="ai-model-picker-permissions"
                >
                  <component :is="permissionIcon" class="size-3.5 shrink-0" aria-hidden="true" />
                  {{ permissionLabel }}
                  <ChevronUp class="size-3 shrink-0" aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                :side-offset="6"
                class="w-72 p-1.5"
                data-testid="ai-model-picker-permissions-menu"
              >
                <p class="px-2 pb-1 pt-0.5 text-[10px] font-medium text-muted-foreground">
                  {{ t('aiAssistant.composer.permissions') }}
                </p>
                <div
                  role="radiogroup"
                  :aria-label="t('aiAssistant.composer.permissions')"
                  class="flex gap-1 rounded-md bg-muted p-1"
                >
                  <button
                    v-for="option in permissionOptions"
                    :key="option.id"
                    type="button"
                    role="radio"
                    class="flex h-6 flex-1 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45"
                    :class="
                      permissionValue === option.id ? 'bg-background text-foreground shadow-sm' : ''
                    "
                    :aria-checked="permissionValue === option.id"
                    :aria-label="option.label"
                    :disabled="disabled"
                    :data-testid="'ai-model-picker-permission-' + option.id"
                    @mouseenter="previewPermission = option.id"
                    @mouseleave="previewPermission = null"
                    @focus="previewPermission = option.id"
                    @blur="previewPermission = null"
                    @keydown="movePermissionFocus"
                    @click="selectPermission(option.id)"
                  >
                    <component :is="option.icon" class="size-3.5" aria-hidden="true" />
                  </button>
                </div>
                <div class="px-2 pb-1 pt-2" aria-live="polite" data-testid="ai-permission-preview">
                  <p class="text-xs font-medium">
                    {{ permissionPreview?.label }}
                  </p>
                  <p class="mt-1 min-h-[2.75em] text-xs leading-snug text-muted-foreground">
                    {{ permissionPreview?.hint }}
                  </p>
                </div>
              </PopoverContent>
            </Popover>
          </div>
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
