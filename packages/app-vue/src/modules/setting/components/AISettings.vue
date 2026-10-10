<template>
  <section
    data-testid="ai-settings-panel"
    class="space-y-5"
    style="
      --primary: 237 61% 62%;
      --primary-foreground: 0 0% 100%;
      --color-primary: #6469da;
      --color-primary-foreground: #fff;
    "
  >
    <header class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <h2 class="text-sm font-semibold">Providers</h2>
        <Button
          size="icon"
          class="size-7 rounded-lg"
          data-testid="ai-provider-add"
          :aria-label="t('setting.ai.addProvider')"
          @click="openAgentWizard"
          ><Plus class="size-4"
        /></Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        :disabled="isCheckingProviders || isLoadingProviders || localBusy"
        data-testid="ai-provider-recheck"
        @click="handleRecheckProviders"
      >
        <RefreshCw class="mr-1.5 size-3.5" :class="{ 'animate-spin': isCheckingProviders }" />
        {{ t('setting.ai.recheckProviders') }}
      </Button>
    </header>
    <p
      v-if="(localError && !selectedLocal && !selectedSlotDriver) || registryError"
      role="alert"
      class="text-sm text-destructive"
    >
      {{
        registryError
          ? t('setting.agentInstances.instanceSaveError')
          : t('aiAssistant.local.actionFailed')
      }}
    </p>
    <div
      v-if="providerRows.length || selectedSlotDriver"
      class="grid min-h-[36rem] gap-4 lg:grid-cols-[268px_minmax(0,1fr)]"
    >
      <div
        class="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.3)] p-3"
        data-testid="ai-provider-list"
        role="list"
        :aria-label="t('setting.ai.providerList')"
      >
        <div
          v-for="provider in providerRows"
          :key="provider.id"
          role="listitem"
          class="mb-1 flex min-h-16 items-center gap-2 rounded-lg border px-3 py-2 last:mb-0"
          :class="
            String(provider.id) === selectedProviderId
              ? 'border-primary/60 bg-primary/15'
              : 'border-transparent hover:bg-muted'
          "
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            :aria-current="String(provider.id) === selectedProviderId ? 'true' : undefined"
            :data-testid="`ai-provider-select-${provider.id}`"
            @click="selectedProviderId = String(provider.id)"
          >
            <span
              class="flex size-5 shrink-0 items-center justify-center text-xs font-semibold text-primary"
              aria-hidden="true"
              :style="{ color: provider.accentColor }"
            >
              {{ providerGlyph(provider.providerDefinitionId) }}
            </span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium">{{ provider.name }}</span
              ><span class="block text-xs text-muted-foreground">{{
                provider.id.startsWith('local:') || provider.id.startsWith('slot:')
                  ? provider.providerDefinitionId
                  : 'Mastra'
              }}</span>
              <span class="mt-1 block truncate text-xs text-muted-foreground">
                {{
                  provider.id === 'mastra:default'
                    ? t('setting.agentInstances.needsConfig')
                    : provider.id.startsWith('agent:')
                      ? selectedMastraBindings.length && provider.id === selectedProviderId
                        ? t('setting.agentInstances.connectionReady')
                        : t('setting.agentInstances.needsConfig')
                      : provider.id.startsWith('slot:')
                        ? slotChecking[provider.id.slice(5)]
                          ? t('setting.ai.probing')
                          : slotStatuses[provider.id.slice(5)]
                            ? localStatusLabel(slotStatuses[provider.id.slice(5)]!)
                            : t('setting.agentInstances.unchecked')
                        : !provider.isActive
                          ? t('setting.ai.inactiveProvider')
                          : provider.id.startsWith('local:') && localStatuses[provider.id.slice(6)]
                            ? localStatusLabel(localStatuses[provider.id.slice(6)]!)
                            : provider.id.startsWith('local:')
                              ? t('setting.agentInstances.unchecked')
                              : provider.isDefault
                                ? t('setting.ai.defaultProvider')
                                : t('setting.ai.savedProvider')
                }}
              </span>
            </span>
          </button>
          <Switch
            v-if="
              !provider.id.startsWith('slot:') &&
              provider.id !== 'mastra:default' &&
              !(provider.id.startsWith('agent:') && provider.id === 'agent:mastra')
            "
            :model-value="provider.isActive"
            :disabled="localBusy || providerUpdateLoading[String(provider.id)] === true"
            :aria-label="t('setting.ai.enableProvider', { name: provider.name })"
            @update:model-value="toggleProviderRow(provider.id, $event)"
          />
        </div>
      </div>
      <div
        v-if="selectedMastraAgent"
        data-testid="ai-mastra-instance-detail"
        class="min-w-0 space-y-5 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.3)] p-5"
      >
        <header class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-base font-semibold">{{ selectedMastraAgent.name }}</h3>
            <p class="text-xs text-muted-foreground">
              Mastra · {{ selectedMastraAgent.instanceId }}
            </p>
          </div>
          <Badge variant="secondary">{{
            selectedMastraBindings.length
              ? t('setting.agentInstances.connectionReady')
              : t('setting.agentInstances.needsConfig')
          }}</Badge>
        </header>
        <div class="space-y-2">
          <Label for="ai-mastra-agent-name">{{ t('setting.ai.displayName') }}</Label>
          <Input id="ai-mastra-agent-name" v-model="mastraNameDraft" maxlength="120" />
          <Label for="ai-mastra-agent-id">{{ t('setting.agentInstances.instanceId') }}</Label>
          <Input id="ai-mastra-agent-id" :model-value="selectedMastraAgent.instanceId" readonly />
          <div class="flex items-center justify-between">
            <Button
              :disabled="registryBusy || !mastraNameDraft.trim()"
              data-testid="ai-mastra-instance-update"
              @click="updateMastra"
            >
              {{ t('setting.ai.saveConfiguration') }}
            </Button>
            <Button
              v-if="selectedMastraAgent.instanceId !== 'mastra'"
              variant="ghost"
              class="text-destructive"
              :disabled="registryBusy"
              @click="deleteMastra"
            >
              {{ t('setting.ai.deleteProvider') }}
            </Button>
          </div>
        </div>
        <div class="space-y-3 border-t border-[hsl(var(--border-subtle))] pt-4">
          <h4 class="text-sm font-semibold">{{ t('setting.agentInstances.modelServices') }}</h4>
          <p
            v-if="!selectedMastraBindings.length"
            data-testid="ai-mastra-needs-config"
            class="text-xs text-muted-foreground"
          >
            {{ t('setting.agentInstances.noBindings') }}
          </p>
          <div
            v-for="binding in selectedMastraBindings"
            :key="binding.connectionId"
            class="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-muted/50 p-3"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">
                {{
                  providerItems.find((item) => String(item.id) === binding.connectionId)?.name ??
                  binding.connectionId
                }}
              </p>
              <p class="truncate text-xs text-muted-foreground">{{ binding.modelId }}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              :disabled="registryBusy"
              :data-testid="'ai-mastra-replace-' + binding.connectionId"
              @click="replaceBoundMastraService(binding.connectionId)"
            >
              {{ t('setting.ai.replaceConnection') }}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              :disabled="registryBusy"
              :data-testid="'ai-mastra-unbind-' + binding.connectionId"
              @click="unbindMastra(binding.connectionId)"
            >
              {{ t('setting.agentInstances.removeBinding') }}
            </Button>
          </div>
          <div
            v-if="availableBindingConnections.length"
            class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          >
            <select
              v-model="bindingConnectionId"
              data-testid="ai-mastra-service-select"
              class="h-9 min-w-0 rounded-lg bg-muted/50 px-2 text-sm"
            >
              <option value="">{{ t('setting.agentInstances.bindExisting') }}</option>
              <option
                v-for="service in availableBindingConnections"
                :key="String(service.id)"
                :value="String(service.id)"
              >
                {{ service.name }}
              </option>
            </select>
            <select
              v-model="bindingModelId"
              data-testid="ai-mastra-model-select"
              class="h-9 min-w-0 rounded-lg bg-muted/50 px-2 text-sm"
              :disabled="!bindConnection"
            >
              <option v-if="!bindConnection" value="">Models</option>
              <option v-for="model in bindConnectionModels" :key="model.id" :value="model.id">
                {{ model.name || model.id }}
              </option>
            </select>
            <Button
              :disabled="registryBusy || !bindingConnectionId || !bindingModelId"
              data-testid="ai-mastra-bind-existing"
              @click="bindMastra(bindingConnectionId, bindingModelId)"
            >
              {{ t('setting.agentInstances.bindExisting') }}
            </Button>
          </div>
          <Button data-testid="ai-mastra-create-service" variant="outline" @click="openOnboarding">
            {{ t('setting.agentInstances.createService') }}
          </Button>
          <p class="text-xs text-muted-foreground">
            {{ t('setting.agentInstances.builtinDetail') }}
          </p>
        </div>
      </div>
      <div
        v-else-if="selectedProviderId === 'mastra:default'"
        data-testid="ai-provider-detail"
        class="rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.3)] p-5 space-y-5"
      >
        <h3 class="text-base font-semibold">Mastra</h3>
        <p role="status" data-testid="ai-mastra-needs-config" class="text-sm text-muted-foreground">
          {{ t('setting.agentInstances.needsConfig') }}
        </p>
        <p class="text-sm text-muted-foreground">
          {{ t('setting.agentInstances.builtinDetail') }}
        </p>
        <Button data-testid="ai-mastra-configure" @click="openOnboarding">{{
          t('setting.agentInstances.configure')
        }}</Button>
      </div>
      <LocalAgentSettings
        v-else-if="selectedLocal || selectedSlotDriver"
        :key="selectedLocal?.id ?? selectedSlotDriver ?? 'new-native'"
        :connection="selectedLocal"
        :driver="selectedLocal?.driver ?? selectedSlotDriver ?? 'codex'"
        :status="
          selectedLocal
            ? localStatuses[selectedLocal.id]
            : selectedSlotDriver
              ? slotStatuses[selectedSlotDriver]
              : undefined
        "
        :identity="selectedSlotIdentity"
        :can-probe="Boolean(selectedSlotDriver)"
        :busy="localBusy || Boolean(selectedSlotDriver && slotChecking[selectedSlotDriver])"
        :error="localError"
        @save="saveLocal"
        @check="
          selectedLocal
            ? checkLocal(selectedLocal)
            : selectedSlotDriver
              ? checkDefaultSlot(selectedSlotDriver)
              : undefined
        "
        @remove="removeLocal"
        @cancel="cancelNewLocal"
      />
      <div
        v-else-if="selectedProvider"
        :key="selectedProvider.id"
        data-testid="ai-provider-detail"
        class="flex min-w-0 flex-col rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.3)] p-5"
      >
        <header
          class="flex items-center justify-between gap-3 border-b border-[hsl(var(--border-subtle))] pb-4"
        >
          <div class="flex min-w-0 items-center gap-2.5">
            <span class="text-primary" aria-hidden="true">◆</span>
            <div>
              <h3 class="truncate text-base font-semibold">{{ selectedProvider.name }}</h3>
              <p class="text-xs text-muted-foreground">
                Mastra · {{ selectedProvider.providerDefinitionId }}
                {{ t('setting.agentInstances.serviceLabel') }}
              </p>
            </div>
          </div>
          <Badge v-if="selectedProvider.isDefault" variant="secondary">{{
            t('setting.ai.defaultProvider')
          }}</Badge>
        </header>
        <div class="mt-5 space-y-5">
          <div class="space-y-2">
            <Label for="ai-saved-provider-name">{{ t('setting.ai.displayName') }}</Label>
            <Input
              id="ai-saved-provider-name"
              v-model="providerNameDraft"
              :disabled="providerUpdateLoading[String(selectedProvider.id)] === true"
              maxlength="100"
              class="h-9 rounded-lg border-0 bg-muted/50 shadow-none"
            />
          </div>
          <div class="space-y-2">
            <Label for="ai-saved-instance-id">{{ t('setting.agentInstances.instanceId') }}</Label>
            <Input id="ai-saved-instance-id" :model-value="String(selectedProvider.id)" readonly />
          </div>
          <div class="space-y-2">
            <Label for="ai-saved-provider-url">API Base URL</Label>
            <Input
              id="ai-saved-provider-url"
              :model-value="selectedProvider.baseUrl"
              readonly
              class="h-9 rounded-lg border-0 bg-muted/50 shadow-none"
            />
          </div>
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <Label>API Key</Label>
              <Button
                variant="link"
                size="sm"
                class="h-auto p-0"
                :data-testid="`ai-provider-replace-${selectedProvider.id}`"
                @click="openProviderReplacement(selectedProvider)"
                >{{ t('setting.ai.replaceConnection') }}</Button
              >
            </div>
            <div
              class="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground"
              data-testid="ai-provider-credential-state"
            >
              {{ t('setting.ai.credentialConfigured') }}
            </div>
          </div>
          <div class="space-y-2" data-testid="ai-saved-provider-models">
            <div
              class="flex items-center justify-between gap-3 border-b border-[hsl(var(--border-subtle))] pb-2"
            >
              <h4 class="text-sm font-semibold">Models</h4>
              <Button
                variant="link"
                size="sm"
                class="h-auto p-0"
                :disabled="providerRefreshLoading[String(selectedProvider.id)] === true"
                @click="handleRefreshModels(String(selectedProvider.id))"
              >
                {{
                  providerRefreshLoading[String(selectedProvider.id)]
                    ? t('setting.ai.refreshingModels')
                    : t('setting.ai.refreshModels')
                }}
              </Button>
            </div>
            <div
              v-for="model in selectedProviderModels"
              :key="model.id"
              class="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-3 text-sm"
            >
              <Star
                class="size-3.5 shrink-0"
                :class="
                  model.id === selectedProvider.defaultModel
                    ? 'fill-primary text-primary'
                    : 'text-muted-foreground'
                "
              />
              <span class="min-w-0 flex-1 truncate">{{ model.name || model.id }}</span>
              <span
                v-if="model.id === selectedProvider.defaultModel"
                class="text-xs text-primary"
                >{{ t('setting.ai.defaultModelLabel') }}</span
              >
            </div>
            <p v-if="!selectedProviderModels.length" class="py-3 text-xs text-muted-foreground">
              {{ t('setting.ai.modelInventoryHint') }}
            </p>
          </div>
          <SettingsStatusBlock
            v-if="providerStatusMap[String(selectedProvider.id)]"
            :kind="
              providerStatusMap[String(selectedProvider.id)]?.tone === 'error' ? 'error' : 'success'
            "
            :description="providerStatusMap[String(selectedProvider.id)]?.message"
          />
        </div>
        <div class="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              class="text-destructive"
              @click="handleDeleteProvider(String(selectedProvider.id))"
              >{{ t('setting.ai.deleteProvider') }}</Button
            >
            <Button
              v-if="!selectedProvider.isDefault"
              variant="ghost"
              size="sm"
              @click="handleSetDefault(String(selectedProvider.id))"
              >{{ t('setting.ai.setDefaultProvider') }}</Button
            >
          </div>
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="providerTestLoading[String(selectedProvider.id)] === true"
              @click="handleTestProvider(String(selectedProvider.id))"
            >
              {{
                providerTestLoading[String(selectedProvider.id)]
                  ? t('setting.ai.testingProvider')
                  : t('setting.ai.testProvider')
              }}</Button
            >
            <Button
              size="sm"
              :disabled="
                !canSaveProviderName || providerUpdateLoading[String(selectedProvider.id)] === true
              "
              data-testid="ai-provider-save-metadata"
              @click="handleSaveProviderName"
              >{{ t('setting.ai.saveConfiguration') }}</Button
            >
          </div>
        </div>
      </div>
    </div>
    <SettingsStatusBlock
      v-else
      kind="info"
      :title="t('setting.ai.emptyTitle')"
      :description="t('setting.ai.emptyDescription')"
      test-id="ai-provider-empty"
    >
      <template #actions
        ><Button size="sm" @click="openOnboarding">{{
          t('setting.ai.addProvider')
        }}</Button></template
      >
    </SettingsStatusBlock>
  </section>

  <AgentInstanceWizard
    :open="agentWizardOpen"
    :native="Boolean(localClient)"
    :registry-enabled="Boolean(agentRegistryClient)"
    :catalog="providerCatalog"
    :existing-slugs="[
      ...localConnections.map((item) => item.instanceSlug ?? item.id),
      ...(registrySnapshot?.instances.map((item) => item.instanceId) ?? []),
    ]"
    :busy="localBusy || registryBusy"
    :error="localError || registryError"
    @close="agentWizardOpen = false"
    @save-local="createWizardLocal"
    @create-mastra="createWizardMastra"
    @configure-mastra="configureWizardMastra"
  />
  <Dialog v-if="onboardingOpen" :open="onboardingOpen" @update:open="handleDialogOpenChange">
    <SettingsDialogShell
      :title="onboardingTitle"
      :description="onboardingDescription"
      test-id="ai-provider-onboarding"
      size="wide"
      class="flex max-h-[88vh] min-h-0 flex-col overflow-hidden"
      body-class="min-h-0 flex-1 overflow-y-auto px-1"
    >
      <div class="mb-5 flex items-center gap-2 text-xs text-muted-foreground">
        <template v-for="(step, index) in flowSteps" :key="step">
          <span v-if="index > 0">—</span>
          <span :class="stepClass(step)">{{ index + 1 }}</span>
        </template>
      </div>

      <div class="min-h-0">
        <div v-if="onboardingStep === 'picker'" class="space-y-4">
          <div v-if="isLoadingCatalog" class="py-10 text-center text-sm text-muted-foreground">
            {{ t('setting.ai.loadingProviderCatalog') }}
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <button
              v-for="entry in providerCatalog"
              :key="entry.id"
              type="button"
              class="group rounded-xl bg-[hsl(var(--surface-raised)/0.38)] p-4 text-left shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.52)] transition-[background-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:bg-[hsl(var(--surface-raised)/0.72)] hover:shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.72),0_8px_22px_-18px_rgba(0,0,0,0.5)]"
              :data-testid="`ai-provider-catalog-${entry.id}`"
              @click="selectCatalogEntry(entry)"
            >
              <div class="flex items-start gap-3">
                <div
                  class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold"
                >
                  {{ providerGlyph(entry.id) }}
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="font-medium">{{ entry.name }}</p>
                    <Badge v-if="entry.id === 'custom'" variant="outline">{{
                      t('setting.ai.customBadge')
                    }}</Badge>
                  </div>
                  <p class="mt-1 text-sm text-muted-foreground">{{ entry.description }}</p>
                </div>
              </div>
            </button>
          </div>
          <p
            v-if="!isLoadingCatalog && !providerCatalog.length"
            class="py-8 text-center text-sm text-muted-foreground"
          >
            {{ t('setting.ai.noProviderMatches') }}
          </p>
        </div>

        <div v-else-if="onboardingStep === 'connection' && selectedCatalog" class="space-y-5">
          <div
            class="rounded-xl bg-[hsl(var(--surface-raised)/0.4)] p-4 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.52)]"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex size-10 items-center justify-center rounded-lg bg-muted text-sm font-semibold"
              >
                {{ providerGlyph(selectedCatalog.id) }}
              </div>
              <div>
                <p class="font-medium">{{ selectedCatalog.name }}</p>
                <p class="text-sm text-muted-foreground">{{ selectedCatalog.description }}</p>
              </div>
            </div>
          </div>

          <div
            v-if="selectedCatalog.id === 'custom' && onboardingMode === 'create'"
            class="space-y-2"
          >
            <Label for="ai-provider-name">{{ t('setting.ai.providerName') }}</Label>
            <Input
              id="ai-provider-name"
              v-model="connectionName"
              :placeholder="t('setting.ai.providerNamePlaceholder')"
            />
          </div>

          <div v-if="selectedCatalog.baseUrlEditable" class="space-y-2">
            <Label for="ai-provider-base-url">{{ t('setting.ai.baseUrl') }}</Label>
            <Input
              id="ai-provider-base-url"
              v-model="connectionBaseUrl"
              :placeholder="t('setting.ai.providerBaseUrlPlaceholder')"
            />
            <p class="text-xs text-muted-foreground">
              {{ t('setting.ai.customEndpointSecurityHint') }}
            </p>
          </div>
          <div v-else class="space-y-1">
            <Label>{{ t('setting.ai.endpoint') }}</Label>
            <p
              class="break-all rounded-lg bg-[hsl(var(--surface-raised)/0.42)] px-3 py-2 text-sm text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.5)]"
            >
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

        <div
          v-else-if="onboardingStep === 'model' && probeResult && selectedCatalog"
          class="space-y-4"
        >
          <div
            class="rounded-xl bg-[hsl(var(--surface-raised)/0.4)] px-4 py-3 text-sm shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.52)]"
          >
            <p class="font-medium">{{ t('setting.ai.connectionVerified') }}</p>
            <p class="mt-1 break-all text-xs text-muted-foreground">{{ probeResult.baseUrl }}</p>
          </div>

          <SettingsStatusBlock
            v-for="warning in probeResult.warnings"
            :key="warning"
            kind="info"
            :description="warning"
          />

          <template v-if="probeResult.models.length">
            <Input v-model="modelSearch" :placeholder="t('setting.ai.searchModels')" />
            <div
              class="max-h-[360px] space-y-2 overflow-y-auto pr-1"
              data-testid="ai-provider-model-list"
            >
              <button
                v-for="model in filteredModels"
                :key="model.id"
                type="button"
                class="w-full rounded-xl p-3 text-left shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.5)] transition-[background-color,box-shadow]"
                :class="
                  selectedModelId === model.id
                    ? 'bg-primary/[0.08] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.42)]'
                    : 'bg-[hsl(var(--surface-raised)/0.28)] hover:bg-[hsl(var(--hover)/0.72)]'
                "
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
                    :class="
                      selectedModelId === model.id ? 'border-[5px] border-primary' : 'border-border'
                    "
                  />
                </div>
                <div
                  v-if="
                    model.contextWindow ||
                    model.inputCostPer1M != null ||
                    model.outputCostPer1M != null
                  "
                  class="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground"
                >
                  <span v-if="model.contextWindow"
                    >{{ formatContext(model.contextWindow) }} context</span
                  >
                  <span v-if="model.inputCostPer1M != null"
                    >${{ formatPrice(model.inputCostPer1M) }}/1M in</span
                  >
                  <span v-if="model.outputCostPer1M != null"
                    >${{ formatPrice(model.outputCostPer1M) }}/1M out</span
                  >
                </div>
              </button>
            </div>
          </template>

          <div
            v-if="needsManualModel"
            class="space-y-2 rounded-xl bg-[hsl(var(--surface-raised)/0.24)] p-4 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.45)]"
          >
            <p class="font-medium">{{ t('setting.ai.manualModelTitle') }}</p>
            <p class="text-sm text-muted-foreground">
              {{ t('setting.ai.manualModelDescription') }}
            </p>
            <Input
              v-model="manualModelId"
              :placeholder="t('setting.ai.manualModelPlaceholder')"
              @input="handleManualModelInput"
            />
          </div>

          <div
            v-if="effectiveModelId"
            class="rounded-xl bg-[hsl(var(--surface-raised)/0.34)] p-4 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.5)]"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-xs text-muted-foreground">{{ t('setting.ai.selectedModel') }}</p>
                <p class="mt-1 break-all text-sm font-medium">{{ effectiveModelId }}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                :disabled="isTestingModel"
                @click="testSelectedModel"
              >
                {{
                  isTestingModel ? t('setting.ai.testingModel') : t('setting.ai.testSelectedModel')
                }}
              </Button>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">
              {{ t('setting.ai.modelTestCostHint') }}
            </p>
            <SettingsStatusBlock
              v-if="verifiedModelId === effectiveModelId"
              class="mt-2"
              kind="success"
              :description="t('setting.ai.modelTestPassed')"
            />
          </div>
        </div>

        <div
          v-else-if="onboardingStep === 'review' && probeResult && selectedCatalog"
          class="space-y-4"
        >
          <div
            class="divide-y divide-[hsl(var(--border-subtle))] rounded-xl bg-[hsl(var(--surface-raised)/0.3)] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.5)]"
          >
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr]">
              <span class="text-sm text-muted-foreground">{{ t('setting.ai.providerName') }}</span>
              <span class="text-sm font-medium">{{ connectionName }}</span>
            </div>
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr]">
              <span class="text-sm text-muted-foreground">{{ t('setting.ai.endpoint') }}</span>
              <span class="break-all text-sm">{{ probeResult.baseUrl }}</span>
            </div>
            <div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr]">
              <span class="text-sm text-muted-foreground">{{
                t('setting.ai.defaultModelLabel')
              }}</span>
              <span class="break-all text-sm font-medium">{{ effectiveModelId }}</span>
            </div>
          </div>

          <div
            v-if="onboardingMode === 'create'"
            class="flex items-center justify-between gap-4 rounded-xl bg-[hsl(var(--surface-raised)/0.3)] px-4 py-3 shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.5)]"
          >
            <div>
              <p class="text-sm font-medium">{{ t('setting.ai.markAsDefault') }}</p>
              <p class="text-xs text-muted-foreground">
                {{ t('setting.ai.markAsDefaultDescription') }}
              </p>
            </div>
            <Switch
              :model-value="isDefaultSelection"
              :aria-label="t('setting.ai.markAsDefault')"
              @update:model-value="isDefaultSelection = $event"
            />
          </div>
          <div
            v-else
            class="rounded-xl bg-[hsl(var(--surface-raised)/0.3)] px-4 py-3 text-sm text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.5)]"
            data-testid="ai-provider-replacement-preserved-metadata"
          >
            {{ t('setting.ai.replacementPreservesMetadata') }}
          </div>

          <p class="text-xs text-muted-foreground">
            {{
              onboardingMode === 'replace'
                ? t('setting.ai.replacementSecretHint')
                : t('setting.ai.reviewSecretHint')
            }}
          </p>
        </div>
      </div>

      <template #footer>
        <div class="flex w-full items-center justify-between gap-3">
          <Button
            v-if="onboardingStep !== flowSteps[0]"
            variant="ghost"
            :disabled="isBusy"
            @click="goBack"
          >
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
                  ? t(
                      onboardingMode === 'replace'
                        ? 'setting.ai.replacingProvider'
                        : 'setting.ai.savingProvider',
                    )
                  : t(
                      onboardingMode === 'replace'
                        ? 'setting.ai.replaceAndFinish'
                        : 'setting.ai.saveAndFinish',
                    )
              }}
            </Button>
          </div>
        </div>
      </template>
    </SettingsDialogShell>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import LocalAgentSettings from './LocalAgentSettings.vue';
