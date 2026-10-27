<script setup lang="ts">
import { inject, ref } from 'vue';
import { Download, ExternalLink } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import { SystemChannels } from '@memoflow/desktop-contracts';
import { settingUiHost } from '../setting-ui-host';

/**
 * A user-initiated download entry, not a silent native installation.
 * Version and URL match the Google-authored ACP Registry release 1.4.0.
 * The official registry link remains available for newer versions / other architectures.
 */
const AGY_ACP_WINDOWS_X64_140 =
  'https://dl.google.com/agy-extensions/releases/windows/agy-acp-server-1.4.0-windows-x86_64.zip';
const AGY_ACP_REGISTRY =
  'https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json';

const props = defineProps<{ disabled?: boolean }>();
const { t } = useI18n();
const bridge = inject(settingUiHost.DESKTOP_BRIDGE_KEY, undefined);
const isWindows = /Windows/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent);
const opening = ref(false);
const failed = ref(false);

async function openOfficial(url: string) {
  if (!bridge || opening.value || props.disabled) return;
  opening.value = true;
  failed.value = false;
  try {
    const result = await bridge.invoke(SystemChannels.OPEN_EXTERNAL_URL, { url });
    if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true)
      failed.value = true;
  } catch {
    failed.value = true;
  } finally {
    opening.value = false;
  }
}
</script>

<template>
  <div
    v-if="bridge"
    class="space-y-2 rounded-lg border border-[hsl(var(--border-subtle))] bg-muted/15 px-3 py-3"
    data-testid="ai-agy-acp-download"
  >
    <p class="text-xs font-medium">{{ t('setting.agentInstances.antigravityDownloadTitle') }}</p>
    <p class="text-xs leading-5 text-muted-foreground">
      {{ t('setting.agentInstances.antigravityDownloadHint') }}
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <Button
        v-if="isWindows"
        type="button"
        size="sm"
        variant="outline"
        class="h-8 gap-1.5"
        :disabled="disabled || opening"
        data-testid="ai-agy-download-windows"
        @click="openOfficial(AGY_ACP_WINDOWS_X64_140)"
      >
        <Download class="size-3.5" />
        {{ t('setting.agentInstances.antigravityDownloadWindows') }}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        class="h-8 gap-1.5"
        :disabled="disabled || opening"
        data-testid="ai-agy-download-registry"
        @click="openOfficial(AGY_ACP_REGISTRY)"
      >
        <ExternalLink class="size-3.5" />
        {{ t('setting.agentInstances.antigravityDownloadRegistry') }}
      </Button>
    </div>
    <p
      v-if="failed"
      role="alert"
      class="text-xs text-destructive"
      data-testid="ai-agy-download-error"
    >
      {{ t('setting.agentInstances.antigravityDownloadError') }}
    </p>
  </div>
</template>
