<script setup lang="ts">
import { computed, inject, onBeforeUnmount, watch } from 'vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Dialog,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@memoflow/ui-vue-shadcn';
import {
  CheckCircle2,
  Cloud,
  Copy,
  ExternalLink,
  Laptop,
  LoaderCircle,
  RotateCw,
  X,
} from '@lucide/vue';
import type {
  DesktopCloudConnectionAttempt,
  DesktopCloudConnectionRequest,
} from '@memoflow/contracts';
import { SystemChannels, WindowChannels } from '@memoflow/contracts/electron';
import ProductDialogShell from '../../shared/components/ProductDialogShell.vue';
import {
  DESKTOP_ACCESS_SNAPSHOT_KEY,
  DESKTOP_BRIDGE_KEY,
  DESKTOP_CLOUD_AUTH_SERVICE_KEY,
} from '../../di/keys';
import { readDesktopAccessSnapshot } from '../../shared/utils/desktop-profile-access';
import { useAuthenticationStore } from '../../modules/authentication/stores/authentication-store';

const props = defineProps<{
  open: boolean;
  profileName?: string;
  intent?: DesktopCloudConnectionRequest['intent'];
}>();
const emit = defineEmits<{ (event: 'update:open', value: boolean): void }>();

const { t } = useI18n();
const service = inject(DESKTOP_CLOUD_AUTH_SERVICE_KEY, null);
const bridge = inject(DESKTOP_BRIDGE_KEY, null);
const accessSnapshot = inject(DESKTOP_ACCESS_SNAPSHOT_KEY, null);
const authStore = useAuthenticationStore();
const attempt = ref<DesktopCloudConnectionAttempt | null>(null);
const loading = ref(false);
const message = ref<string | null>(null);
let pollTimer: ReturnType<typeof setTimeout> | null = null;

const isPending = computed(
  () =>
    attempt.value !== null &&
    ['requesting_code', 'awaiting_authorization', 'connecting_profile'].includes(
      attempt.value.status,
    ),
);
const isConnected = computed(() => attempt.value?.status === 'connected');
const canRetry = computed(
  () =>
    attempt.value !== null &&
    ['denied', 'expired', 'cancelled', 'failed'].includes(attempt.value.status),
);
const statusLabel = computed(() => {
  if (!attempt.value) return t('shell.cloudConnection.ready');
  return t(`shell.cloudConnection.status.${attempt.value.status}`);
});

function stopPolling(): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

function schedulePoll(): void {
  stopPolling();
  if (!props.open || !isPending.value) return;
  pollTimer = setTimeout(() => void refreshAttempt(), 1_200);
}

async function hydrateSession(): Promise<void> {
  if (!service) return;
  const result = await service.getSession();
  if (result.ok) authStore.hydrateCloudSession(result.data);
  if (accessSnapshot && bridge)
    accessSnapshot.value = await readDesktopAccessSnapshot(bridge, { refreshCloud: true });
}

async function applyAttempt(next: DesktopCloudConnectionAttempt | null): Promise<void> {
  attempt.value = next;
  message.value = next?.error?.message ?? null;
  if (next?.status === 'connected' && next.result) {
    if (next.result.targetProfileId !== next.originProfileId) {
      stopPolling();
      await bridge?.invoke(
        WindowChannels.TRANSITION_TO_PROFILE_ACCESS,
        next.result.targetProfileId,
      );
      return;
    }
    await hydrateSession();
    if (next.result.activation === 'sync_pending')
      message.value = t('shell.cloudConnection.syncPending');
  }
  schedulePoll();
}

async function restoreAttempt(): Promise<void> {
  if (!service) return;
  loading.value = true;
  message.value = null;
  const result = await service.getCurrentCloudConnection();
  loading.value = false;
  if (!result.ok) {
    message.value = result.error.message;
    return;
  }
  await applyAttempt(result.data?.status === 'connected' ? null : result.data);
}

async function refreshAttempt(): Promise<void> {
  if (!service || !attempt.value) return;
  const result = await service.getCloudConnectionStatus(attempt.value.attemptId);
  if (!result.ok) {
    message.value = result.error.message;
    stopPolling();
    return;
  }
  await applyAttempt(result.data);
}

async function beginConnection(): Promise<void> {
  if (!service) return;
  loading.value = true;
  message.value = null;
  const result = await service.beginCloudConnection({ intent: props.intent ?? 'add_account' });
  loading.value = false;
  if (!result.ok) {
    message.value = result.error.message;
    return;
  }
  await applyAttempt(result.data);
}