import AgentInstanceWizard from './AgentInstanceWizard.vue';
import { AI_LOCAL_AGENT_KEY, AI_AGENT_REGISTRY_KEY } from '../../../di/keys';
import { Plus, RefreshCw, Star } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { Badge, Button, Dialog, Input, Label, Switch } from '@memoflow/ui-vue-shadcn';
import type {
  LocalAgentConnection,
  LocalAgentConnectionInput,
  LocalAgentDriver,
  LocalAgentStatus,
  AgentRegistrySnapshot,
  CreateAgentInstance,
  AIProviderCatalogEntryDTO,
  AIProviderConfigClientDTO,
  AIModelInfo,
  ProbeAIProviderConnectionRes,
} from '@memoflow/contracts/ai';
import { useAI } from '../../ai/composables/useAI';
import { SettingsDialogShell, SettingsStatusBlock } from '../../../components/shared/settings';
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
  updateProvider,
  setDefaultProvider,
  refreshProviderModels,
  testProvider,
} = useAI();

const onboardingOpen = ref(false);
const agentWizardOpen = ref(false);
const onboardingMode = ref<OnboardingMode>('create');
const replacementProvider = ref<AIProviderConfigClientDTO | null>(null);
const onboardingStep = ref<OnboardingStep>('picker');
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
const agentRegistryClient = inject(AI_AGENT_REGISTRY_KEY, undefined);
const registrySnapshot = ref<AgentRegistrySnapshot | null>(null);
const registryBusy = ref(false);
const registryError = ref(false);
const mastraNameDraft = ref('');
const bindingConnectionId = ref('');
const bindingModelId = ref('');
const selectedMastraAgent = computed(
  () =>
    registrySnapshot.value?.instances.find(
      (agent) =>
        agent.driver === 'mastra' && 'agent:' + agent.instanceId === selectedProviderId.value,
    ) ?? null,
);
const selectedMastraBindings = computed(
  () =>
    registrySnapshot.value?.bindings.filter(
      (binding) => binding.instanceId === selectedMastraAgent.value?.instanceId,
    ) ?? [],
);
const availableBindingConnections = computed(() =>
  providerItems.value.filter(
    (connection) =>
      connection.isActive &&
      !selectedMastraBindings.value.some(
        (binding) => binding.connectionId === String(connection.id),
      ),
  ),
);
watch(
  () => selectedMastraAgent.value?.instanceId,
  () => {
    mastraNameDraft.value = selectedMastraAgent.value?.name ?? '';
    bindingConnectionId.value = '';
    bindingModelId.value = '';
  },
);
async function loadAgentRegistry() {
  if (!agentRegistryClient) return;
  try {
    registrySnapshot.value = await agentRegistryClient.list();
    registryError.value = false;
  } catch {
    registryError.value = true;
  }
}
async function createWizardMastra(input: CreateAgentInstance) {
  if (!agentRegistryClient || registryBusy.value) return;
  registryBusy.value = true;
  registryError.value = false;
  try {
    await agentRegistryClient.execute({ action: 'create', instance: input });
    await loadAgentRegistry();
    if (registryError.value) return;
    selectedProviderId.value = 'agent:' + input.instanceId;
    agentWizardOpen.value = false;
    toast.success(t('setting.agentInstances.savedInstance'));
  } catch (cause) {
    registryError.value = true;
    toast.error(getAISettingErrorMessage(cause, 'setting.agentInstances.instanceSaveError'));
  } finally {
    registryBusy.value = false;
  }
}
async function updateMastra() {
  const agent = selectedMastraAgent.value;
  if (!agent || !agentRegistryClient || registryBusy.value) return;
  registryBusy.value = true;
  try {
    await agentRegistryClient.execute({
      action: 'update',
      instanceId: agent.instanceId,
      expectedRevision: agent.revision,
      patch: { name: mastraNameDraft.value.trim(), enabled: agent.enabled },
    });
    await loadAgentRegistry();
    toast.success(t('setting.ai.saveConfiguration'));
  } catch (cause) {
    toast.error(getAISettingErrorMessage(cause, 'setting.agentInstances.instanceSaveError'));
  } finally {
    registryBusy.value = false;
  }
}
async function deleteMastra() {
  const agent = selectedMastraAgent.value;
  if (!agent || !agentRegistryClient || registryBusy.value || agent.instanceId === 'mastra') return;
  registryBusy.value = true;
  try {
    await agentRegistryClient.execute({
      action: 'remove',
      instanceId: agent.instanceId,
      expectedRevision: agent.revision,
    });
    selectedProviderId.value = 'agent:mastra';
    await loadAgentRegistry();
  } catch (cause) {
    toast.error(getAISettingErrorMessage(cause, 'setting.agentInstances.instanceSaveError'));
  } finally {
    registryBusy.value = false;
  }
}
async function bindMastra(connectionId: string, modelId: string) {
  const agent = selectedMastraAgent.value;
  if (!agent || !agentRegistryClient || registryBusy.value || !connectionId || !modelId) return;
  registryBusy.value = true;
  try {
    await agentRegistryClient.execute({
      action: 'bind',
      instanceId: agent.instanceId,
      expectedRevision: agent.revision,
      connectionId,
      modelId,
    });
    await loadAgentRegistry();
  } catch (cause) {
    toast.error(getAISettingErrorMessage(cause, 'setting.agentInstances.instanceSaveError'));
  } finally {
    registryBusy.value = false;
  }
}
async function replaceBoundMastraService(connectionId: string) {
  const connection = providerItems.value.find((item) => String(item.id) === connectionId);
  if (!connection) return;
  await openProviderReplacement(connection);
}
async function unbindMastra(connectionId: string) {
  const agent = selectedMastraAgent.value;
  if (!agent || !agentRegistryClient || registryBusy.value) return;
  registryBusy.value = true;
  try {
    await agentRegistryClient.execute({
      action: 'unbind',
      instanceId: agent.instanceId,
      expectedRevision: agent.revision,
      connectionId,
    });
    await loadAgentRegistry();
  } catch (cause) {
    toast.error(getAISettingErrorMessage(cause, 'setting.agentInstances.instanceSaveError'));
  } finally {
    registryBusy.value = false;
  }
}
const bindConnection = computed(
  () => providerItems.value.find((item) => String(item.id) === bindingConnectionId.value) ?? null,
);
const bindConnectionModels = computed(() => {
  const connection = bindConnection.value;
  if (!connection) return [];
  const fetched = providerModels.value[String(connection.id)] ?? [];
  return fetched.length
    ? fetched
    : connection.defaultModel
      ? [{ id: connection.defaultModel, name: connection.defaultModel }]
      : [];
});
watch(bindConnection, (connection) => {
  bindingModelId.value = connection?.defaultModel ?? '';
});

