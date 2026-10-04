<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Loader2 } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useAuthService } from './service';

const service = useAuthService();
const { t } = useI18n();
const query = new URLSearchParams(window.location.search);
const provider = query.get('provider');
const requestId = query.get('requestId');
const state = ref<'completing' | 'complete' | 'failed'>('completing');

const validRequest = computed(
  () => provider === 'github' && typeof requestId === 'string' && requestId.length > 0,
);

function notifyOpener(): void {
  if (!window.opener || window.opener.closed || !requestId) return;
  window.opener.postMessage(
    {
      type: 'memoflow:oauth-popup-complete',
      provider: 'github',
      requestId,
    },
    window.location.origin,
  );
}

async function complete(): Promise<void> {
  if (!validRequest.value) {
    state.value = 'failed';
    return;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const session = await service.getSession();
    if (session.ok && session.data.session) {
      notifyOpener();
      state.value = 'complete';
      window.close();
      return;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 125));
  }

  state.value = 'failed';
}

onMounted(() => {
  void complete();
});
</script>

<template>
  <main
    class="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-center text-white"
    data-testid="oauth-popup-complete"
  >
    <div class="grid max-w-sm justify-items-center gap-3">
      <Loader2
        v-if="state === 'completing'"
        class="h-6 w-6 animate-spin text-white/60"
        aria-hidden="true"
      />
      <template v-if="state === 'completing'">
        <h1 class="text-base font-medium">{{ t('auth.popup.completingTitle') }}</h1>
        <p class="text-sm text-white/55">{{ t('auth.popup.completingDescription') }}</p>
      </template>
      <template v-else-if="state === 'complete'">
        <h1 class="text-base font-medium">{{ t('auth.popup.completeTitle') }}</h1>
        <p class="text-sm text-white/55">{{ t('auth.popup.completeDescription') }}</p>
      </template>
      <template v-else>
        <h1 class="text-base font-medium">{{ t('auth.popup.failedTitle') }}</h1>
        <p class="text-sm text-white/55">{{ t('auth.popup.failedDescription') }}</p>
      </template>
    </div>
  </main>
</template>
