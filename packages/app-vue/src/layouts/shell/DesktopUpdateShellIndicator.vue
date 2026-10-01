<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { AlertTriangle, Download } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import type { DesktopUpdateSnapshotDTO } from '@memoflow/contracts/electron';
import { DESKTOP_UPDATE_SERVICE_KEY } from '../../di/keys';
import { presentDesktopUpdateShellIndicator } from './desktop-update-shell-indicator.presentation';

const emit = defineEmits<{
  (e: 'open-updates'): void;
}>();

const { t } = useI18n();
const updateService = inject(DESKTOP_UPDATE_SERVICE_KEY, null);
const snapshot = ref<DesktopUpdateSnapshotDTO | null>(null);
let snapshotRevision = 0;
let active = true;
let unsubscribe: (() => void) | null = null;

const presentation = computed(() => presentDesktopUpdateShellIndicator(snapshot.value));

function adoptSnapshot(next: DesktopUpdateSnapshotDTO): void {
  snapshotRevision += 1;
  snapshot.value = next;
}

onMounted(() => {
  if (!updateService) return;

  unsubscribe = updateService.subscribe(adoptSnapshot);

  // A pushed snapshot must win over an older in-flight read.
  const requestRevision = snapshotRevision;
  void updateService.getSnapshot().then((result) => {
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
  <button
    v-if="presentation"
    type="button"
    class="no-drag inline-flex max-w-44 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
    :class="
      presentation.kind === 'ready'
        ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
        : 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15'
    "
    :title="t('shell.update.openSettings')"
    :aria-label="t('shell.update.openSettings')"
    data-testid="desktop-update-shell-indicator"
    :data-state="presentation.kind"
    @click="emit('open-updates')"
  >
    <Download v-if="presentation.kind === 'ready'" class="h-3.5 w-3.5 shrink-0" />
    <AlertTriangle v-else class="h-3.5 w-3.5 shrink-0" />
    <span class="truncate">
      {{ t(presentation.labelKey, { version: presentation.version ?? '' }) }}
    </span>
  </button>
</template>
