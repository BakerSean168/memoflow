<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  LoaderCircle,
  RefreshCw,
  RotateCw,
} from '@lucide/vue';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
} from '@memoflow/ui-vue-shadcn';
import type { DesktopUpdateSnapshotDTO } from '@memoflow/contracts/electron';
import { DESKTOP_UPDATE_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { presentDesktopUpdateSettings } from './desktop-update-settings.presentation';

const { t, locale } = useI18n();
const updateService = useStrictInject(DESKTOP_UPDATE_SERVICE_KEY, 'DesktopUpdateService');

const snapshot = ref<DesktopUpdateSnapshotDTO | null>(null);
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
    return new Intl.DateTimeFormat(locale.value, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(state.lastCheckedAt));
  } catch {
    return state.lastCheckedAt;
  }
});

const boundedReleaseNotes = computed(() => {
  const notes = presentation.value.release?.releaseNotes?.trim();
  if (!notes) return null;
  return notes.length > 2_000 ? `${notes.slice(0, 2_000)}…` : notes;
});

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
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribe = null;
});
</script>

<template>
  <section class="space-y-6" data-testid="desktop-update-settings-section">
    <header class="space-y-1">
      <h2 class="text-xl font-semibold tracking-tight">{{ t('setting.updates.title') }}</h2>
      <p class="text-sm text-muted-foreground">{{ t('setting.updates.overviewDescription') }}</p>
    </header>

    <Card>
      <CardHeader class="pb-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <CardTitle class="text-base">MemoFlow</CardTitle>
            <CardDescription>
              {{ t('setting.updates.versionLabel', { version: currentVersion }) }}
            </CardDescription>
          </div>
          <Badge variant="outline">{{ channelLabel }}</Badge>
        </div>
      </CardHeader>

      <CardContent class="space-y-5">
        <dl class="grid gap-3 text-sm sm:grid-cols-3">
          <div class="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <dt class="text-xs text-muted-foreground">{{ t('setting.updates.currentVersion') }}</dt>
            <dd class="mt-1 font-medium">{{ currentVersion }}</dd>
          </div>
          <div class="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <dt class="text-xs text-muted-foreground">{{ t('setting.updates.releaseChannel') }}</dt>
            <dd class="mt-1 font-medium">{{ channelLabel }}</dd>
          </div>
          <div class="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <dt class="text-xs text-muted-foreground">{{ t('setting.updates.updateOwner') }}</dt>
            <dd class="mt-1 font-medium">{{ ownerLabel }}</dd>
          </div>
        </dl>

        <div
          class="rounded-xl border border-border bg-muted/10 p-4"
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

        <div v-if="boundedReleaseNotes" class="rounded-lg border border-border/70 p-4">
          <h3 class="text-sm font-medium">{{ t('setting.updates.releaseNotes') }}</h3>
          <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {{ boundedReleaseNotes }}
          </p>
        </div>

        <p v-if="lastCheckedAt" class="text-xs text-muted-foreground">
          {{ t('setting.updates.lastChecked', { time: lastCheckedAt }) }}
        </p>
      </CardContent>
    </Card>
  </section>
</template>