async function reopenBrowser(): Promise<void> {
  if (!attempt.value || !bridge) return;
  await bridge.invoke(SystemChannels.OPEN_EXTERNAL_URL, { url: attempt.value.verificationUrl });
}

async function copyCode(): Promise<void> {
  if (!attempt.value) return;
  await navigator.clipboard.writeText(attempt.value.userCode);
}

async function cancelConnection(): Promise<void> {
  if (!service || !attempt.value) return;
  const result = await service.cancelCloudConnection(attempt.value.attemptId);
  if (!result.ok) {
    message.value = result.error.message;
    return;
  }
  await refreshAttempt();
}

watch(
  () => props.open,
  (open) => {
    if (open) void restoreAttempt();
    else stopPolling();
  },
  { immediate: true },
);
onBeforeUnmount(stopPolling);
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <ProductDialogShell
      :open="open"
      test-id="cloud-connection-dialog"
      size="sm"
      body-class="space-y-5"
    >
      <template #icon>
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40"
        >
          <Cloud class="h-4 w-4" />
        </div>
      </template>
      <template #title>{{ t('shell.cloudConnection.title') }}</template>
      <template #description>{{ t('shell.cloudConnection.description') }}</template>

      <div class="grid grid-cols-[auto_1fr_auto] items-center gap-3" aria-hidden="true">
        <div class="flex h-10 w-10 items-center justify-center rounded-full border bg-background">
          <Laptop class="h-4 w-4" />
        </div>
        <div class="relative h-px bg-border">
          <div
            class="absolute inset-y-0 left-0 bg-primary transition-[width] duration-300"
            :class="isConnected ? 'w-full' : isPending ? 'w-1/2' : 'w-0'"
          />
        </div>
        <div
          class="flex h-10 w-10 items-center justify-center rounded-full border"
          :class="
            isConnected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'
          "
        >
          <CheckCircle2 v-if="isConnected" class="h-4 w-4" />
          <Cloud v-else class="h-4 w-4" />
        </div>
      </div>

      <div class="space-y-1 text-center">
        <p class="text-sm font-medium" data-testid="cloud-connection-status">{{ statusLabel }}</p>
        <p class="text-xs text-muted-foreground">
          {{ profileName || t('shell.cloudConnection.localProfile') }}
        </p>
      </div>

      <div
        v-if="attempt?.userCode && isPending"
        data-testid="cloud-connection-pending"
        :data-attempt-id="attempt.attemptId"
        class="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
      >
        <div>
          <p class="text-xs text-muted-foreground">{{ t('shell.cloudConnection.code') }}</p>
          <p class="font-mono text-base font-semibold">{{ attempt.userCode }}</p>
        </div>
        <TooltipProvider>
          <div class="flex gap-1">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  size="icon"
                  variant="ghost"
                  data-testid="cloud-connection-reopen"
                  :aria-label="t('shell.cloudConnection.reopen')"
                  @click="reopenBrowser"
                >
                  <ExternalLink class="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ t('shell.cloudConnection.reopen') }}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  size="icon"
                  variant="ghost"
                  data-testid="cloud-connection-copy"
                  :aria-label="t('shell.cloudConnection.copy')"
                  @click="copyCode"
                >
                  <Copy class="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ t('shell.cloudConnection.copy') }}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  size="icon"
                  variant="ghost"
                  data-testid="cloud-connection-cancel"
                  :aria-label="t('common.cancel')"
                  @click="cancelConnection"
                >
                  <X class="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ t('common.cancel') }}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      <p v-if="message" class="text-sm text-destructive" role="alert">{{ message }}</p>

      <template #footer>
        <Button variant="outline" @click="emit('update:open', false)">
          {{ t('common.close') }}
        </Button>
        <Button
          v-if="!attempt || canRetry || isConnected"
          data-testid="cloud-connection-continue"
          :disabled="loading || !service"
          @click="beginConnection"
        >
          <LoaderCircle v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          <RotateCw v-else-if="canRetry" class="mr-2 h-4 w-4" />
          <ExternalLink v-else class="mr-2 h-4 w-4" />
          {{ canRetry ? t('common.retry') : t('shell.cloudConnection.continue') }}
        </Button>
        <Button
          v-else-if="isPending"
          data-testid="cloud-connection-browser-continue"
          @click="reopenBrowser"
        >
          <ExternalLink class="mr-2 h-4 w-4" />
          {{ t('shell.cloudConnection.continue') }}
        </Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>
