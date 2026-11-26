<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  LoaderCircle,
  RefreshCw,
  RotateCw,
} from '@lucide/vue';
import { Badge, Button, Progress } from '@memoflow/ui-vue-shadcn';
import type {
  DesktopUpdateDiagnosticsDTO,
  DesktopUpdateSnapshotDTO,
} from '@memoflow/desktop-contracts';
import { formatLocaleMediumDateTime } from '@memoflow/time';
import { settingUiHost } from '../setting-ui-host';
import { presentDesktopUpdateSettings } from './desktop-update-settings.presentation';

const { t, locale } = useI18n();
const updateService = settingUiHost.useStrictInject(
  settingUiHost.DESKTOP_UPDATE_SERVICE_KEY,
  'DesktopUpdateService',
);
const { ReleaseNotes } = settingUiHost.components;

const snapshot = ref<DesktopUpdateSnapshotDTO | null>(null);
const diagnostics = ref<DesktopUpdateDiagnosticsDTO | null>(null);
const diagnosticsUnavailable = ref(false);
const transportError = ref<string | null>(null);
const actionPending = ref(false);
const explicitUpToDate = ref(false);
let unsubscribe: (() => void) | null = null;

const presentation = computed(() =>
  presentDesktopUpdateSettings(snapshot.value, explicitUpToDate.value),
);

const currentVersion = computed(() => snapshot.value?.currentVersion ?? '—');
const channelLabel = computed(() =>
  snapshot.value ? t(`setting.updates.channel.${snapshot.value.channel}`) : '—',
);
const ownerLabel = computed(() =>
  snapshot.value ? t(`setting.updates.owner.${snapshot.value.owner}`) : '—',
);

const statusIcon = computed(() => {
  switch (presentation.value.kind) {
    case 'up-to-date':
    case 'ready':
      return CheckCircle2;
    case 'downloading':
    case 'available':
    case 'preparing':
      return Download;
    case 'checking':
    case 'loading':
    case 'restarting':
      return LoaderCircle;
    case 'failed':
    case 'disabled':
      return AlertTriangle;
    default:
      return RefreshCw;
  }
});

const statusIconClass = computed(() =>
  presentation.value.kind === 'failed'
    ? 'text-destructive'
    : presentation.value.kind === 'ready' || presentation.value.kind === 'up-to-date'
      ? 'text-primary'
      : 'text-muted-foreground',
);

const isAnimatedIcon = computed(() =>
  ['loading', 'checking', 'restarting'].includes(presentation.value.kind),
);

const downloadDetails = computed(() => {
  const state = snapshot.value?.state;
  if (!state || state.type !== 'downloading') return null;
  return t('setting.updates.downloadProgress', {
    transferred: formatBytes(state.progress.transferredBytes),
    total: formatBytes(state.progress.totalBytes),
    speed: formatBytes(state.progress.bytesPerSecond),
  });
});

const failureMessage = computed(() => {
  const state = snapshot.value?.state;
  return state?.type === 'failed' ? state.failure.message : null;
});

const lastCheckedAt = computed(() => {
  const state = snapshot.value?.state;
  if (!state || state.type !== 'idle' || !state.lastCheckedAt) return null;

  try {
    return formatLocaleMediumDateTime(new Date(state.lastCheckedAt), locale.value);
  } catch {
    return state.lastCheckedAt;
  }
});

/** The troubleshooting card keeps raw updater enums out of its main copy: the
 * summary uses localized state words, and the untouched values live behind the
 * collapsible diagnostic detail for support. */
const diagnosticsLastCheckedAt = computed(() => {
  const value = diagnostics.value?.lastCheckedAt;
  if (!value) return null;

  try {
    return formatLocaleMediumDateTime(new Date(value), locale.value);
  } catch {
    return value;
  }
});

const diagnosticsStateLabel = computed(() =>
  diagnostics.value
    ? t(`setting.updates.troubleshooting.stateValue.${diagnostics.value.state}`)
    : '—',
);

