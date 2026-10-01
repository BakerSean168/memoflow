<template>
  <div class="space-y-6" data-testid="knowledge-repository-settings">
    <SettingsSection
      :title="t('setting.knowledgeRepository.localTitle')"
      :description="t('setting.knowledgeRepository.localDescription')"
    >
      <SettingsObjectCard v-if="desktopBridge">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">
              {{
                localVaultBinding?.displayName ?? t('setting.knowledgeRepository.localNotSelected')
              }}
            </p>
            <p
              v-if="localVaultBinding"
              class="mt-1 truncate text-xs text-muted-foreground"
              :title="localVaultBinding.rootPath"
            >
              {{ localVaultBinding.rootPath }}
            </p>
            <p v-else class="mt-1 text-xs text-muted-foreground">
              {{ t('setting.knowledgeRepository.localNotSelectedHint') }}
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <Button variant="outline" :disabled="busy" @click="selectLocalVault">
              <FolderOpen class="mr-2 h-4 w-4" />
              {{
                localVaultBinding
                  ? t('setting.knowledgeRepository.localChange')
                  : t('setting.knowledgeRepository.localSelect')
              }}
            </Button>
            <Button
              v-if="localVaultBinding"
              variant="ghost"
              :disabled="busy"
              @click="detachLocalVault"
            >
              <Unplug class="mr-2 h-4 w-4" />
              {{ t('setting.knowledgeRepository.localDetach') }}
            </Button>
          </div>
        </div>
      </SettingsObjectCard>
      <SettingsStatusBlock
        v-else
        kind="info"
        :description="t('setting.knowledgeRepository.localDesktopOnly')"
      />
    </SettingsSection>

    <SettingsSection
      :title="t('setting.knowledgeRepository.githubTitle')"
      :description="t('setting.knowledgeRepository.githubDescription')"
    >
      <template #actions>
        <Button
          variant="ghost"
          size="icon"
          :aria-label="t('common.refresh')"
          :disabled="busy"
          @click="loadConnections"
        >
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': busyAction === 'load' }" />
        </Button>
      </template>

      <div class="space-y-4">
        <SettingsStatusBlock
          v-if="errorMessage"
          kind="error"
          :title="t('setting.knowledgeRepository.errorTitle')"
          :description="errorMessage"
        />

        <SettingsStatusBlock
          kind="info"
          :title="t('setting.knowledgeRepository.permissionTitle')"
          :description="t('setting.knowledgeRepository.permissionDescription')"
        />

        <div v-if="installationRepositories.length" class="space-y-3">
          <div>
            <h3 class="text-sm font-semibold">
              {{ t('setting.knowledgeRepository.chooseTitle') }}
            </h3>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ t('setting.knowledgeRepository.chooseDescription') }}
            </p>
          </div>
          <div class="divide-y rounded-md border">
            <div
              v-for="repository in installationRepositories"
              :key="repository.id"
              class="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"
            >
              <div class="min-w-0 flex-1">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="truncate text-sm font-medium">{{ repository.fullName }}</span>
                  <Badge :variant="repository.private ? 'secondary' : 'destructive'">
                    {{
                      repository.private
                        ? t('setting.knowledgeRepository.private')
                        : t('setting.knowledgeRepository.public')
                    }}
                  </Badge>
                </div>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ repository.defaultBranch }}
                </p>
              </div>
              <Button
                size="sm"
                :disabled="busy || !canConnect(repository)"
                @click="connectRepository(repository)"
              >
                <Loader2
                  v-if="busyAction === `connect:${repository.id}`"
                  class="mr-2 h-4 w-4 animate-spin"
                />
                <Link2 v-else class="mr-2 h-4 w-4" />
                {{ t('setting.knowledgeRepository.connect') }}
              </Button>
            </div>
          </div>
        </div>

        <div v-if="connections.length" class="space-y-3">
          <SettingsObjectCard
            v-for="connection in connections"
            :key="connection.id"
            class="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-2">
                <span class="truncate text-sm font-medium">
                  {{ repositoryDisplayName(connection) }}
                </span>
                <Badge :variant="providerState(connection) === 'Ready' ? 'secondary' : 'outline'">
                  {{ providerStateLabel(connection) }}
                </Badge>
              </div>
              <p class="mt-1 text-xs text-muted-foreground">
                {{
                  t('setting.knowledgeRepository.defaultBranch', {
                    branch: repositoryDefaultBranch(connection),
                  })
                }}
              </p>
              <p v-if="connection.historyFence" class="mt-1 text-xs text-muted-foreground">
                {{
                  t('setting.knowledgeRepository.lastConfirmedRemoteHead', {
                    sha: connection.historyFence!.lastConfirmedRemoteHeadSha.slice(0, 8),
                  })
                }}
              </p>
              <p v-if="connection.projectionCheckpoint" class="mt-1 text-xs text-muted-foreground">
                {{
                  t('setting.knowledgeRepository.projectionState', {
                    state: projectionStateLabel(connection),
                  })
                }}
              </p>
              <SettingsStatusBlock
                v-if="providerBlockReason(connection)"
                class="mt-2"
                kind="error"
                :description="providerDiagnostic(connection)"
                test-id="knowledge-repository-provider-diagnostic"
              />
              <SettingsStatusBlock
                v-if="syncCompleted[connection.id]"
                class="mt-2"
                kind="success"
                :description="
                  t(
                    `setting.knowledgeRepository.sync.outcome.${syncCompleted[connection.id]!.outcome}`,
                    { sha: syncCompleted[connection.id]!.headSha.slice(0, 8) },
                  )
                "
                test-id="knowledge-repository-sync-completed"
              />
              <SettingsStatusBlock
                v-else-if="reconciliationCompleted[connection.id]"
                class="mt-2"
                kind="success"
                :description="
                  t('setting.knowledgeRepository.reconciliation.completed', {
                    sha: reconciliationCompleted[connection.id]!.slice(0, 8),
                  })
                "
                test-id="reconciliation-completed"
              />
              <SettingsStatusBlock
                v-else-if="reconciliationPreviews[connection.id]"
                class="mt-2"
                kind="info"
                :description="
                  t(
                    `setting.knowledgeRepository.reconciliation.action.${reconciliationPreviews[connection.id]!.action}`,
                  )
                "
                test-id="reconciliation-preview"
              />
              <div
                v-if="syncConflicts[connection.id]"
                class="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs leading-5 text-destructive"
                data-testid="knowledge-repository-sync-conflict"
              >
                <p class="font-medium">{{ t('setting.knowledgeRepository.sync.conflictTitle') }}</p>
                <p>{{ t('setting.knowledgeRepository.sync.conflictDescription') }}</p>
                <p v-if="syncConflicts[connection.id]!.localHeadSha" class="mt-1">
                  {{
                    t('setting.knowledgeRepository.sync.conflictLocalHead', {
                      sha: syncConflicts[connection.id]!.localHeadSha!.slice(0, 8),
                    })
                  }}
                </p>
                <p v-if="syncConflicts[connection.id]!.remoteHeadSha">
                  {{
                    t('setting.knowledgeRepository.sync.conflictRemoteHead', {
                      sha: syncConflicts[connection.id]!.remoteHeadSha!.slice(0, 8),
                    })
                  }}
                </p>
                <ul
                  v-if="syncConflicts[connection.id]!.conflictingPaths.length"
                  class="mt-1 list-disc pl-4"
                >
                  <li
                    v-for="relativePath in syncConflicts[connection.id]!.conflictingPaths"
                    :key="relativePath"
                  >
                    {{ relativePath }}
                  </li>
                </ul>
                <Button
                  v-if="desktopBridge"
                  class="mt-2"
                  variant="outline"
                  size="sm"
                  :disabled="busy"
                  data-testid="knowledge-repository-open-conflict"
                  @click="openConflictInObsidian(connection.id)"
                >
                  <Loader2
                    v-if="busyAction === `open-conflict:${connection.id}`"
                    class="mr-2 h-4 w-4 animate-spin"
                  />
                  <ExternalLink v-else class="mr-2 h-4 w-4" />
                  {{ t('setting.knowledgeRepository.sync.openInObsidian') }}
                </Button>
              </div>
              <SettingsStatusBlock
                v-else-if="syncPending[connection.id]"
                class="mt-2"
                kind="info"
                :title="t('setting.knowledgeRepository.sync.pendingTitle')"
                :description="
                  t('setting.knowledgeRepository.sync.pendingDescription', {
                    sha: syncPending[connection.id]!.localHeadSha.slice(0, 8),
                  })
                "
                test-id="knowledge-repository-sync-pending"
              />
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <Button
                v-if="canSyncConnection(connection)"
                size="sm"
                :disabled="busy"
                @click="syncConnection(connection)"
              >
                <Loader2
                  v-if="busyAction === `sync:${connection.id}`"
                  class="mr-2 h-4 w-4 animate-spin"
                />
                <RefreshCw v-else class="mr-2 h-4 w-4" />
                {{
                  syncConflicts[connection.id] || syncPending[connection.id]
                    ? t('setting.knowledgeRepository.sync.retry')
                    : t('setting.knowledgeRepository.sync.execute')
                }}
              </Button>
              <Button
                v-if="canExecuteReconciliation(connection.id)"
                size="sm"
                :disabled="busy"
                @click="executeReconciliation(connection)"
              >
                <Loader2
                  v-if="busyAction === `execute:${connection.id}`"
                  class="mr-2 h-4 w-4 animate-spin"
                />
                <GitBranch v-else class="mr-2 h-4 w-4" />
                {{ t('setting.knowledgeRepository.reconciliation.execute') }}
              </Button>
              <Button
                v-if="desktopBridge && localVaultAvailable && !connection.historyFence"
                variant="outline"
                size="sm"
                :disabled="busy"
                @click="previewReconciliation(connection)"
              >
                <Loader2
                  v-if="busyAction === `preview:${connection.id}`"
                  class="mr-2 h-4 w-4 animate-spin"
                />
                <GitBranch v-else class="mr-2 h-4 w-4" />
                {{ t('setting.knowledgeRepository.reconciliation.preview') }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="busy"
                @click="refreshProviderObservation(connection)"
              >
                <Loader2
                  v-if="busyAction === `refresh-provider:${connection.id}`"
                  class="mr-2 h-4 w-4 animate-spin"
                />
                <RefreshCw v-else class="mr-2 h-4 w-4" />
                {{ t('setting.knowledgeRepository.refreshProvider') }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="busy"
                @click="openDisconnectDialog(connection)"
              >
                <Unplug class="mr-2 h-4 w-4" />
                {{ t('setting.knowledgeRepository.disconnect') }}
              </Button>
            </div>
          </SettingsObjectCard>
          <KnowledgeWriteRequestLedger />
        </div>

        <SettingsStatusBlock
          v-else-if="webInstallationPending"
          kind="info"
          :title="t('setting.knowledgeRepository.pendingAuthorizationTitle')"
          :description="t('setting.knowledgeRepository.pendingAuthorizationDescription')"
          test-id="knowledge-repository-installation-pending"
        />

        <SettingsStatusBlock
          v-else-if="!installationRepositories.length"
          kind="info"
          :title="t('setting.knowledgeRepository.notConnected')"
          :description="
            isGuest
              ? t('setting.knowledgeRepository.guestCloudBlocked')
              : !canUseCloudKnowledgeRepo
                ? t('setting.knowledgeRepository.offlineCloudBlocked')
                : desktopBridge
                  ? t('setting.knowledgeRepository.desktopConnectHint')
                  : t('setting.knowledgeRepository.webConnectHint')
          "
        />

        <div v-if="canUseCloudKnowledgeRepo" class="flex flex-wrap gap-2">
          <Button
            variant="outline"
            :disabled="busy"
            data-testid="github-repository-create"
            @click="createPrivateRepository"
          >
            <Loader2 v-if="busyAction === 'create'" class="mr-2 h-4 w-4 animate-spin" />
            <Plus v-else class="mr-2 h-4 w-4" />
            {{ t('setting.knowledgeRepository.createPrivate') }}
          </Button>
          <Button
            :disabled="busy"
            data-testid="github-repository-connect"
            @click="startInstallation"
          >
            <Loader2 v-if="busyAction === 'start'" class="mr-2 h-4 w-4 animate-spin" />
            <ExternalLink v-else class="mr-2 h-4 w-4" />
            {{
              webInstallationPending && !desktopBridge
                ? t('setting.knowledgeRepository.checkAuthorization')
                : connections.length
                  ? t('setting.knowledgeRepository.connectAnother')
                  : t('setting.knowledgeRepository.startConnect')
            }}
          </Button>
        </div>
      </div>
    </SettingsSection>

    <Dialog
      v-if="disconnectTarget"
      :open="disconnectDialogOpen"
      @update:open="setDisconnectDialogOpen"
    >
      <SettingsDialogShell
        :title="t('setting.knowledgeRepository.disconnectTitle')"
        :description="
          t('setting.knowledgeRepository.disconnectDescription', {
            repository: repositoryDisplayName(disconnectTarget),
          })
        "
        test-id="knowledge-repository-disconnect-dialog"
      >
        <SettingsObjectCard>
          <div class="flex items-start gap-3">
            <Checkbox
              id="purge-knowledge-repository-cloud-data"
              v-model="purgeCloudData"
              class="mt-0.5"
              data-testid="knowledge-repository-purge-cloud-data"
            />
            <div class="min-w-0">
              <Label for="purge-knowledge-repository-cloud-data" class="text-sm font-medium">
                {{ t('setting.knowledgeRepository.purgeCloudData') }}
              </Label>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {{ t('setting.knowledgeRepository.purgeCloudDataDescription') }}
              </p>
            </div>
          </div>
        </SettingsObjectCard>

        <p class="mt-3 text-xs leading-5 text-muted-foreground">
          {{
            purgeCloudData
              ? t('setting.knowledgeRepository.purgeLocalAndGithubPreserved')
              : t('setting.knowledgeRepository.retainCloudDataDescription')
          }}
        </p>

        <template #footer>
          <Button variant="outline" :disabled="busy" @click="setDisconnectDialogOpen(false)">
            {{ t('common.cancel') }}
          </Button>
          <Button
            variant="destructive"
            :disabled="busy"
            data-testid="knowledge-repository-confirm-disconnect"
            @click="confirmDisconnect"
          >
            <Loader2
              v-if="busyAction?.startsWith('disconnect:')"
              class="mr-2 h-4 w-4 animate-spin"
            />
            <Unplug v-else class="mr-2 h-4 w-4" />
            {{ t('setting.knowledgeRepository.disconnect') }}
          </Button>
        </template>
      </SettingsDialogShell>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ExternalLink,
  FolderOpen,
  GitBranch,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Unplug,
} from '@lucide/vue';
import { Badge, Button, Checkbox, Dialog, Label, useConfirm } from '@memoflow/ui-vue-shadcn';
import { SystemChannels } from '@memoflow/contracts/electron';
import type {
  GitHubInstallationRepositoryDTO,
  KnowledgeRemoteBindingClientDTO,
  KnowledgeRepositoryReconciliationPreview,
  LocalVaultBindingSnapshotDTO,
  KnowledgeRepositorySyncConflictContext,
  KnowledgeRepositorySyncOutcome,
  KnowledgeRepositorySyncPendingContext,
  RemoteRepositoryBlockReason,
} from '@memoflow/contracts/repository';
import {
  KnowledgeRepositorySyncConflictContextSchema,
  KnowledgeRepositorySyncPendingContextSchema,
} from '@memoflow/contracts/repository';
import { DESKTOP_BRIDGE_KEY, REPOSITORY_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { readDesktopAccessSnapshot } from '../../../shared/utils/desktop-profile-access';
import {
  SettingsDialogShell,
  SettingsObjectCard,
  SettingsSection,
  SettingsStatusBlock,
} from '../../../components/shared/settings';
import { KnowledgeWriteRequestLedger } from '../../repository/components';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const service = useStrictInject(REPOSITORY_SERVICE_KEY, 'RepositoryService');
const desktopBridge = inject(DESKTOP_BRIDGE_KEY, undefined);
const desktopApi =
  typeof window !== 'undefined' && 'electronAPI' in window
    ? (
        window as Window & {
          electronAPI: { invoke(channel: string, ...args: unknown[]): Promise<unknown> };
        }
      ).electronAPI
    : undefined;
const desktopAccess = ref<Awaited<ReturnType<typeof readDesktopAccessSnapshot>>>(null);
const desktopAccessLoaded = ref(desktopApi === undefined);
const canUseCloudKnowledgeRepo = computed(
  () =>
    desktopApi === undefined ||
    (desktopAccessLoaded.value && desktopAccess.value?.capabilities.repositoryConnection === true),
);
const isGuest = computed(() => desktopAccess.value?.profile?.profileKind === 'guest');

const connections = ref<KnowledgeRemoteBindingClientDTO[]>([]);
const installationRepositories = ref<GitHubInstallationRepositoryDTO[]>([]);
const pendingInstallationId = ref<string | null>(null);
const webInstallationPending = ref(false);
const localVaultBindingSnapshot = ref<LocalVaultBindingSnapshotDTO | null>(null);
const localVaultBinding = computed(() => localVaultBindingSnapshot.value?.binding ?? null);
const localVaultAvailable = computed(
  () => localVaultBindingSnapshot.value?.health.state === 'Available',
);
const reconciliationPreviews = ref<Record<string, KnowledgeRepositoryReconciliationPreview>>({});
const reconciliationCompleted = ref<Record<string, string>>({});
const syncCompleted = ref<
  Record<string, { outcome: KnowledgeRepositorySyncOutcome; headSha: string }>
>({});
const syncConflicts = ref<Record<string, KnowledgeRepositorySyncConflictContext>>({});
const syncPending = ref<Record<string, KnowledgeRepositorySyncPendingContext>>({});
const busyAction = ref<string | null>(null);
const errorMessage = ref('');
const disconnectTarget = ref<KnowledgeRemoteBindingClientDTO | null>(null);
const disconnectDialogOpen = ref(false);
const purgeCloudData = ref(false);
const busy = computed(() => busyAction.value !== null);
const GITHUB_NEW_PRIVATE_REPOSITORY_URL =
  'https://github.com/new?name=memory-flow-notes&visibility=private';
const INSTALLATION_POLL_INTERVAL_MS = 1_500;
const WEB_INSTALLATION_INTENT_SESSION_KEY = 'memoflow:knowledge-repository:web-installation-intent';
let installationPollGeneration = 0;

function rememberWebInstallationIntent(intentId: string): void {
  if (desktopBridge || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(WEB_INSTALLATION_INTENT_SESSION_KEY, intentId);
  } catch {
    // Session persistence is a resilience aid only; the callback query remains canonical.
  }
}

function readRememberedWebInstallationIntent(): string | null {
  if (desktopBridge || typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(WEB_INSTALLATION_INTENT_SESSION_KEY);
  } catch {
    return null;
  }
}

function clearRememberedWebInstallationIntent(intentId?: string): void {
  if (desktopBridge || typeof window === 'undefined') return;
  try {
    if (
      intentId &&
      window.sessionStorage.getItem(WEB_INSTALLATION_INTENT_SESSION_KEY) !== intentId
    ) {
      return;
    }
    window.sessionStorage.removeItem(WEB_INSTALLATION_INTENT_SESSION_KEY);
  } catch {
    // Ignore unavailable storage; server-side intent state remains authoritative.
  }
}

function queryValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function resultError(result: { error?: { message?: string } }, fallback: string): string {
  return result.error?.message ?? fallback;
}

function repositoryDisplayName(binding: KnowledgeRemoteBindingClientDTO): string {
  return binding.observation?.repositoryFullName ?? binding.repositoryFullNameSnapshot;
}

function repositoryDefaultBranch(binding: KnowledgeRemoteBindingClientDTO): string {
  return binding.observation?.defaultBranch ?? binding.historyFence?.defaultBranch ?? '—';
}

function providerState(
  binding: KnowledgeRemoteBindingClientDTO,
): 'Ready' | 'Blocked' | 'Unchecked' {
  return binding.observation?.eligibility.state ?? 'Unchecked';
}

function providerStateLabel(binding: KnowledgeRemoteBindingClientDTO): string {
  return t(`setting.knowledgeRepository.providerStatus.${providerState(binding)}`);
}

function projectionStateLabel(binding: KnowledgeRemoteBindingClientDTO): string {
  const state = binding.projectionCheckpoint?.state ?? 'Unknown';
  return t(`setting.knowledgeRepository.projectionStatus.${state}`);
}

function providerBlockReason(
  binding: KnowledgeRemoteBindingClientDTO,
): RemoteRepositoryBlockReason | null {
  return binding.observation?.eligibility.state === 'Blocked'
    ? binding.observation.eligibility.reason
    : null;
}

function providerDiagnostic(binding: KnowledgeRemoteBindingClientDTO): string {
  const reason = providerBlockReason(binding);
  return reason
    ? t(`setting.knowledgeRepository.providerBlockReason.${reason}`)
    : t('setting.knowledgeRepository.providerBlockReason.unknown');
}

async function loadConnections(): Promise<void> {
  if (!canUseCloudKnowledgeRepo.value) {
    connections.value = [];
    errorMessage.value = '';
    return;
  }
  busyAction.value = 'load';
  errorMessage.value = '';
  const result = await service.listKnowledgeRepositoryConnections();
  if (result.ok) {
    connections.value = result.data.connections;
  } else {
    connections.value = [];
    errorMessage.value = resultError(result, t('setting.knowledgeRepository.loadFailed'));
  }
  busyAction.value = null;
}

async function loadLocalVault(): Promise<void> {
  if (!desktopBridge) return;
  const result = await service.getLocalVaultBinding();
  if (result.ok) localVaultBindingSnapshot.value = result.data;
}

async function selectLocalVault(): Promise<void> {
  busyAction.value = 'local-vault';
  const result = await service.selectLocalVault();
  if (result.ok) {
    localVaultBindingSnapshot.value = result.data;
    errorMessage.value = '';
  } else {
    errorMessage.value = resultError(result, t('setting.knowledgeRepository.localSelectFailed'));
  }
  busyAction.value = null;
}

async function detachLocalVault(): Promise<void> {
  const confirmed = await useConfirm({
    title: t('setting.knowledgeRepository.localDetachTitle'),
    description: t('setting.knowledgeRepository.localDetachDescription'),
    confirmText: t('setting.knowledgeRepository.localDetach'),
    cancelText: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;

  busyAction.value = 'local-vault';
  const result = await service.detachLocalVault();
  if (result.ok) {
    localVaultBindingSnapshot.value = null;
    errorMessage.value = '';
  } else {
    errorMessage.value = resultError(result, t('setting.knowledgeRepository.localDetachFailed'));
  }
  busyAction.value = null;
}

async function startInstallation(): Promise<void> {
  if (!canUseCloudKnowledgeRepo.value) {
    errorMessage.value = isGuest.value
      ? t('setting.knowledgeRepository.guestCloudBlocked')
      : t('setting.knowledgeRepository.offlineCloudBlocked');
    return;
  }
  busyAction.value = 'start';
  errorMessage.value = '';
  const returnUrl = desktopBridge
    ? undefined
    : new URL(
        router.resolve({ path: '/settings', query: { tab: 'repository' } }).href,
        window.location.origin,
      ).toString();
  const result = await service.startKnowledgeRepositoryInstallation({
    returnUrl,
    clientKind: desktopBridge ? 'desktop' : 'web',
  });
  if (!result.ok) {
    errorMessage.value = resultError(result, t('setting.knowledgeRepository.startFailed'));
    busyAction.value = null;
    return;
  }

  if (!desktopBridge) {
    rememberWebInstallationIntent(result.data.intentId);
    if (result.data.requiresExternalBrowser === false) {
      webInstallationPending.value = false;
      await applyFinalizedInstallationIntent(result.data.intentId);
      busyAction.value = null;
      return;
    }
    webInstallationPending.value = true;
  }

  if (desktopBridge) {
    if (result.data.requiresExternalBrowser !== false) {
      try {
        await desktopBridge.invoke(SystemChannels.OPEN_EXTERNAL_URL, {
          url: result.data.installationUrl,
        });
      } catch {
        errorMessage.value = t('setting.knowledgeRepository.startFailed');
        busyAction.value = null;
        return;
      }
    }
    void pollDesktopInstallationIntent(result.data.intentId, result.data.expiresAt);
    return;
  }

  window.location.assign(result.data.installationUrl);
}

async function applyFinalizedInstallationIntent(intentId: string): Promise<boolean> {
  const result = await service.finalizeKnowledgeRepositoryInstallationIntent(intentId);
  if (!result.ok) {
    errorMessage.value = resultError(result, t('setting.knowledgeRepository.completeFailed'));
    return false;
  }
  pendingInstallationId.value = result.data.installationId;
  installationRepositories.value = result.data.repositories;
  webInstallationPending.value = false;
  errorMessage.value = '';
  return true;
}

async function pollDesktopInstallationIntent(intentId: string, expiresAt: number): Promise<void> {
  const generation = ++installationPollGeneration;
  busyAction.value = 'complete';
  while (generation === installationPollGeneration && Date.now() < expiresAt) {
    const result = await service.getKnowledgeRepositoryInstallationIntentStatus(intentId);
    if (generation !== installationPollGeneration) return;
    if (result.ok) {
      if (result.data.status === 'CallbackReceived' || result.data.status === 'Finalized') {
        await applyFinalizedInstallationIntent(intentId);
        if (generation === installationPollGeneration) busyAction.value = null;
        return;
      }
      if (result.data.status === 'Consumed') {
        await loadConnections();
        if (generation === installationPollGeneration) busyAction.value = null;
        return;
      }
      if (result.data.status === 'Expired') break;
    } else if (!['SERVICE_UNAVAILABLE', 'RATE_LIMITED'].includes(result.error.code)) {
      errorMessage.value = resultError(result, t('setting.knowledgeRepository.completeFailed'));
      busyAction.value = null;
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, INSTALLATION_POLL_INTERVAL_MS));
  }
  if (generation === installationPollGeneration) {
    errorMessage.value = t('setting.knowledgeRepository.installationExpired');
    busyAction.value = null;
  }
}

async function createPrivateRepository(): Promise<void> {
  if (!canUseCloudKnowledgeRepo.value) {
    errorMessage.value = isGuest.value
      ? t('setting.knowledgeRepository.guestCloudBlocked')
      : t('setting.knowledgeRepository.offlineCloudBlocked');
    return;
  }
  busyAction.value = 'create';
  errorMessage.value = '';
  try {
    if (desktopBridge) {
      await desktopBridge.invoke(SystemChannels.OPEN_EXTERNAL_URL, {
        url: GITHUB_NEW_PRIVATE_REPOSITORY_URL,
      });
    } else {
      const opened = window.open(
        GITHUB_NEW_PRIVATE_REPOSITORY_URL,
        '_blank',
        'noopener,noreferrer',
      );
      if (!opened) throw new Error('GitHub repository creation window was blocked');
    }
  } catch {
    errorMessage.value = t('setting.knowledgeRepository.createOpenFailed');
  }
  busyAction.value = null;
}

async function restoreRememberedWebInstallation(): Promise<void> {
  const intentId = readRememberedWebInstallationIntent();
  if (!intentId || installationRepositories.value.length > 0) return;

  const status = await service.getKnowledgeRepositoryInstallationIntentStatus(intentId);
  if (!status.ok) {
    if (['NOT_FOUND', 'VALIDATION_ERROR'].includes(status.error.code)) {
      clearRememberedWebInstallationIntent(intentId);
    }
    return;
  }

  if (status.data.status === 'CallbackReceived' || status.data.status === 'Finalized') {
    webInstallationPending.value = false;
    busyAction.value = 'complete';
    await applyFinalizedInstallationIntent(intentId);
    busyAction.value = null;
    return;
  }

  if (status.data.status === 'Consumed') {
    webInstallationPending.value = false;
    clearRememberedWebInstallationIntent(intentId);
    await loadConnections();
    return;
  }

  if (status.data.status === 'Expired') {
    webInstallationPending.value = false;
    clearRememberedWebInstallationIntent(intentId);
    return;
  }

  webInstallationPending.value = status.data.status === 'Pending';
}

async function completeInstallationFromQuery(): Promise<void> {
  const intentId = queryValue(route.query.installation_intent);
  const state = queryValue(route.query.state);
  const installationId = queryValue(route.query.installation_id);
  const setupAction = queryValue(route.query.setup_action);
  if (!intentId && (!state || !installationId)) return;
  if (!canUseCloudKnowledgeRepo.value) {
    errorMessage.value = isGuest.value
      ? t('setting.knowledgeRepository.guestCloudBlocked')
      : t('setting.knowledgeRepository.offlineCloudBlocked');
    return;
  }

  busyAction.value = 'complete';
  let completed = false;
  if (intentId) {
    rememberWebInstallationIntent(intentId);
    const status = await service.getKnowledgeRepositoryInstallationIntentStatus(intentId);
    if (status.ok && ['CallbackReceived', 'Finalized'].includes(status.data.status)) {
      webInstallationPending.value = false;
      completed = await applyFinalizedInstallationIntent(intentId);
    } else if (status.ok && status.data.status === 'Consumed') {
      webInstallationPending.value = false;
      clearRememberedWebInstallationIntent(intentId);
      await loadConnections();
      completed = true;
    } else if (status.ok && status.data.status === 'Expired') {
      webInstallationPending.value = false;
      clearRememberedWebInstallationIntent(intentId);
      errorMessage.value = t('setting.knowledgeRepository.installationExpired');
    } else {
      webInstallationPending.value = status.ok && status.data.status === 'Pending';
      errorMessage.value = status.ok
        ? t('setting.knowledgeRepository.installationPending')
        : resultError(status, t('setting.knowledgeRepository.completeFailed'));
    }
  } else if (state && installationId) {
    const result = await service.completeKnowledgeRepositoryInstallation({
      state,
      installationId,
      setupAction: setupAction === 'update' ? 'update' : 'install',
    });
    if (result.ok) {
      pendingInstallationId.value = result.data.installationId;
      installationRepositories.value = result.data.repositories;
      errorMessage.value = '';
      completed = true;
    } else {
      errorMessage.value = resultError(result, t('setting.knowledgeRepository.completeFailed'));
    }
  }

  await router.replace({
    query: Object.fromEntries(
      Object.entries(route.query).filter(
        ([key]) =>
          !['installation_intent', 'state', 'installation_id', 'setup_action'].includes(key),
      ),
    ),
  });
  if (!completed && !errorMessage.value) {
    errorMessage.value = t('setting.knowledgeRepository.completeFailed');
  }
  busyAction.value = null;
}

function canConnect(repository: GitHubInstallationRepositoryDTO): boolean {
  return (
    repository.private &&
    !repository.archived &&
    !repository.disabled &&
    repository.permissions.push
  );
}

async function connectRepository(repository: GitHubInstallationRepositoryDTO): Promise<void> {
  if (!pendingInstallationId.value || !canConnect(repository)) return;
  if (!canUseCloudKnowledgeRepo.value) {
    errorMessage.value = isGuest.value
      ? t('setting.knowledgeRepository.guestCloudBlocked')
      : t('setting.knowledgeRepository.offlineCloudBlocked');
    return;
  }
  if (desktopBridge && !localVaultBinding.value) {
    errorMessage.value = t('setting.knowledgeRepository.localRequiredBeforeConnect');
    return;
  }
  busyAction.value = `connect:${repository.id}`;
  const result = await service.connectKnowledgeRepository({
    installationId: pendingInstallationId.value,
    githubRepositoryId: repository.id,
    ...(desktopBridge && localVaultBinding.value
      ? { knowledgeSpaceId: localVaultBinding.value.knowledgeSpaceId }
      : {}),
  });
  if (result.ok) {
    installationRepositories.value = [];
    pendingInstallationId.value = null;
    webInstallationPending.value = false;
    clearRememberedWebInstallationIntent();
    await loadConnections();
  } else {
    errorMessage.value = resultError(result, t('setting.knowledgeRepository.connectFailed'));
    busyAction.value = null;
  }
}

function openDisconnectDialog(connection: KnowledgeRemoteBindingClientDTO): void {
  disconnectTarget.value = connection;
  purgeCloudData.value = false;
  disconnectDialogOpen.value = true;
}

function setDisconnectDialogOpen(open: boolean): void {
  disconnectDialogOpen.value = open;
  if (!open && !busyAction.value?.startsWith('disconnect:')) {
    disconnectTarget.value = null;
    purgeCloudData.value = false;
  }
}

async function confirmDisconnect(): Promise<void> {
  const connection = disconnectTarget.value;
  if (!connection) return;

  busyAction.value = `disconnect:${connection.id}`;
  const result = await service.disconnectKnowledgeRepository(connection.id, purgeCloudData.value);
  if (result.ok) {
    disconnectDialogOpen.value = false;
    disconnectTarget.value = null;
    purgeCloudData.value = false;
    await loadConnections();
  } else {
    errorMessage.value = resultError(result, t('setting.knowledgeRepository.disconnectFailed'));
    busyAction.value = null;
  }
}

async function previewReconciliation(connection: KnowledgeRemoteBindingClientDTO): Promise<void> {
  busyAction.value = `preview:${connection.id}`;
  errorMessage.value = '';
  const result = await service.previewKnowledgeRepositoryReconciliation(connection.id);
  if (result.ok) {
    reconciliationPreviews.value = {
      ...reconciliationPreviews.value,
      [connection.id]: result.data,
    };
  } else {
    errorMessage.value = resultError(
      result,
      t('setting.knowledgeRepository.reconciliation.previewFailed'),
    );
  }
  busyAction.value = null;
}

function canExecuteReconciliation(connectionId: string): boolean {
  const preview = reconciliationPreviews.value[connectionId];
  return Boolean(preview && preview.action !== 'ManualResolutionRequired');
}

async function refreshProviderObservation(
  connection: KnowledgeRemoteBindingClientDTO,
): Promise<void> {
  busyAction.value = `refresh-provider:${connection.id}`;
  errorMessage.value = '';
  const result = await service.refreshKnowledgeRepositoryObservation(connection.id);
  if (result.ok) {
    connections.value = connections.value.map((candidate) =>
      candidate.id === connection.id ? result.data : candidate,
    );
  } else {
    errorMessage.value = resultError(
      result,
      t('setting.knowledgeRepository.refreshProviderFailed'),
    );
  }
  busyAction.value = null;
}

function canSyncConnection(connection: KnowledgeRemoteBindingClientDTO): boolean {
  return Boolean(
    desktopBridge &&
    localVaultAvailable.value &&
    localVaultBinding.value &&
    connection.disconnectedAt === null &&
    connection.knowledgeSpaceId === localVaultBinding.value.knowledgeSpaceId &&
    connection.observation?.eligibility.state === 'Ready' &&
    connection.historyFence &&
    connection.observation.defaultBranch === connection.historyFence.defaultBranch,
  );
}

async function syncConnection(connection: KnowledgeRemoteBindingClientDTO): Promise<void> {
  if (!canSyncConnection(connection)) return;
  busyAction.value = `sync:${connection.id}`;
  errorMessage.value = '';
  const nextReconciliationCompleted = { ...reconciliationCompleted.value };
  delete nextReconciliationCompleted[connection.id];
  reconciliationCompleted.value = nextReconciliationCompleted;
  const result = await service.syncKnowledgeRepository({ connectionId: connection.id });
  if (result.ok) {
    connections.value = connections.value.map((candidate) =>
      candidate.id === connection.id ? result.data.connection : candidate,
    );
    syncCompleted.value = {
      ...syncCompleted.value,
      [connection.id]: { outcome: result.data.outcome, headSha: result.data.headSha },
    };
    const nextConflicts = { ...syncConflicts.value };
    delete nextConflicts[connection.id];
    syncConflicts.value = nextConflicts;
    const nextPending = { ...syncPending.value };
    delete nextPending[connection.id];
    syncPending.value = nextPending;
  } else {
    const nextCompleted = { ...syncCompleted.value };
    delete nextCompleted[connection.id];
    syncCompleted.value = nextCompleted;
    const conflict = KnowledgeRepositorySyncConflictContextSchema.safeParse(result.error.context);
    if (result.error.code === 'CONFLICT' && conflict.success) {
      syncConflicts.value = { ...syncConflicts.value, [connection.id]: conflict.data };
      const nextPending = { ...syncPending.value };
      delete nextPending[connection.id];
      syncPending.value = nextPending;
    }
    const pending = KnowledgeRepositorySyncPendingContextSchema.safeParse(result.error.context);
    if (pending.success) {
      syncPending.value = { ...syncPending.value, [connection.id]: pending.data };
      const nextConflicts = { ...syncConflicts.value };
      delete nextConflicts[connection.id];
      syncConflicts.value = nextConflicts;
    }
    errorMessage.value = resultError(result, t('setting.knowledgeRepository.sync.failed'));
  }
  busyAction.value = null;
}

async function openConflictInObsidian(connectionId: string): Promise<void> {
  if (!desktopBridge) return;
  const conflict = syncConflicts.value[connectionId];
  if (!conflict) return;

  busyAction.value = `open-conflict:${connectionId}`;
  errorMessage.value = '';
  const relativePath = conflict.conflictingPaths[0];
  const result = await service.openLocalVaultInObsidian(relativePath ? { relativePath } : {});
  if (!result.ok) {
    errorMessage.value = resultError(
      result,
      t('setting.knowledgeRepository.sync.openInObsidianFailed'),
    );
  }
  busyAction.value = null;
}

async function executeReconciliation(connection: KnowledgeRemoteBindingClientDTO): Promise<void> {
  const preview = reconciliationPreviews.value[connection.id];
  if (!preview || preview.action === 'ManualResolutionRequired') return;
  const confirmed = await useConfirm({
    title: t('setting.knowledgeRepository.reconciliation.executeTitle'),
    description: t('setting.knowledgeRepository.reconciliation.executeDescription', {
      action: t(`setting.knowledgeRepository.reconciliation.action.${preview.action}`),
    }),
    confirmText: t('setting.knowledgeRepository.reconciliation.execute'),
    cancelText: t('common.cancel'),
  });
  if (!confirmed) return;

  busyAction.value = `execute:${connection.id}`;
  errorMessage.value = '';
  const result = await service.executeKnowledgeRepositoryReconciliation({
    connectionId: connection.id,
    expectedAction: preview.action,
    expectedDefaultBranch: preview.defaultBranch,
    expectedRemoteHeadSha: preview.remoteHeadSha,
  });
  if (result.ok) {
    connections.value = connections.value.map((candidate) =>
      candidate.id === connection.id ? result.data.connection : candidate,
    );
    reconciliationCompleted.value = {
      ...reconciliationCompleted.value,
      [connection.id]: result.data.headSha,
    };
    const nextPreviews = { ...reconciliationPreviews.value };
    delete nextPreviews[connection.id];
    reconciliationPreviews.value = nextPreviews;
  } else {
    errorMessage.value = resultError(
      result,
      t('setting.knowledgeRepository.reconciliation.executeFailed'),
    );
  }
  busyAction.value = null;
}

onBeforeUnmount(() => {
  installationPollGeneration += 1;
});

onMounted(async () => {
  if (desktopApi) {
    desktopAccess.value = await readDesktopAccessSnapshot(desktopApi);
    desktopAccessLoaded.value = true;
  }
  await Promise.all([loadConnections(), loadLocalVault()]);
  await completeInstallationFromQuery();
  await restoreRememberedWebInstallation();
});
</script>
