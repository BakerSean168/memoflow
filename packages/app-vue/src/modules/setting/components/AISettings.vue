<template>
  <Card data-testid="ai-settings-panel">
    <CardHeader class="gap-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{{ t('setting.ai.title') }}</CardTitle>
          <CardDescription>{{ t('setting.ai.description') }}</CardDescription>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" :disabled="isLoadingProviders" @click="loadProviders">
            {{ t('setting.ai.refreshProviders') }}
          </Button>
          <Button size="sm" data-testid="ai-provider-add" @click="openOnboarding">
            {{ t('setting.ai.addProvider') }}
          </Button>
        </div>
      </div>

      <div
        v-if="defaultProvider"
        class="rounded-xl border border-border/60 bg-muted/30 px-4 py-3"
        data-testid="ai-provider-default-summary"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {{ t('setting.ai.currentDefault') }}
            </p>
            <p class="mt-1 truncate text-sm font-semibold">
              {{ defaultProvider.name }}
              <span class="font-normal text-muted-foreground">· {{ defaultProvider.defaultModel || '—' }}</span>
            </p>
          </div>
          <Badge variant="secondary">{{ t('setting.ai.defaultProvider') }}</Badge>
        </div>
      </div>
    </CardHeader>

    <CardContent class="space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold">{{ t('setting.ai.connectedProviders') }}</h3>
          <p class="text-sm text-muted-foreground">{{ t('setting.ai.connectedProvidersDescription') }}</p>
        </div>
      </div>

      <div v-if="providerItems.length" class="space-y-3" data-testid="ai-provider-list">
        <div
          v-for="provider in providerItems"
          :key="provider.id"
          class="rounded-xl border border-border/60 bg-background/70 p-4"
        >
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-medium">{{ provider.name }}</p>
                <Badge v-if="provider.isDefault" variant="secondary">{{ t('setting.ai.defaultProvider') }}</Badge>
                <Badge v-if="!provider.isActive" variant="outline">{{ t('setting.ai.inactiveProvider') }}</Badge>
              </div>
              <p class="break-all text-xs text-muted-foreground">{{ provider.baseUrl }}</p>
              <p class="text-sm">
                <span class="text-muted-foreground">{{ t('setting.ai.defaultModelLabel') }}:</span>
                {{ provider.defaultModel || '—' }}
              </p>
              <p v-if="provider.credentialRef" class="text-xs text-muted-foreground">
                Provider credential configured
              </p>
              <p
                v-if="providerStatusMap[String(provider.id)]"
                class="text-xs"
                :class="providerStatusMap[String(provider.id)]?.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'"
              >
                {{ providerStatusMap[String(provider.id)]?.message }}
              </p>
            </div>

            <div class="flex flex-wrap justify-end gap-2">
              <Button
                v-if="!provider.isDefault"
                variant="outline"
                size="sm"
                @click="handleSetDefault(String(provider.id))"
              >
                {{ t('setting.ai.setDefaultProvider') }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="providerTestLoading[String(provider.id)] === true"
                @click="handleTestProvider(String(provider.id))"
              >
                {{
                  providerTestLoading[String(provider.id)]
                    ? t('setting.ai.testingProvider')
                    : t('setting.ai.testProvider')
                }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                :data-testid="`ai-provider-replace-${provider.id}`"
                @click="openProviderReplacement(provider)"
              >
                {{ t('setting.ai.replaceConnection') }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="providerRefreshLoading[String(provider.id)] === true"
                @click="handleRefreshModels(String(provider.id))"
              >
                {{
                  providerRefreshLoading[String(provider.id)]
                    ? t('setting.ai.refreshingModels')
                    : t('setting.ai.refreshModels')
                }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive"
                @click="handleDeleteProvider(String(provider.id))"
              >
                {{ t('setting.ai.deleteProvider') }}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else
        class="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 px-6 py-8 text-center"
        data-testid="ai-provider-empty"
      >
        <p class="font-medium">{{ t('setting.ai.emptyTitle') }}</p>
        <p class="mt-1 max-w-md text-sm text-muted-foreground">{{ t('setting.ai.emptyDescription') }}</p>
        <Button class="mt-4" @click="openOnboarding">{{ t('setting.ai.addProvider') }}</Button>
      </div>
    </CardContent>
  </Card>

  <Dialog :open="onboardingOpen" @update:open="handleDialogOpenChange">
    <DialogContent class="flex max-h-[88vh] min-h-0 max-w-3xl flex-col overflow-hidden p-0" data-testid="ai-provider-onboarding">
      <DialogHeader class="shrink-0 border-b px-6 py-5 text-left">
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <template v-for="(step, index) in flowSteps" :key="step">
            <span v-if="index > 0">—</span>
            <span :class="stepClass(step)">{{ index + 1 }}</span>
          </template>
        </div>
        <DialogTitle class="mt-2">{{ onboardingTitle }}</DialogTitle>
        <DialogDescription>{{ onboardingDescription }}</DialogDescription>
      </DialogHeader>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div v-if="onboardingStep === 'picker'" class="space-y-4">
          <Input v-model="catalogSearch" :placeholder="t('setting.ai.searchProviders')" autofocus />
          <div v-if="isLoadingCatalog" class="py-10 text-center text-sm text-muted-foreground">
            {{ t('setting.ai.loadingProviderCatalog') }}
          </div>
          <div v-else class="grid gap-3 sm:grid-cols-2">
            <button
              v-for="entry in filteredCatalog"
              :key="entry.id"
              type="button"
              class="group rounded-xl border border-border/70 p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
              :data-testid="`ai-provider-catalog-${entry.id}`"
              @click="selectCatalogEntry(entry)"
            >
              <div class="flex items-start gap-3">
                <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold">
                  {{ providerGlyph(entry.id) }}
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="font-medium">{{ entry.name }}</p>
                    <Badge v-if="entry.id === 'custom'" variant="outline">{{ t('setting.ai.customBadge') }}</Badge>
                  </div>
                  <p class="mt-1 text-sm text-muted-foreground">{{ entry.description }}</p>
                </div>
              </div>
            </button>
          </div>
          <p v-if="!isLoadingCatalog && !filteredCatalog.length" class="py-8 text-center text-sm text-muted-foreground">
            {{ t('setting.ai.noProviderMatches') }}
          </p>
        </div>

        <div v-else-if="onboardingStep === 'connection' && selectedCatalog" class="space-y-5">
          <div class="rounded-xl border border-border/60 bg-muted/25 p-4">
            <div class="flex items-center gap-3">
              <div class="flex size-10 items-center justify-center rounded-lg bg-muted text-sm font-semibold">
                {{ providerGlyph(selectedCatalog.id) }}
              </div>
              <div>
                <p class="font-medium">{{ selectedCatalog.name }}</p>
                <p class="text-sm text-muted-foreground">{{ selectedCatalog.description }}</p>
              </div>
            </div>
          </div>

          <div v-if="selectedCatalog.id === 'custom' && onboardingMode === 'create'" class="space-y-2">
            <Label for="ai-provider-name">{{ t('setting.ai.providerName') }}</Label>
            <Input id="ai-provider-name" v-model="connectionName" :placeholder="t('setting.ai.providerNamePlaceholder')" />
          </div>

          <div v-if="selectedCatalog.baseUrlEditable" class="space-y-2">
            <Label for="ai-provider-base-url">{{ t('setting.ai.baseUrl') }}</Label>
            <Input id="ai-provider-base-url" v-model="connectionBaseUrl" :placeholder="t('setting.ai.providerBaseUrlPlaceholder')" />
            <p class="text-xs text-muted-foreground">{{ t('setting.ai.customEndpointSecurityHint') }}</p>
          </div>
          <div v-else class="space-y-1">
            <Label>{{ t('setting.ai.endpoint') }}</Label>
            <p class="break-all rounded-lg border bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
              {{ selectedCatalog.defaultBaseUrl }}
            </p>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <Label for="ai-provider-api-key">API Key</Label>
              <a
                v-if="selectedCatalog.apiKeyUrl"
                :href="selectedCatalog.apiKeyUrl"
                target="_blank"
                rel="noreferrer"
                class="text-xs text-primary underline underline-offset-2"
              >
                {{ t('setting.ai.getApiKey') }}
              </a>
            </div>
            <Input
              id="ai-provider-api-key"
              v-model="connectionApiKey"
              type="password"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              :placeholder="t('setting.ai.providerApiKeyPlaceholder')"
            />
            <p class="text-xs text-muted-foreground">{{ t('setting.ai.apiKeyOneTimeHint') }}</p>
          </div>
        </div>

        <div v-else-if="onboardingStep === 'model' && probeResult && selectedCatalog" class="space-y-4">
          <div class="rounded-xl border border-border/60 bg-muted/25 px-4 py-3 text-sm">
            <p class="font-medium">{{ t('setting.ai.connectionVerified') }}</p>
            <p class="mt-1 break-all text-xs text-muted-foreground">{{ probeResult.baseUrl }}</p>
          </div>

          <div
            v-for="warning in probeResult.warnings"
            :key="warning"
            class="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm"
          >
            {{ warning }}
          </div>

          <template v-if="probeResult.models.length">
            <Input v-model="modelSearch" :placeholder="t('setting.ai.searchModels')" />
            <div class="max-h-[360px] space-y-2 overflow-y-auto pr-1" data-testid="ai-provider-model-list">
              <button
                v-for="model in filteredModels"
                :key="model.id"
                type="button"
                class="w-full rounded-xl border p-3 text-left transition-colors"
                :class="selectedModelId === model.id ? 'border-primary bg-primary/5' : 'border-border/60 hover:bg-muted/40'"
                @click="selectModel(model.id)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="truncate text-sm font-medium">{{ model.name || model.id }}</p>
                      <Badge v-if="isRecommendedModel(model.id)" variant="secondary">
                        {{ t('setting.ai.recommended') }}
                      </Badge>
                    </div>
                    <p class="mt-1 break-all text-xs text-muted-foreground">{{ model.id }}</p>
                  </div>
                  <span
                    class="mt-0.5 size-4 shrink-0 rounded-full border"
                    :class="selectedModelId === model.id ? 'border-[5px] border-primary' : 'border-border'"
                  />
                </div>
                <div v-if="model.contextWindow || model.inputCostPer1M != null || model.outputCostPer1M != null" class="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span v-if="model.contextWindow">{{ formatContext(model.contextWindow) }} context</span>
                  <span v-if="model.inputCostPer1M != null">${{ formatPrice(model.inputCostPer1M) }}/1M in</span>
                  <span v-if="model.outputCostPer1M != null">${{ formatPrice(model.outputCostPer1M) }}/1M out</span>
                </div>
              </button>
            </div>
          </template>

          <div v-if="needsManualModel" class="space-y-2 rounded-xl border border-dashed border-border/70 p-4">
            <p class="font-medium">{{ t('setting.ai.manualModelTitle') }}</p>
            <p class="text-sm text-muted-foreground">{{ t('setting.ai.manualModelDescription') }}</p>
            <Input v-model="manualModelId" :placeholder="t('setting.ai.manualModelPlaceholder')" @input="handleManualModelInput" />
          </div>

          <div v-if="effectiveModelId" class="rounded-xl border border-border/60 p-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-xs text-muted-foreground">{{ t('setting.ai.selectedModel') }}</p>
                <p class="mt-1 break-all text-sm font-medium">{{ effectiveModelId }}</p>
              </div>
              <Button variant="outline" size="sm" :disabled="isTestingModel" @click="testSelectedModel">
                {{ isTestingModel ? t('setting.ai.testingModel') : t('setting.ai.testSelectedModel') }}
              </Button>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">{{ t('setting.ai.modelTestCostHint') }}</p>
            <p v-if="verifiedModelId === effectiveModelId" class="mt-2 text-xs font-medium text-emerald-600">
              {{ t('setting.ai.modelTestPassed') }}
            </p>
          </div>
        </div>

        <div v-else-if="onboardingStep === 'review' && probeResult && selectedCatalog" class="space-y-4">
          <div class="rounded-xl border border-border/60 divide-y divide-border/60">
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr]">
              <span class="text-sm text-muted-foreground">{{ t('setting.ai.providerName') }}</span>
              <span class="text-sm font-medium">{{ connectionName }}</span>
            </div>
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr]">
              <span class="text-sm text-muted-foreground">{{ t('setting.ai.endpoint') }}</span>
              <span class="break-all text-sm">{{ probeResult.baseUrl }}</span>
            </div>
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr]">
              <span class="text-sm text-muted-foreground">{{ t('setting.ai.defaultModelLabel') }}</span>
              <span class="break-all text-sm font-medium">{{ effectiveModelId }}</span>
            </div>
          </div>

          <div
            v-if="onboardingMode === 'create'"
            class="flex items-center justify-between gap-4 rounded-xl border border-border/60 px-4 py-3"
          >
            <div>
              <p class="text-sm font-medium">{{ t('setting.ai.markAsDefault') }}</p>
              <p class="text-xs text-muted-foreground">{{ t('setting.ai.markAsDefaultDescription') }}</p>
            </div>
            <Switch
              :model-value="isDefaultSelection"
              :aria-label="t('setting.ai.markAsDefault')"
              @update:model-value="isDefaultSelection = $event"
            />
          </div>
          <div
            v-else
            class="rounded-xl border border-border/60 bg-muted/25 px-4 py-3 text-sm text-muted-foreground"
            data-testid="ai-provider-replacement-preserved-metadata"
          >
            {{ t('setting.ai.replacementPreservesMetadata') }}
          </div>

          <p class="text-xs text-muted-foreground">
            {{ onboardingMode === 'replace' ? t('setting.ai.replacementSecretHint') : t('setting.ai.reviewSecretHint') }}
          </p>
        </div>
      </div>

      <DialogFooter class="shrink-0 border-t px-6 py-4">
        <div class="flex w-full items-center justify-between gap-3">
          <Button v-if="onboardingStep !== flowSteps[0]" variant="ghost" :disabled="isBusy" @click="goBack">
            {{ t('setting.ai.back') }}
          </Button>
          <span v-else />

          <div class="flex gap-2">
            <Button variant="ghost" :disabled="isBusy" @click="closeOnboarding">
              {{ t('setting.ai.cancel') }}
            </Button>
            <Button
              v-if="onboardingStep === 'connection'"
              :disabled="!canProbe || isProbing"
              data-testid="ai-provider-probe"
              @click="probeConnection"
            >
              {{ isProbing ? t('setting.ai.probing') : t('setting.ai.probeAndLoadModels') }}
            </Button>
            <Button
              v-else-if="onboardingStep === 'model'"
              :disabled="!canContinueFromModel"
              @click="onboardingStep = 'review'"
            >
              {{ t('setting.ai.continue') }}
            </Button>
            <Button
              v-else-if="onboardingStep === 'review'"
              :disabled="!effectiveModelId || isSaving"
              data-testid="ai-provider-commit"
              @click="saveProvider"
            >
              {{
                isSaving
                  ? t(onboardingMode === 'replace' ? 'setting.ai.replacingProvider' : 'setting.ai.savingProvider')
                  : t(onboardingMode === 'replace' ? 'setting.ai.replaceAndFinish' : 'setting.ai.saveAndFinish')
              }}
            </Button>
          </div>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
} from '@memoflow/ui-vue-shadcn';
import type {
  AIProviderCatalogEntryDTO,
  AIProviderConfigClientDTO,
  ProbeAIProviderConnectionRes,
} from '@memoflow/contracts/ai';
import { useAI } from '../../ai/composables/useAI';
import { translateResultError } from '../../../shared/utils/translate-result-error';