const localClient = inject(AI_LOCAL_AGENT_KEY, undefined);
const localConnections = ref<LocalAgentConnection[]>([]);
const localStatuses = ref<Record<string, LocalAgentStatus>>({});
const slotStatuses = ref<Record<string, LocalAgentStatus>>({});
const slotChecking = ref<Record<string, boolean>>({});
const localBusy = ref(false);
const localError = ref(false);
const selectedProviderId = ref('');
const localDrivers = computed(() =>
  localClient
    ? [
        { id: 'codex' as const, name: 'Codex' },
        { id: 'claude' as const, name: 'Claude Code' },
        { id: 'pi' as const, name: 'Pi' },
        { id: 'dsh' as const, name: 'DeepSeek Harness (DSH)' },
      ]
    : [],
);
const defaultLocalSlots = computed(() =>
  localDrivers.value.filter(
    (driver) =>
      !localConnections.value.some(
        (connection) =>
          connection.driver === driver.id &&
          (!connection.instanceSlug ||
            connection.instanceSlug === driver.id ||
            connection.instanceSlug === `${driver.id}-default`),
      ),
  ),
);
const selectedSlotDriver = computed(
  () =>
    defaultLocalSlots.value.find((item) => `slot:${item.id}` === selectedProviderId.value)?.id ??
    null,
);
const providerRows = computed(() => [
  ...(agentRegistryClient
    ? (registrySnapshot.value?.instances.filter((item) => item.driver === 'mastra') ?? []).map(
        (item) => ({
          id: 'agent:' + item.instanceId,
          name: item.name,
          providerDefinitionId: 'mastra',
          isActive: item.enabled,
          isDefault: item.instanceId === 'mastra',
          accentColor: item.accentColor,
        }),
      )
    : providerItems.value.length
      ? providerItems.value.map((provider) => ({ ...provider, accentColor: undefined }))
      : [
          {
            id: 'mastra:default',
            name: 'Mastra',
            providerDefinitionId: 'mastra',
            isActive: true,
            isDefault: true,
            accentColor: undefined,
          },
        ]),
  ...defaultLocalSlots.value.map((driver) => ({
    id: `slot:${driver.id}`,
    name: driver.name,
    providerDefinitionId: driver.id,
    isActive: true,
    isDefault: false,
    accentColor: undefined,
  })),
  ...localConnections.value.map((connection) => ({
    id: `local:${connection.id}`,
    name: connection.name,
    providerDefinitionId: connection.driver,
    accentColor: connection.accentColor,
    isActive: connection.enabled,
    isDefault: false,
  })),
]);
const selectedLocal = computed(
  () =>
    localConnections.value.find(
      (connection) => `local:${connection.id}` === selectedProviderId.value,
    ) ?? null,
);
function localStatusLabel(status: LocalAgentStatus) {
  return status.status === 'ready'
    ? t('aiAssistant.local.ready', { count: status.models.length })
    : status.message;
}
async function localAction(work: () => Promise<void>) {
  if (localBusy.value) return;
  localBusy.value = true;
  localError.value = false;
  try {
    await work();
  } catch {
    localError.value = true;
  } finally {
    localBusy.value = false;
  }
}
async function loadLocalConnections() {
  if (localClient)
    await localAction(async () => {
      localConnections.value = await localClient.listConnections();
    });
}
/** Check an implicit, unsaved default with no native Connection/SQLite write. */
async function checkDefaultSlot(driver: LocalAgentDriver) {
  if (!localClient?.probeDefaultDriver || slotChecking.value[driver]) return;
  slotChecking.value[driver] = true;
  try {
    const status = await localClient.probeDefaultDriver(driver);
    if (defaultLocalSlots.value.some((slot) => slot.id === driver))
      slotStatuses.value[driver] = status;
  } catch {
    slotStatuses.value[driver] = {
      status: 'unavailable',
      message: t('aiAssistant.local.actionFailed'),
    };
  } finally {
    slotChecking.value[driver] = false;
  }
}