const diagnosticsLastCheckResultLabel = computed(() =>
  diagnostics.value?.lastCheckResult
    ? t(`setting.updates.troubleshooting.lastCheckResultValue.${diagnostics.value.lastCheckResult}`)
    : '—',
);

const diagnosticsReceiptLabel = computed(() =>
  diagnostics.value
    ? t(`setting.updates.troubleshooting.receiptValue.${diagnostics.value.installReceipt.status}`)
    : '—',
);

const diagnosticsFailureSummary = computed(() => {
  const failure = diagnostics.value?.failure;
  if (!failure) return null;

  return t('setting.updates.troubleshooting.failureSummary', {
    operation: t(`setting.updates.troubleshooting.failureOperationValue.${failure.operation}`),
    code: t(`setting.updates.troubleshooting.failureCodeValue.${failure.code}`),
  });
});

const rawDiagnosticsText = computed(() => {
  const current = diagnostics.value;
  if (!current) return '';

  const failure = current.failure;
  return [
    `currentVersion: ${current.currentVersion}`,
    `targetVersion: ${current.targetVersion ?? 'none'}`,
    `state: ${current.state}`,
    `feedClass: ${current.feedClass}`,
    `lastCheckedAt: ${current.lastCheckedAt ?? 'none'}`,
    `lastCheckResult: ${current.lastCheckResult ?? 'none'}`,
    `installReceipt: ${current.installReceipt.status}`,
    failure
      ? `failure: ${failure.operation} · ${failure.code} (retryable: ${failure.retryable})`
      : 'failure: none',
  ].join('\n');
});

const diagnosticsCopied = ref(false);
let diagnosticsCopiedTimer: ReturnType<typeof setTimeout> | null = null;

function clearDiagnosticsCopiedTimer(): void {
  if (diagnosticsCopiedTimer) {
    clearTimeout(diagnosticsCopiedTimer);
    diagnosticsCopiedTimer = null;
  }
}

async function copyDiagnostics(): Promise<void> {
  const text = rawDiagnosticsText.value;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    diagnosticsCopied.value = false;
    return;
  }
  diagnosticsCopied.value = true;
  clearDiagnosticsCopiedTimer();
  diagnosticsCopiedTimer = setTimeout(() => {
    diagnosticsCopied.value = false;
    diagnosticsCopiedTimer = null;
  }, 2000);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'] as const;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value)} ${units[exponent]}`;
}

function adoptSnapshot(next: DesktopUpdateSnapshotDTO): void {
  snapshot.value = next;
}

async function loadSnapshot(): Promise<void> {
  transportError.value = null;
  const result = await updateService.getSnapshot();
  if (result.ok) {
    adoptSnapshot(result.data);
    return;
  }
  transportError.value = result.error.message;
}

async function loadDiagnostics(): Promise<void> {
  const result = await updateService.getDiagnostics();
  diagnosticsUnavailable.value = !result.ok;
  diagnostics.value = result.ok ? result.data : null;
}

async function checkForUpdates(): Promise<void> {
  if (actionPending.value) return;
  actionPending.value = true;
  transportError.value = null;
  explicitUpToDate.value = false;

  try {
    const result = await updateService.check();
    if (!result.ok) {
      transportError.value = result.error.message;
      return;
    }

    adoptSnapshot(result.data);
    explicitUpToDate.value =
      result.data.state.type === 'idle' && result.data.state.lastOutcome === 'up-to-date';
  } finally {
    actionPending.value = false;
    await loadDiagnostics();
  }
}

async function restartAndUpdate(): Promise<void> {
  if (actionPending.value) return;
  actionPending.value = true;
  transportError.value = null;

  try {
    const result = await updateService.restartAndInstall();
    if (!result.ok) {
      transportError.value = result.error.message;
      return;
    }

    adoptSnapshot(result.data);
  } finally {
    actionPending.value = false;
    await loadDiagnostics();
  }
}