type OnboardingStep = 'picker' | 'connection' | 'model' | 'review';
type OnboardingMode = 'create' | 'replace';
type ProviderStatusState = { tone: 'success' | 'error'; message: string };

const { t } = useI18n();
const {
  providers,
  providerCatalog,
  isLoadingProviders,
  loadProviders,
  loadProviderCatalog,
  probeProviderConnection,
  testProviderOnboardingModel,
  commitProviderOnboarding,
  probeProviderReplacement,
  commitProviderReplacement,
  deleteProvider,
  setDefaultProvider,
  refreshProviderModels,
  testProvider,
} = useAI();

const onboardingOpen = ref(false);
const onboardingMode = ref<OnboardingMode>('create');
const replacementProvider = ref<AIProviderConfigClientDTO | null>(null);
const onboardingStep = ref<OnboardingStep>('picker');
const catalogSearch = ref('');
const selectedCatalog = ref<AIProviderCatalogEntryDTO | null>(null);
const connectionName = ref('');
const connectionBaseUrl = ref('');
const connectionApiKey = ref('');
const probeResult = ref<ProbeAIProviderConnectionRes | null>(null);
const modelSearch = ref('');
const selectedModelId = ref('');
const manualModelId = ref('');
const verifiedModelId = ref('');
const isDefaultSelection = ref(false);
const isLoadingCatalog = ref(false);
const isProbing = ref(false);
const isTestingModel = ref(false);
const isSaving = ref(false);
const providerRefreshLoading = ref<Record<string, boolean>>({});
const providerTestLoading = ref<Record<string, boolean>>({});
const providerStatusMap = ref<Record<string, ProviderStatusState | null>>({});