async function checkLocal(connection: LocalAgentConnection) {
  if (!localClient) return;
  await localAction(async () => {
    const status = await localClient.probeConnection(connection.id);
    // Configuration changes or removal invalidate the old catalog.
    if (
      localConnections.value.some(
        (item) => item.id === connection.id && item.revision === connection.revision,
      )
    )
      localStatuses.value[connection.id] = status;
  });
}
const selectedSlotIdentity = computed(() => {
  const driver = defaultLocalSlots.value.find(
    (item) => `slot:${item.id}` === selectedProviderId.value,
  );
  return driver ? { name: driver.name, instanceSlug: `${driver.id}-default` } : undefined;
});
async function openAgentWizard() {
  localError.value = false;
  agentWizardOpen.value = true;
  await ensureProviderCatalog();
}
async function configureWizardMastra(service: AIProviderCatalogEntryDTO, name: string) {
  agentWizardOpen.value = false;
  resetOnboarding();
  selectCatalogEntry(service);
  connectionName.value = name;
  onboardingOpen.value = true;
}
async function createWizardLocal(input: LocalAgentConnectionInput) {
  if (!localClient) return;
  await localAction(async () => {
    const saved = await localClient.saveConnection(input);
    localConnections.value = [...localConnections.value, saved];
    agentWizardOpen.value = false;
    selectedProviderId.value = `local:${saved.id}`;
  });
}
function cancelNewLocal() {
  selectedProviderId.value = String(providerRows.value[0]?.id ?? '');
}
async function saveLocal(input: LocalAgentConnectionInput) {
  if (!localClient) return;
  const selected = selectedLocal.value;
  const selection = selectedProviderId.value;
  await localAction(async () => {
    const saved = await localClient.saveConnection(input, selected?.id, selected?.revision);
    localConnections.value = selected
      ? localConnections.value.map((item) => (item.id === saved.id ? saved : item))
      : [...localConnections.value, saved];
    delete localStatuses.value[saved.id];
    if (selectedProviderId.value === selection) {
      selectedProviderId.value = `local:${saved.id}`;
    }
  });
}
async function removeLocal() {
  if (!localClient || !selectedLocal.value) return;
  const id = selectedLocal.value.id;
  await localAction(async () => {
    await localClient.deleteConnection(id);
    localConnections.value = localConnections.value.filter((item) => item.id !== id);
    delete localStatuses.value[id];
  });
}
async function toggleProviderRow(id: string, enabled: boolean) {
  if (id.startsWith('agent:')) {
    const current = registrySnapshot.value?.instances.find(
      (agent) => 'agent:' + agent.instanceId === id,
    );
    if (!current || !agentRegistryClient || registryBusy.value) return;
    registryBusy.value = true;
    try {
      await agentRegistryClient.execute({
        action: 'update',
        instanceId: current.instanceId,
        expectedRevision: current.revision,
        patch: { enabled },
      });
      await loadAgentRegistry();
    } catch (cause) {
      toast.error(getAISettingErrorMessage(cause, 'setting.agentInstances.instanceSaveError'));
    } finally {
      registryBusy.value = false;
    }
    return;
  }
  if (!id.startsWith('local:')) return handleToggleProvider(id, enabled);
  const connection = localConnections.value.find((item) => `local:${item.id}` === id);
  if (!connection || !localClient) return;
  await localAction(async () => {
    const { driver, name, executablePath, homePath, writeScopes, instanceSlug, accentColor } =
      connection;
    const saved = await localClient.saveConnection(
      { driver, name, executablePath, homePath, writeScopes, instanceSlug, accentColor, enabled },
      connection.id,
      connection.revision,
    );
    localConnections.value = localConnections.value.map((item) =>
      item.id === saved.id ? saved : item,
    );
    delete localStatuses.value[saved.id];
  });
}

