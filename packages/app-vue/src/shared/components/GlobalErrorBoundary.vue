<script setup lang="ts">
/**
 * GlobalErrorBoundary.vue
 *
 * 全局错误兜底组件。利用 Vue 的 onErrorCaptured 拦截所有子组件的
 * 致命错误，防止白屏，展示友好的 fallback UI。
 *
 * 用法：包裹 <router-view /> 即可。
 *   <GlobalErrorBoundary>
 *     <router-view />
 *   </GlobalErrorBoundary>
 */
import { ref, onErrorCaptured } from 'vue';
import { useI18n } from 'vue-i18n';
import { createLogger } from '@memoflow/utils/logger';

const { t } = useI18n();
const logger = createLogger('GlobalErrorBoundary');

const hasError = ref(false);
const errorMessage = ref('');
const errorStack = ref('');

onErrorCaptured((err: Error) => {
  hasError.value = true;
  errorMessage.value = err.message || t('common.unknownError');
  errorStack.value = err.stack || '';

  // 使用统一日志系统记录错误
  logger.error('Captured global error', err);

  // 如果接入了 Sentry，进行上报
  // @ts-ignore - Sentry 可能是通过 CDN 或外部脚本全局注入的
  if (globalThis.Sentry) {
    // @ts-ignore
    globalThis.Sentry.captureException(err);
  }

  // 返回 false 阻止错误继续向上传播
  return false;
});

function handleRetry() {
  hasError.value = false;
  errorMessage.value = '';
  errorStack.value = '';
}

function handleGoHome() {
  globalThis.window.location.href = '/';
}
</script>

<template>
  <slot v-if="!hasError" />

  <div v-else class="flex h-full min-h-0 items-center justify-center bg-background p-6">
    <div class="mx-auto max-w-md text-center space-y-6">
      <!-- Icon -->
      <div
        class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-8 w-8 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>

      <!-- Title & Description -->
      <div class="space-y-2">
        <h2 class="text-2xl font-semibold tracking-tight text-foreground">
          {{ t('common.pageError') }}
        </h2>
        <p class="text-sm text-muted-foreground">
          {{ errorMessage }}
        </p>
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-center gap-3">
        <button
          class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          @click="handleRetry"
        >
          {{ t('common.retry') }}
        </button>
        <button
          class="inline-flex h-9 items-center justify-center rounded-md border border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-raised)/0.42)] px-4 text-sm font-medium text-foreground shadow-none transition-colors hover:bg-[hsl(var(--hover))]"
          @click="handleGoHome"
        >
          {{ t('common.goHome') }}
        </button>
      </div>

      <!-- Error Details (dev only) -->
      <details v-if="errorStack" class="text-left">
        <summary
          class="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {{ t('common.viewErrorDetails') }}
        </summary>
        <pre
          class="mt-2 max-h-40 overflow-auto rounded-lg bg-[hsl(var(--surface-raised)/0.34)] p-3 text-xs text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.42)]"
          >{{ errorStack }}</pre
        >
      </details>
    </div>
  </div>
</template>