const providerItems = computed(() => providers.value);
const defaultProvider = computed(() => providerItems.value.find((provider) => provider.isDefault) ?? null);
const isBusy = computed(() => isProbing.value || isTestingModel.value || isSaving.value);
const flowSteps = computed<OnboardingStep[]>(() =>
  onboardingMode.value === 'replace'
    ? ['connection', 'model', 'review']
    : ['picker', 'connection', 'model', 'review'],
);
const filteredCatalog = computed(() => {
  const query = catalogSearch.value.trim().toLowerCase();
  if (!query) return providerCatalog.value;
  return providerCatalog.value.filter((entry) =>
    `${entry.name} ${entry.description} ${entry.id}`.toLowerCase().includes(query),
  );
});
const filteredModels = computed(() => {
  if (!probeResult.value || !selectedCatalog.value) return [];
  const query = modelSearch.value.trim().toLowerCase();
  const recommended = new Set(selectedCatalog.value.recommendedModelIds);
  return probeResult.value.models
    .filter((model) => !query || `${model.name} ${model.id}`.toLowerCase().includes(query))
    .slice()
    .sort((left, right) => {
      const leftRank = recommended.has(left.id) ? 0 : 1;
      const rightRank = recommended.has(right.id) ? 0 : 1;
      return leftRank - rightRank || left.name.localeCompare(right.name);
    });
});
const needsManualModel = computed(
  () => !probeResult.value?.models.length || probeResult.value.discovery.status !== 'available',
);
const effectiveModelId = computed(() =>
  needsManualModel.value ? manualModelId.value.trim() : selectedModelId.value.trim(),
);
const canProbe = computed(() => {
  if (!selectedCatalog.value || !connectionApiKey.value.trim()) return false;
  if (selectedCatalog.value.id !== 'custom') return true;
  return Boolean(connectionName.value.trim() && connectionBaseUrl.value.trim());
});
const canContinueFromModel = computed(() => {
  const modelId = effectiveModelId.value;
  if (!modelId) return false;
  // Manual/fallback models are not part of the discovered inventory, so the
  // explicit model probe is required before the server will commit them.
  if (needsManualModel.value) return verifiedModelId.value === modelId;
  return true;
});
const onboardingTitle = computed(() => {
  const replacing = onboardingMode.value === 'replace';
  switch (onboardingStep.value) {
    case 'picker': return t('setting.ai.pickerTitle');
    case 'connection': return t(replacing ? 'setting.ai.replacementConnectionTitle' : 'setting.ai.connectionTitle');
    case 'model': return t('setting.ai.modelTitle');
    case 'review': return t(replacing ? 'setting.ai.replacementReviewTitle' : 'setting.ai.reviewTitle');
  }
  return '';
});
const onboardingDescription = computed(() => {
  const replacing = onboardingMode.value === 'replace';
  switch (onboardingStep.value) {
    case 'picker': return t('setting.ai.pickerDescription');
    case 'connection': return t(replacing ? 'setting.ai.replacementConnectionDescription' : 'setting.ai.connectionDescription');
    case 'model': return t(replacing ? 'setting.ai.replacementModelDescription' : 'setting.ai.modelDescription');
    case 'review': return t(replacing ? 'setting.ai.replacementReviewDescription' : 'setting.ai.reviewDescription');
  }
  return '';
});