const providerNameDraft = ref('');
const providerUpdateLoading = ref<Record<string, boolean>>({});
const providerModels = ref<Record<string, AIModelInfo[]>>({});
const isCheckingProviders = ref(false);
const selectedProvider = computed(
  () =>
    providerItems.value.find((provider) => String(provider.id) === selectedProviderId.value) ??
    null,
);
const selectedProviderModels = computed(() => {
  const provider = selectedProvider.value;
  if (!provider) return [];
  return (
    providerModels.value[String(provider.id)] ??
    (provider.defaultModel ? [{ id: provider.defaultModel, name: provider.defaultModel }] : [])
  );
});
const canSaveProviderName = computed(() => {
  const name = providerNameDraft.value.trim();
  return Boolean(selectedProvider.value && name && name !== selectedProvider.value.name);
});
watch(
  providerRows,
  (items) => {
    if (!items.some((provider) => String(provider.id) === selectedProviderId.value)) {
      selectedProviderId.value = String(items[0]?.id ?? '');
    }
  },
  { immediate: true },
);
watch([() => selectedProvider.value?.id, () => selectedProvider.value?.name], () => {
  providerNameDraft.value = selectedProvider.value?.name ?? '';
});

const isBusy = computed(() => isProbing.value || isTestingModel.value || isSaving.value);
const flowSteps = computed<OnboardingStep[]>(() =>
  onboardingMode.value === 'replace'
    ? ['connection', 'model', 'review']
    : ['picker', 'connection', 'model', 'review'],
);
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
    case 'picker':
      return t('setting.agentInstances.serviceTitle');
    case 'connection':
      return t(replacing ? 'setting.ai.replacementConnectionTitle' : 'setting.ai.connectionTitle');
    case 'model':
      return t('setting.ai.modelTitle');
    case 'review':
      return t(replacing ? 'setting.ai.replacementReviewTitle' : 'setting.ai.reviewTitle');
  }
  return '';
});
const onboardingDescription = computed(() => {
  const replacing = onboardingMode.value === 'replace';
  switch (onboardingStep.value) {
    case 'picker':
      return t('setting.agentInstances.serviceDescription');
    case 'connection':
      return t(
        replacing
          ? 'setting.ai.replacementConnectionDescription'
          : 'setting.ai.connectionDescription',
      );
    case 'model':
      return t(
        replacing ? 'setting.ai.replacementModelDescription' : 'setting.ai.modelDescription',
      );
    case 'review':
      return t(
        replacing ? 'setting.ai.replacementReviewDescription' : 'setting.ai.reviewDescription',
      );
  }
  return '';
});