function handlePrimaryAction(): void {
  if (presentation.value.action === 'restart') {
    void restartAndUpdate();
    return;
  }

  if (presentation.value.action === 'check') {
    void checkForUpdates();
  }
}

onMounted(() => {
  unsubscribe = updateService.subscribe((next) => {
    adoptSnapshot(next);
  });
  void loadSnapshot();
  void loadDiagnostics();
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribe = null;
  clearDiagnosticsCopiedTimer();
});
</script>

<template>
  <section class="space-y-6" data-testid="desktop-update-settings-section">
    <header class="space-y-1">
      <h2 class="text-xl font-semibold tracking-tight">{{ t('setting.updates.title') }}</h2>
    </header>

    <section class="space-y-6 border-b border-border pb-8">
      <header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <h3 class="text-lg font-semibold">MemoFlow</h3>
          </div>
        </div>
      </header>

      <div class="space-y-5">
        <dl class="grid gap-3 text-sm sm:grid-cols-3">
          <div class="space-y-1 py-2">
            <dt class="text-xs text-muted-foreground">{{ t('setting.updates.currentVersion') }}</dt>
            <dd class="mt-1 font-medium">{{ currentVersion }}</dd>
          </div>
          <div class="space-y-1 py-2">
            <dt class="text-xs text-muted-foreground">{{ t('setting.updates.releaseChannel') }}</dt>
            <dd class="mt-1 font-medium">{{ channelLabel }}</dd>
          </div>
          <div class="space-y-1 py-2">
            <dt class="text-xs text-muted-foreground">{{ t('setting.updates.updateOwner') }}</dt>
            <dd class="mt-1 font-medium">{{ ownerLabel }}</dd>
          </div>
        </dl>

        <div
          class="border-t border-border pt-6"
          data-testid="desktop-update-status"
          :data-state="presentation.kind"
        >
          <div class="flex items-start gap-3">
            <component
              :is="statusIcon"
              class="mt-0.5 h-5 w-5 shrink-0"
              :class="[statusIconClass, { 'animate-spin': isAnimatedIcon }]"
            />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-sm font-medium">{{ t(presentation.titleKey) }}</h3>
                <Badge
                  v-if="presentation.release"
                  variant="secondary"
                  data-testid="desktop-update-available-version"
                >
                  v{{ presentation.release.version }}
                </Badge>
              </div>

              <p class="mt-1 text-sm text-muted-foreground">
                {{ t(presentation.descriptionKey) }}
              </p>

              <template v-if="snapshot?.state.type === 'downloading'">
                <Progress
                  class="mt-4 h-1.5"
                  :model-value="presentation.progressPercent ?? 0"
                  data-testid="desktop-update-progress"
                />
                <div
                  class="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground"
                >
                  <span>{{ downloadDetails }}</span>
                  <span>{{ Math.round(presentation.progressPercent ?? 0) }}%</span>
                </div>
              </template>

              <p
                v-if="failureMessage"
                class="mt-3 text-sm text-destructive"
                data-testid="desktop-update-failure"
              >
                {{ failureMessage }}
              </p>
              <p
                v-if="transportError"
                class="mt-3 text-sm text-destructive"
                data-testid="desktop-update-transport-error"
              >
                {{ transportError }}
              </p>

              <div
                v-if="presentation.action !== 'none'"
                class="mt-4 flex flex-wrap items-center gap-2"
              >
                <Button
                  type="button"
                  size="sm"
                  :disabled="actionPending"
                  data-testid="desktop-update-primary-action"
                  @click="handlePrimaryAction"
                >
                  <LoaderCircle v-if="actionPending" class="mr-2 h-4 w-4 animate-spin" />
                  <RotateCw v-else-if="presentation.action === 'restart'" class="mr-2 h-4 w-4" />
                  <RefreshCw v-else class="mr-2 h-4 w-4" />
                  {{ presentation.actionKey ? t(presentation.actionKey) : '' }}
                </Button>
                <span v-if="presentation.kind === 'ready'" class="text-xs text-muted-foreground">
                  {{ t('setting.updates.restartHint') }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="presentation.release?.releaseNotes?.trim()"
          class="min-w-0 border-t border-border pt-6"
        >
          <h3 class="text-sm font-medium">{{ t('setting.updates.releaseNotes') }}</h3>
          <ReleaseNotes
            class="mt-2"
            :source="presentation.release.releaseNotes"
            role="region"
            :aria-label="t('setting.updates.releaseNotes')"
            tabindex="0"
          />
        </div>

        <p v-if="lastCheckedAt" class="text-xs text-muted-foreground">
          {{ t('setting.updates.lastChecked', { time: lastCheckedAt }) }}
        </p>
      </div>
    </section>
    <details data-testid="desktop-update-troubleshooting" class="group border-b border-border pb-6">
      <summary class="cursor-pointer py-2 text-sm font-medium">
        {{ t('setting.updates.troubleshooting.title') }}
      </summary>
      <div class="space-y-3 pt-4 text-sm">
        <p v-if="diagnosticsUnavailable" data-testid="desktop-update-diagnostics-unavailable">
          {{ t('setting.updates.troubleshooting.unavailable') }}
        </p>
        <template v-else-if="diagnostics">
          <dl class="grid gap-2 sm:grid-cols-2" data-testid="desktop-update-diagnostics-summary">
            <div>
              <dt class="text-xs text-muted-foreground">
                {{ t('setting.updates.troubleshooting.currentVersion') }}
              </dt>
              <dd data-testid="desktop-update-diagnostics-currentVersion">
                {{ diagnostics.currentVersion }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">
                {{ t('setting.updates.troubleshooting.targetVersion') }}
              </dt>
              <dd data-testid="desktop-update-diagnostics-targetVersion">
                {{ diagnostics.targetVersion ?? '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">
                {{ t('setting.updates.troubleshooting.state') }}
              </dt>
              <dd data-testid="desktop-update-diagnostics-state">{{ diagnosticsStateLabel }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">
                {{ t('setting.updates.troubleshooting.lastCheckResult') }}
              </dt>
              <dd data-testid="desktop-update-diagnostics-lastCheckResult">
                {{ diagnosticsLastCheckResultLabel }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">
                {{ t('setting.updates.troubleshooting.lastCheckedAt') }}
              </dt>
              <dd data-testid="desktop-update-diagnostics-lastCheckedAt">
                {{ diagnosticsLastCheckedAt ?? '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted-foreground">
                {{ t('setting.updates.troubleshooting.receiptStatus') }}
              </dt>
              <dd data-testid="desktop-update-diagnostics-receipt">
                {{ diagnosticsReceiptLabel }}
              </dd>
            </div>
          </dl>
          <p
            v-if="diagnosticsFailureSummary"
            class="text-destructive"
            data-testid="desktop-update-diagnostics-failure"
          >
            {{ diagnosticsFailureSummary }}
          </p>
          <details data-testid="desktop-update-diagnostics-technical">
            <summary class="cursor-pointer select-none text-xs text-muted-foreground">
              {{ t('setting.updates.troubleshooting.technicalSummary') }}
            </summary>
            <div class="mt-2 space-y-2">
              <pre
                class="overflow-x-auto rounded-md border border-border/70 bg-muted/20 p-2 font-mono text-xs whitespace-pre-wrap break-all"
                data-testid="desktop-update-diagnostics-raw"
                >{{ rawDiagnosticsText }}</pre>
              <div class="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="desktop-update-copy-diagnostics"
                  @click="copyDiagnostics"
                >
                  <Copy class="mr-2 h-4 w-4" />
                  {{
                    diagnosticsCopied
                      ? t('setting.updates.troubleshooting.copiedDiagnostics')
                      : t('setting.updates.troubleshooting.copyDiagnostics')
                  }}
                </Button>
                <span class="text-xs text-muted-foreground">
                  {{ t('setting.updates.troubleshooting.technicalHint') }}
                </span>
              </div>
            </div>
          </details>
        </template>
      </div>
    </details>
  </section>
</template>