onMounted(() => {
  void loadProviders();
});

function getAISettingErrorMessage(error: unknown, fallbackKey: string) {
  return translateResultError(error, t, { fallbackKey });
}

async function ensureProviderCatalog(): Promise<boolean> {
  if (providerCatalog.value.length) return true;
  isLoadingCatalog.value = true;
  try {
    await loadProviderCatalog();
    return providerCatalog.value.length > 0;
  } catch (error) {
    toast.error(getAISettingErrorMessage(error, 'setting.ai.providerCatalogFailed'));
    return false;
  } finally {
    isLoadingCatalog.value = false;
  }
}

async function openOnboarding() {
  resetOnboarding();
  onboardingOpen.value = true;
  await ensureProviderCatalog();
}

async function openProviderReplacement(provider: AIProviderConfigClientDTO) {
  resetOnboarding();
  onboardingMode.value = 'replace';
  replacementProvider.value = provider;
  isDefaultSelection.value = provider.isDefault;
  onboardingOpen.value = true;
  if (!(await ensureProviderCatalog())) return;

  const currentEndpoint = normalizeEndpointForCatalog(provider.baseUrl);
  const matchedPreset = providerCatalog.value.find(
    (entry) =>
      entry.id !== 'custom' &&
      normalizeEndpointForCatalog(entry.defaultBaseUrl) === currentEndpoint,
  );
  const entry = matchedPreset ?? providerCatalog.value.find((candidate) => candidate.id === 'custom');
  if (!entry) {
    toast.error(t('setting.ai.providerCatalogFailed'));
    return;
  }

  selectedCatalog.value = entry;
  connectionName.value = provider.name;
  connectionBaseUrl.value = entry.id === 'custom' ? provider.baseUrl : entry.defaultBaseUrl;
  connectionApiKey.value = '';
  onboardingStep.value = 'connection';
}

