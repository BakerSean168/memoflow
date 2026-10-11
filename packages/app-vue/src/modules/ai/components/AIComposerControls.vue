<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  Brain,
  Check,
  ChevronDown,
  Eye,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Zap,
} from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import type { AgentDriverKind, AIChatPermissionMode } from '@memoflow/contracts/ai';
import type { ChatModelOption } from '../composables/types';
import { useServerStateIdentityScope } from '../../../platform/server-state';
import AgentDriverIcon from './AgentDriverIcon.vue';

interface ComposerAgentOption {
  id: string;
  name: string;
  driver: AgentDriverKind;
  enabled: boolean;
  configured: boolean;
  accentColor?: string;
}
type ComposerModel = ChatModelOption & { agentKey: string };

const FAVORITES_KEY = 'ai:composer:model-favorites:v1';
const props = defineProps<{
  agents: ComposerAgentOption[];
  selectedAgentId: string;
  models: ComposerModel[];
  selectedModelKey: string;
  permissionMode: AIChatPermissionMode;
  native: boolean;
  disabled: boolean;
  loading?: boolean;
}>();
const emit = defineEmits<{
  selectAgent: [id: string];
  selectModel: [modelKey: string, agentId: string];
  permission: [mode: AIChatPermissionMode];
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
const permissionModes = computed<AIChatPermissionMode[]>(() =>
  props.native ? ['supervised', 'auto-approve'] : ['supervised', 'read-only'],
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
const modelIdentity = (model: ComposerModel) => model.agentKey + '::' + model.key;
const isFavorite = (model: ComposerModel) => favorites.value.includes(modelIdentity(model));

const visibleModels = computed(() => {
  const term = search.value.trim().toLocaleLowerCase();
  return props.models.filter((model) => {
    const agent = props.agents.find((entry) => entry.id === model.agentKey);
    if (!agent) return false;
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
  Boolean(props.agents.find((agent) => agent.id === model.agentKey && agent.enabled));

function setMenu(menu: 'models' | 'traits' | 'permissions', opened: boolean) {
  if (opened && props.disabled) return;
  openMenu.value = opened ? menu : null;
  if (opened && menu === 'models') {
    search.value = '';
    activeSection.value = props.selectedAgentId || props.agents[0]?.id || 'favorites';
    void nextTick(() => searchInput.value?.focus());
  }
}
function selectModel(model: ComposerModel) {
  if (!canChooseModel(model)) return;
  emit('selectModel', model.key, model.agentKey);
  openMenu.value = null;
}
function selectAgentWithoutModel(agent: ComposerAgentOption) {
  if (!agent.enabled || props.disabled || props.loading) return;
  emit('selectAgent', agent.id);
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
  favorites.value = favorites.value.includes(key)
    ? favorites.value.filter((item) => item !== key)
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
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) openMenu.value = null;
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
    <!-- T3: one provider-instance + model picker, not two unrelated selects. -->
    <Popover :open="openMenu === 'models'" @update:open="setMenu('models', $event)">
      <PopoverTrigger as-child>
        <button
          type="button"
          class="flex h-7 min-w-0 max-w-[clamp(6.5rem,40cqw,12.5rem)] items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45"
          :disabled="disabled"
          :title="
            selectedModel
              ? selectedModel.modelName + ' · ' + selectedModel.providerName
              : t('aiAssistant.composer.chooseModel')
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
        class="w-[min(23rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl p-0"
        data-testid="ai-model-picker"
      >
        <div
          class="flex max-h-[min(25rem,calc(100dvh-5rem))] min-h-0"
          @keydown="keyboardNavigation"
        >
          <nav
            class="flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border/60 bg-muted/25 px-1 py-2"
            :aria-label="t('aiAssistant.composer.agents')"
            data-testid="ai-model-picker-sidebar"
          >
            <button
              type="button"
              class="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :class="activeSection === 'favorites' && !search ? 'bg-muted text-foreground' : ''"
              :aria-label="t('aiAssistant.composer.favorites')"
              :aria-pressed="activeSection === 'favorites' && !search"
              data-testid="ai-model-picker-favorites"
              @click="
                activeSection = 'favorites';
                search = '';
              "
            >
              <Star
                class="size-4"
                :class="activeSection === 'favorites' && !search ? 'fill-current' : ''"
              />
            </button>
            <div class="mx-auto my-0.5 h-px w-6 shrink-0 bg-border/70" />
            <button
              v-for="agent in agents"
              :key="agent.id"
              type="button"
              class="relative grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-35"
              :class="activeSection === agent.id && !search ? 'bg-muted text-foreground' : ''"
              :disabled="!agent.enabled"
              :title="instanceName(agent)"
              :aria-label="instanceName(agent)"
              :aria-pressed="activeSection === agent.id && !search"
              :data-testid="'ai-model-picker-agent-' + agent.id"
              @click="
                activeSection = agent.id;
                search = '';
              "
            >
              <AgentDriverIcon :driver="agent.driver" class="size-4" />
              <span
                v-if="agent.id === selectedAgentId"
                class="absolute bottom-0.5 right-0.5 size-1 rounded-full bg-primary"
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
                  class="group flex min-w-0 items-center gap-0.5 rounded-lg hover:bg-muted/60"
                >
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45"
                    :disabled="!canChooseModel(model)"
                    data-model-picker-row
                    data-testid="ai-model-picker-option"
                    :data-model-key="model.key"
                    :title="model.modelName + ' · ' + model.providerName"
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
                class="px-3 py-5 text-center text-xs text-muted-foreground"
                data-testid="ai-model-picker-empty"
              >
                <p>
                  {{
                    search
                      ? t('aiAssistant.composer.noSearchResults')
                      : activeSection === 'favorites'
                        ? t('aiAssistant.composer.noFavorites')
                        : t('aiAssistant.composer.notConfigured')
                  }}
                </p>
                <button
                  v-if="browsedAgent?.enabled && !search && activeSection !== 'favorites'"
                  type="button"
                  class="mt-3 rounded-md bg-muted px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/80"
                  data-testid="ai-model-picker-select-agent"
                  @click="selectAgentWithoutModel(browsedAgent)"
                >
                  {{ t('aiAssistant.composer.selectAgent') }}
                </button>
              </div>
            </div>
            <div class="shrink-0 border-t border-border/65 p-1.5">
              <button
                type="button"
                class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                data-testid="ai-model-picker-settings"
                @click="
                  openMenu = null;
                  emit('settings');
                "
              >
                <Settings2 class="size-3.5" />{{ t('aiAssistant.composer.configure') }}
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>

    <!-- No fake effort presets: existing model catalog does not declare executable traits. -->
    <Popover :open="openMenu === 'traits'" @update:open="setMenu('traits', $event)">
      <PopoverTrigger as-child>
        <button
          type="button"
          class="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45"
          :disabled="disabled || !selectedModel"
          :aria-label="t('aiAssistant.composer.modelOptions')"
          data-testid="ai-chat-traits-selector"
        >
          <Brain class="size-3.5" /><span class="hidden sm:inline">{{
            t('aiAssistant.composer.defaultOptions')
          }}</span
          ><ChevronDown class="size-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        :side-offset="7"
        :collision-padding="12"
        class="w-[min(16.5rem,calc(100vw-1.5rem))] p-2.5"
        data-testid="ai-model-traits-menu"
      >
        <p class="text-xs font-medium">{{ t('aiAssistant.composer.modelOptions') }}</p>
        <p class="mt-1 text-[11px] leading-4 text-muted-foreground">
          {{ t('aiAssistant.composer.noExecutableTraits') }}
        </p>
      </PopoverContent>
    </Popover>

    <Popover :open="openMenu === 'permissions'" @update:open="setMenu('permissions', $event)">
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
