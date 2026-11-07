<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { AlertTriangle, CloudOff, RefreshCw } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@memoflow/ui-vue-shadcn';
import type { DesktopSyncSnapshotDTO, ProfileCloudState } from '@memoflow/desktop-contracts';
import { DESKTOP_SYNC_STATUS_SERVICE_KEY } from '../../di/keys';
import { presentSyncStatusIndicator } from './sync-status-indicator.presentation';

const props = withDefaults(
  defineProps<{
    cloudAccountBound: boolean;
    cloudState?: ProfileCloudState;
    avatarPending?: boolean;
    avatarAlignedAt?: number | null;
  }>(),
  { avatarPending: false, avatarAlignedAt: null },
);

const emit = defineEmits<{
  (e: 'request-avatar-refresh'): void;
  (e: 'dismiss-avatar-alignment'): void;
}>();

const { t, locale } = useI18n();
const service = inject(DESKTOP_SYNC_STATUS_SERVICE_KEY, null);
const snapshot = ref<DesktopSyncSnapshotDTO | null>(null);
const open = ref(false);
const syncing = ref(false);
let snapshotRevision = 0;
let active = true;
let unsubscribe: (() => void) | null = null;

const presentation = computed(() =>
  presentSyncStatusIndicator({
    cloudAccountBound: props.cloudAccountBound,
    cloudState: props.cloudState,
    snapshot: snapshot.value,
    avatarPending: props.avatarPending,
  }),
);

const icon = computed(() => {
  switch (presentation.value?.state) {
    case 'offline':
      return CloudOff;
    case 'error':
      return AlertTriangle;
    default:
      return RefreshCw;
  }
});

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

const lastSyncedText = computed(() => {
  const value = presentation.value?.lastSyncedAt;
  return value == null ? null : formatTime(value);
});

const tooltip = computed(() => {
  const current = presentation.value;
  if (!current) return t('shell.sync.label');
  if (current.state === 'offline') return t('shell.sync.tooltip.offline');
  if (current.state === 'error') return t('shell.sync.tooltip.error');
  if (current.state === 'pending') {
    return t('shell.sync.tooltip.pending', { count: current.badgeCount ?? 0 });
  }
  return lastSyncedText.value
    ? t('shell.sync.tooltip.synced', { time: lastSyncedText.value })
    : t('shell.sync.tooltip.syncedNoTime');
});

const errorCategoryText = computed(() => {
  if (presentation.value?.state === 'offline') return null;
  const category = presentation.value?.errorCategory;
  if (!category) {
    return props.cloudState === 'REAUTH_REQUIRED' ? t('shell.sync.error.authorization') : null;
  }
  return t(`shell.sync.error.${category}`);
});

const businessErrorText = computed(() => {
  const category = presentation.value?.business.errorCategory;
  return category ? t(`shell.sync.error.${category}`) : null;
});

const hasDetails = computed(() => {
  const current = presentation.value;
  if (!current) return false;
  return (
    current.profileItems.length > 0 ||
    current.business.phase !== 'synced' ||
    current.business.errorCategory !== null ||
    current.errorCategory !== null ||
    current.showOfflineNote
  );
});

const alignedText = computed(() => {
  const value = props.avatarAlignedAt;
  return value == null ? null : t('shell.sync.alignedNotice', { time: formatTime(value) });
});

function adoptSnapshot(next: DesktopSyncSnapshotDTO): void {
  snapshotRevision += 1;
  snapshot.value = next;
}

async function syncNow(): Promise<void> {
  if (!service || syncing.value) return;
  syncing.value = true;
  try {
    const result = await service.syncNow();
    if (result.ok) adoptSnapshot(result.data);
  } finally {
    syncing.value = false;
    emit('request-avatar-refresh');
  }
}

onMounted(() => {
  if (!service) return;

  unsubscribe = service.subscribe(adoptSnapshot);

  // A pushed snapshot must win over an older in-flight read.
  const requestRevision = snapshotRevision;
  void service.getSnapshot().then((result) => {
    if (!active || !result.ok || snapshotRevision !== requestRevision) return;
    adoptSnapshot(result.data);
  });
});

onBeforeUnmount(() => {
  active = false;
  unsubscribe?.();
  unsubscribe = null;
});
</script>