function closeOnboarding() {
  onboardingOpen.value = false;
  resetOnboarding();
}

function handleDialogOpenChange(open: boolean) {
  if (open) {
    onboardingOpen.value = true;
    return;
  }
  closeOnboarding();
}

function resetOnboarding() {
  onboardingMode.value = 'create';
  replacementProvider.value = null;
  onboardingStep.value = 'picker';
  catalogSearch.value = '';
  selectedCatalog.value = null;
  connectionName.value = '';
  connectionBaseUrl.value = '';
  // Raw secret is deliberately cleared on cancel/unmount/reset.
  connectionApiKey.value = '';
  probeResult.value = null;
  modelSearch.value = '';
  selectedModelId.value = '';
  manualModelId.value = '';
  verifiedModelId.value = '';
  isDefaultSelection.value = providerItems.value.length === 0;
  isProbing.value = false;
  isTestingModel.value = false;
  isSaving.value = false;
}

function selectCatalogEntry(entry: AIProviderCatalogEntryDTO) {
  selectedCatalog.value = entry;
  connectionName.value = entry.name;
  connectionBaseUrl.value = entry.defaultBaseUrl;
  connectionApiKey.value = '';
  onboardingStep.value = 'connection';
}

async function probeConnection() {
  if (!canProbe.value || !selectedCatalog.value) return;
  isProbing.value = true;
  try {
    const request = {
      catalogId: selectedCatalog.value.id,
      ...(selectedCatalog.value.baseUrlEditable ? { baseUrl: connectionBaseUrl.value.trim() } : {}),
      apiKey: connectionApiKey.value.trim(),
    };
    const result =
      onboardingMode.value === 'replace' && replacementProvider.value
        ? await probeProviderReplacement(String(replacementProvider.value.id), request)
        : await probeProviderConnection(request);
    probeResult.value = result;
    // Security contract: after a successful probe the browser keeps only the
    // opaque onboarding handle, never the raw credential.
    connectionApiKey.value = '';
    connectionBaseUrl.value = result.baseUrl;
    selectedModelId.value = '';
    manualModelId.value = '';
    verifiedModelId.value = '';
    onboardingStep.value = 'model';
    toast.success(t('setting.ai.connectionVerified'));
  } catch (error) {
    toast.error(getAISettingErrorMessage(error, 'setting.ai.providerProbeFailed'));
  } finally {
    isProbing.value = false;
  }
}

