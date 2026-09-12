<template>
  <div class="flex h-full flex-col overflow-hidden bg-background">
    <!-- Header -->
    <header
      class="z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background/50 px-6 backdrop-blur-sm"
    >
      <div class="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8"
          :aria-label="t('common.back')"
          @click="$router.push('/notifications')"
        >
          <ArrowLeft class="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" class="h-4" />
        <h1 class="text-lg font-medium text-foreground">
          {{ t('notification.sseMonitor.title') }}
        </h1>
        <Badge :variant="connected ? 'default' : 'destructive'" class="text-xs">
          {{
            connected
              ? t('notification.sseMonitor.connected')
              : t('notification.sseMonitor.disconnected')
          }}
        </Badge>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="h-8" @click="clearMessages">
          {{ t('notification.sseMonitor.clearLog') }}
        </Button>
        <Button
          size="sm"
          class="h-8"
          :variant="connected ? 'destructive' : 'default'"
          @click="toggleConnection"
        >
          {{
            connected
              ? t('notification.sseMonitor.actionDisconnect')
              : t('notification.sseMonitor.actionConnect')
          }}
        </Button>
      </div>
    </header>

    <!-- Content -->
    <ScrollArea class="flex-1 p-6">
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
          class="rounded-lg border bg-card p-3 font-mono text-sm"
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
import { Button, Badge, ScrollArea, Separator } from '@memoflow/ui-vue-shadcn';
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
