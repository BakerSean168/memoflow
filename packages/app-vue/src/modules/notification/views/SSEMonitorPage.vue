<template>
  <div class="flex h-full flex-col overflow-hidden bg-background">
    <ModuleHeader>
      <template #leading>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          :aria-label="t('common.back')"
          @click="$router.push('/notifications')"
        >
          <ArrowLeft class="h-3.5 w-3.5" />
        </Button>
        <h1 class="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
          {{ t('notification.sseMonitor.title') }}
        </h1>
        <Badge :variant="connected ? 'secondary' : 'destructive'" class="h-5 text-[10px]">
          {{
            connected
              ? t('notification.sseMonitor.connected')
              : t('notification.sseMonitor.disconnected')
          }}
        </Badge>
      </template>

      <template #actions>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 text-[11px] text-[hsl(var(--foreground-muted))]"
          @click="clearMessages"
        >
          {{ t('notification.sseMonitor.clearLog') }}
        </Button>
        <Button
          size="sm"
          class="h-7 text-[11px]"
          :variant="connected ? 'destructive' : 'default'"
          @click="toggleConnection"
        >
          {{
            connected
              ? t('notification.sseMonitor.actionDisconnect')
              : t('notification.sseMonitor.actionConnect')
          }}
        </Button>
      </template>
    </ModuleHeader>

    <!-- Content -->
    <ScrollArea class="flex-1 p-4 @2xl/panel:p-6">
      <div class="mx-auto max-w-4xl space-y-2">
        <div
          v-if="messages.length === 0"
          class="flex h-[50vh] flex-col items-center justify-center text-muted-foreground"
        >
          <Radio class="mb-4 h-12 w-12 opacity-50" />
          <h3 class="mb-1 text-lg font-medium text-foreground">
            {{ t('notification.sseMonitor.waitingTitle') }}
          </h3>
          <p class="text-sm">{{ t('notification.sseMonitor.waitingDescription') }}</p>
        </div>

        <div
          v-for="(msg, index) in messages"
          :key="index"
          class="rounded-lg bg-[hsl(var(--surface-raised)/0.32)] p-3 font-mono text-[12px] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.46)]"
        >
          <div class="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{{ formatMessageTime(msg.time) }}</span>
            <Badge variant="outline" class="text-xs">{{ msg.type }}</Badge>
          </div>
          <pre class="whitespace-pre-wrap text-foreground">{{ msg.data }}</pre>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, Radio } from '@lucide/vue';
import { Button, Badge, ScrollArea } from '@memoflow/ui-vue-shadcn';
import ModuleHeader from '../../../components/shared/ModuleHeader.vue';
import { getProductTime, productTimeRevision } from '../../../shared/utils/product-time';

interface SSEMessage {
  time: number;
  type: string;
  data: string;
}

const { t } = useI18n();

const connected = ref(false);
const messages = ref<SSEMessage[]>([]);

function toggleConnection() {
  connected.value = !connected.value;
  if (connected.value) {
    messages.value.push({
      time: Date.now(),
      type: 'system',
      data: t('notification.sseMonitor.msgConnected'),
    });
  } else {
    messages.value.push({
      time: Date.now(),
      type: 'system',
      data: t('notification.sseMonitor.msgDisconnected'),
    });
  }
}

/**
 * Residual 1207 Registry boundary (P3 end-state): SSE monitor raw locale clock — durable exemption; not product Style path.
 * Notification SSE monitor clock; component-local (not fixed zh-CN Intl).
 * Soft residual 1207: app-react useAIWorkspace formatMessageTime is Intl zh-CN (no force-merge).
 */
function formatMessageTime(timestamp: number): string {
  void productTimeRevision.value;
  return getProductTime().format.hm(timestamp);
}

function clearMessages() {
  messages.value = [];
}
</script>