function selectModel(modelId: string) {
  selectedModelId.value = modelId;
  verifiedModelId.value = '';
}

function handleManualModelInput() {
  verifiedModelId.value = '';
}

async function testSelectedModel() {
  if (!probeResult.value || !effectiveModelId.value) return;
  isTestingModel.value = true;
  try {
    const result = await testProviderOnboardingModel({
      onboardingId: probeResult.value.onboardingId,
      modelId: effectiveModelId.value,
    });
    verifiedModelId.value = result.modelId;
    toast.success(t('setting.ai.modelTestPassed'));
  } catch (error) {
    verifiedModelId.value = '';
    toast.error(getAISettingErrorMessage(error, 'setting.ai.modelTestFailed'));
  } finally {
    isTestingModel.value = false;
  }
}

async function saveProvider() {
  if (!probeResult.value || !effectiveModelId.value) return;
  isSaving.value = true;
  try {
    if (onboardingMode.value === 'replace' && replacementProvider.value) {
      await commitProviderReplacement(String(replacementProvider.value.id), {
        onboardingId: probeResult.value.onboardingId,
        defaultModelId: effectiveModelId.value,
      });
      toast.success(t('setting.ai.providerConnectionReplaced'));
    } else {
      await commitProviderOnboarding({
        onboardingId: probeResult.value.onboardingId,
        name: connectionName.value.trim(),
        defaultModelId: effectiveModelId.value,
        isDefault: isDefaultSelection.value,
      });
      toast.success(t('setting.ai.providerCreated'));
    }
    closeOnboarding();
  } catch (error) {
    toast.error(getAISettingErrorMessage(error, 'setting.ai.providerActionFailed'));
  } finally {
    isSaving.value = false;
  }
}