<template>
  <Popover v-if="presentation" v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        :class="
          presentation.state === 'error'
            ? 'text-destructive hover:bg-destructive/10'
            : presentation.state === 'offline'
              ? 'text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--hover))] hover:text-foreground'
              : 'text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--hover))] hover:text-foreground'
        "
        :title="tooltip"
        :aria-label="tooltip"
        data-testid="sync-status-indicator"
        :data-state="presentation.state"
      >
        <component :is="icon" class="h-4 w-4" aria-hidden="true" />
        <span
          v-if="presentation.badgeCount !== null"
          class="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-semibold leading-none text-primary-foreground"
          :class="presentation.showAlertBadge ? 'bg-destructive' : 'bg-primary'"
          data-testid="sync-status-badge"
          >{{ presentation.badgeCount }}</span
        >
        <span
          v-else-if="presentation.showAlertBadge"
          class="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive"
          data-testid="sync-status-alert-dot"
        />
      </button>
    </PopoverTrigger>

    <PopoverContent
      side="top"
      align="start"
      :side-offset="8"
      class="w-80 max-w-[calc(100vw-1rem)] p-0"
      data-testid="sync-status-popover"
    >
      <div class="space-y-3 p-3 text-xs">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[13px] font-medium">{{ t('shell.sync.title') }}</p>
          <span
            class="rounded px-1.5 py-0.5 text-[10px]"
            :class="
              presentation.state === 'error'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-muted text-muted-foreground'
            "
            data-testid="sync-status-state"
            >{{ t(`shell.sync.state.${presentation.state}`) }}</span
          >
        </div>

        <p
          v-if="presentation.showOfflineNote"
          class="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
          data-testid="sync-status-offline-note"
        >
          {{ t('shell.sync.offlineNote') }}
        </p>

        <p
          v-if="errorCategoryText"
          class="rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive"
          data-testid="sync-status-error"
        >
          {{ t('shell.sync.errorLabel') }}：{{ errorCategoryText }}
        </p>

        <template v-if="hasDetails">
          <div v-if="presentation.profileItems.length > 0" class="space-y-1.5">
            <p class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {{ t('shell.sync.profile.section') }}
            </p>
            <div
              v-for="item in presentation.profileItems"
              :key="item.id"
              class="flex items-baseline justify-between gap-2"
              :data-testid="`sync-status-profile-item-${item.id}`"
            >
              <span class="shrink-0 text-muted-foreground">{{ t(item.labelKey) }}</span>
              <span class="min-w-0 truncate text-right font-medium">
                {{ item.value ?? (item.detailKey ? t(item.detailKey) : '') }}
              </span>
            </div>
          </div>

          <div class="space-y-1.5">
            <p class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {{ t('shell.sync.business.section') }}
            </p>
            <div class="flex items-baseline justify-between gap-2">
              <span class="shrink-0 text-muted-foreground">{{
                t('shell.sync.business.phase')
              }}</span>
              <span
                class="min-w-0 truncate text-right font-medium"
                data-testid="sync-status-business-phase"
              >
                {{ t(presentation.business.phaseKey) }}
              </span>
            </div>
            <div
              v-if="presentation.business.lastSyncedAt !== null"
              class="flex items-baseline justify-between gap-2"
            >
              <span class="shrink-0 text-muted-foreground">{{ t('shell.sync.lastSynced') }}</span>
              <span class="min-w-0 truncate text-right font-medium">
                {{ formatTime(presentation.business.lastSyncedAt) }}
              </span>
            </div>
            <div v-if="businessErrorText" class="flex items-baseline justify-between gap-2">
              <span class="shrink-0 text-muted-foreground">{{ t('shell.sync.errorLabel') }}</span>
              <span class="min-w-0 truncate text-right font-medium text-destructive">
                {{ businessErrorText }}
              </span>
            </div>
          </div>
        </template>

        <p v-else class="text-[11px] text-muted-foreground" data-testid="sync-status-all-synced">
          {{ t('shell.sync.allSynced') }}
          <template v-if="lastSyncedText"
            >· {{ t('shell.sync.lastSynced') }} {{ lastSyncedText }}</template
          >
        </p>

        <div
          v-if="alignedText"
          class="flex items-start justify-between gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-[11px]"
          data-testid="sync-status-aligned"
        >
          <span class="min-w-0 flex-1">{{ alignedText }}</span>
          <button
            type="button"
            class="shrink-0 text-[10px] text-muted-foreground underline-offset-2 hover:underline"
            data-testid="sync-status-dismiss-aligned"
            @click="emit('dismiss-avatar-alignment')"
          >
            {{ t('shell.sync.dismissAligned') }}
          </button>
        </div>

        <button
          type="button"
          class="flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
          :disabled="syncing"
          data-testid="sync-status-sync-now"
          @click="syncNow"
        >
          <RefreshCw
            class="h-3.5 w-3.5"
            :class="syncing ? 'animate-spin' : ''"
            aria-hidden="true"
          />
          {{ syncing ? t('shell.sync.syncing') : t('shell.sync.syncNow') }}
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