onMounted(() => {
  void loadAgentRegistry();
  void loadLocalConnections().then(async () => {
    // Limit startup checks to two concurrent native CLI/SDK initializations.
    const slots = [...defaultLocalSlots.value];
    for (let i = 0; i < slots.length; i += 2)
      await Promise.allSettled(slots.slice(i, i + 2).map((slot) => checkDefaultSlot(slot.id)));
  });
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
  const entry =
    matchedPreset ?? providerCatalog.value.find((candidate) => candidate.id === 'custom');
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
      const replacementId = String(replacementProvider.value.id);
      await commitProviderReplacement(replacementId, {
        onboardingId: probeResult.value.onboardingId,
        defaultModelId: effectiveModelId.value,
      });
      delete providerModels.value[replacementId];
      providerStatusMap.value[replacementId] = null;
      toast.success(t('setting.ai.providerConnectionReplaced'));
    } else {
      const saved = await commitProviderOnboarding({
        onboardingId: probeResult.value.onboardingId,
        name: connectionName.value.trim(),
        defaultModelId: effectiveModelId.value,
        isDefault: isDefaultSelection.value,
      });
      if (agentRegistryClient && selectedMastraAgent.value) {
        const target = selectedMastraAgent.value;
        try {
          await agentRegistryClient.execute({
            action: 'bind',
            instanceId: target.instanceId,
            expectedRevision: target.revision,
            connectionId: String(saved.id),
            modelId: effectiveModelId.value,
          });
          await loadAgentRegistry();
          selectedProviderId.value = 'agent:' + target.instanceId;
        } catch (bindingError) {
          toast.error(
            getAISettingErrorMessage(bindingError, 'setting.agentInstances.instanceSaveError'),
          );
          // The model-service connection remains valid and can be bound manually.
        }
      } else {
        selectedProviderId.value = String(saved.id);
      }
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

async function handleRecheckProviders() {
  isCheckingProviders.value = true;
  try {
    await loadProviders();
    await loadAgentRegistry();
    await loadLocalConnections();
    await Promise.allSettled(defaultLocalSlots.value.map((slot) => checkDefaultSlot(slot.id)));
    for (const connection of localConnections.value.filter((item) => item.enabled)) {
      await checkLocal(connection);
    }
    // Catalog reads do not send paid inference prompts.
    for (const provider of providerItems.value.filter((item) => item.isActive)) {
      await handleRefreshModels(String(provider.id));
    }
  } catch (error) {
    toast.error(getAISettingErrorMessage(error, 'setting.ai.providerActionFailed'));
  } finally {
    isCheckingProviders.value = false;
  }
}

async function handleToggleProvider(providerId: string, isActive: boolean) {
  providerUpdateLoading.value[providerId] = true;
  try {
    await updateProvider(providerId, { isActive });
  } catch (error) {
    toast.error(getAISettingErrorMessage(error, 'setting.ai.providerActionFailed'));
  } finally {
    providerUpdateLoading.value[providerId] = false;
  }
}

async function handleSaveProviderName() {
  const providerId = selectedProviderId.value;
  if (!canSaveProviderName.value) return;
  const name = providerNameDraft.value.trim();
  providerUpdateLoading.value[providerId] = true;
  try {
    await updateProvider(providerId, { name });
    toast.success(t('setting.ai.configurationSaved'));
  } catch (error) {
    toast.error(getAISettingErrorMessage(error, 'setting.ai.providerActionFailed'));
  } finally {
    providerUpdateLoading.value[providerId] = false;
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
  const providerVersion = providerItems.value.find(
    (provider) => String(provider.id) === providerId,
  )?.version;
  providerRefreshLoading.value[providerId] = true;
  providerStatusMap.value[providerId] = null;
  try {
    const snapshot = await refreshProviderModels(providerId);
    if (
      providerItems.value.find((provider) => String(provider.id) === providerId)?.version !==
      providerVersion
    )
      return;
    providerModels.value[providerId] = snapshot.models;
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
    delete providerModels.value[providerId];
    delete providerStatusMap.value[providerId];
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