function goBack() {
  switch (onboardingStep.value) {
    case 'connection':
      connectionApiKey.value = '';
      if (onboardingMode.value === 'create') onboardingStep.value = 'picker';
      break;
    case 'model':
      // A successful probe has already exchanged the raw key for an opaque
      // handle. Going back must start a fresh credential probe instead of
      // pretending the secret is still available in browser memory.
      probeResult.value = null;
      selectedModelId.value = '';
      manualModelId.value = '';
      verifiedModelId.value = '';
      onboardingStep.value = 'connection';
      break;
    case 'review':
      onboardingStep.value = 'model';
      break;
    case 'picker':
      break;
  }
}

async function handleSetDefault(providerId: string) {
  try {
    await setDefaultProvider(providerId);
    toast.success(t('setting.ai.providerDefaultUpdated'));
  } catch (error) {
    toast.error(getAISettingErrorMessage(error, 'setting.ai.providerActionFailed'));
  }
}

async function handleTestProvider(providerId: string) {
  providerTestLoading.value[providerId] = true;
  providerStatusMap.value[providerId] = null;
  try {
    const result = await testProvider({ providerId: providerId as never });
    if (!result.ok) {
      throw new Error(result.error || t('setting.ai.providerTestFailed'));
    }
    const message = t('setting.ai.providerTestPassed');
    providerStatusMap.value[providerId] = { tone: 'success', message };
    toast.success(message);
  } catch (error) {
    const message = getAISettingErrorMessage(error, 'setting.ai.providerTestFailed');
    providerStatusMap.value[providerId] = { tone: 'error', message };
    toast.error(message);
  } finally {
    providerTestLoading.value[providerId] = false;
  }
}

async function handleRefreshModels(providerId: string) {
  providerRefreshLoading.value[providerId] = true;
  providerStatusMap.value[providerId] = null;
  try {
    const snapshot = await refreshProviderModels(providerId);
    providerStatusMap.value[providerId] = {
      tone: 'success',
      message: t('setting.ai.providerModelsRefreshed', {
        count: snapshot.models.length,
      }),
    };
    toast.success(t('setting.ai.providerModelsRefreshed', { count: snapshot.models.length }));
  } catch (error) {
    const message = getAISettingErrorMessage(error, 'setting.ai.providerModelsRefreshFailed');
    providerStatusMap.value[providerId] = { tone: 'error', message };
    toast.error(message);
  } finally {
    providerRefreshLoading.value[providerId] = false;
  }
}

async function handleDeleteProvider(providerId: string) {
  try {
    await deleteProvider(providerId);
    toast.success(t('setting.ai.providerDeleted'));
  } catch (error) {
    toast.error(getAISettingErrorMessage(error, 'setting.ai.providerActionFailed'));
  }
}

function isRecommendedModel(modelId: string): boolean {
  return selectedCatalog.value?.recommendedModelIds.includes(modelId) ?? false;
}

function normalizeEndpointForCatalog(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

function providerGlyph(id: string): string {
  const glyphs: Record<string, string> = {
    openrouter: 'OR',
    openai: 'OA',
    gemini: 'G',
    deepseek: 'DS',
    custom: '{}',
  };
  return glyphs[id] ?? id.slice(0, 2).toUpperCase();
}

function stepClass(step: OnboardingStep): string {
  const order = flowSteps.value;
  return order.indexOf(onboardingStep.value) >= order.indexOf(step)
    ? 'flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground'
    : 'flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground';
}

function formatContext(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function formatPrice(value: number): string {
  if (value === 0) return '0';
  if (value < 0.01) return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
</script>
