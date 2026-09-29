<template>
  <Card class="border-0 bg-[hsl(var(--surface-raised)/0.24)] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.46)]">
    <CardHeader>
      <CardTitle class="flex items-center">
        <FolderOpen class="h-5 w-5 mr-2" />
        {{ t('setting.userFiles.title') }}
      </CardTitle>
      <p class="text-sm text-muted-foreground mt-1">
        {{ t('setting.userFiles.description') }}
      </p>
    </CardHeader>

    <Separator class="bg-[hsl(var(--border-subtle))]" />

    <CardContent class="p-4 space-y-4">
      <!-- Current path -->
      <div class="space-y-2">
        <Label class="text-sm font-medium">{{ t('setting.userFiles.currentDirectory') }}</Label>
        <div class="flex items-center gap-2">
          <code
            class="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-[hsl(var(--surface)/0.72)] px-3 py-2 text-[12px] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.45)]"
          >
            {{ currentPath || '...' }}
          </code>
          <Badge v-if="isCustom" variant="secondary">{{ t('setting.userFiles.customBadge') }}</Badge>
        </div>
      </div>

      <!-- Default path (shown when custom) -->
      <div v-if="isCustom" class="space-y-2">
        <Label class="text-sm font-medium text-muted-foreground">
          {{ t('setting.userFiles.defaultDirectory') }}
        </Label>
        <code class="block rounded-lg bg-[hsl(var(--surface)/0.5)] px-3 py-2 text-[12px] text-[hsl(var(--foreground-muted))] shadow-[inset_0_0_0_1px_hsl(var(--border-subtle)/0.4)]">
          {{ defaultPath }}
        </code>
      </div>

      <!-- Feedback message -->
      <div
        v-if="feedback"
        class="flex items-center gap-2 text-sm rounded-md px-3 py-2"
        :class="feedback.type === 'success'
          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
          : 'bg-destructive/10 text-destructive'"
      >
        <CheckCircle2 v-if="feedback.type === 'success'" class="h-4 w-4 shrink-0" />
        <AlertCircle v-else class="h-4 w-4 shrink-0" />
        <span>{{ feedback.message }}</span>
      </div>

      <!-- Actions -->
      <div class="grid grid-cols-1 gap-3 pt-2 @2xl/panel:grid-cols-3">
        <Button variant="outline" class="w-full" :disabled="loading" @click="pickDirectory">
          <Loader2 v-if="pickLoading" class="h-4 w-4 mr-2 animate-spin" />
          <FolderInput v-else class="h-4 w-4 mr-2" />
          {{ t('setting.userFiles.changeDirectory') }}
        </Button>

        <Button variant="outline" class="w-full" :disabled="openLoading" @click="openDirectory">
          <Loader2 v-if="openLoading" class="h-4 w-4 mr-2 animate-spin" />
          <ExternalLink v-else class="h-4 w-4 mr-2" />
          {{ t('setting.userFiles.openDirectory') }}
        </Button>

        <Button
          variant="outline"
          class="w-full"
          :disabled="!isCustom || loading"
          @click="confirmReset"
        >
          <Loader2 v-if="resetLoading" class="h-4 w-4 mr-2 animate-spin" />
          <RotateCcw v-else class="h-4 w-4 mr-2" />
          {{ t('setting.userFiles.resetToDefault') }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Separator, Label } from '@memoflow/ui-vue-shadcn';
import { FolderOpen, FolderInput, ExternalLink, RotateCcw, Loader2, CheckCircle2, AlertCircle } from '@lucide/vue';
import { SystemChannels } from '@memoflow/contracts/electron';
import { isOk, type Result } from '@memoflow/contracts/result';
import { DESKTOP_AUTH_API_KEY } from '../../../di/keys';

const { t } = useI18n();
const desktopApi = inject(DESKTOP_AUTH_API_KEY, undefined);

const currentPath = ref('');
const defaultPath = ref('');
const isCustom = ref(false);
const pickLoading = ref(false);
const openLoading = ref(false);
const resetLoading = ref(false);
const feedback = ref<{ type: 'success' | 'error'; message: string } | null>(null);

const loading = computed(() => pickLoading.value || resetLoading.value);

type UserFilesPathResult = {
  currentPath: string;
  defaultPath: string;
  isCustom: boolean;
};

type UserFilesPickDirectoryResult = {
  canceled: boolean;
  path: string | null;
};

let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

function showFeedback(type: 'success' | 'error', message: string) {
  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedback.value = { type, message };
  feedbackTimer = setTimeout(() => {
    feedback.value = null;
  }, 4000);
}

async function loadPath() {
  const electronApi = desktopApi;
  if (!electronApi?.invoke) return;
  try {
    const response = (await electronApi.invoke(
      SystemChannels.USER_FILES_GET_PATH,
    )) as Result<UserFilesPathResult>;
    if (!isOk(response)) {
      showFeedback('error', t('setting.userFiles.loadPathFailed', '无法加载文件存储路径'));
      return;
    }
    currentPath.value = response.data.currentPath;
    defaultPath.value = response.data.defaultPath;
    isCustom.value = response.data.isCustom;
  } catch (err) {
    console.error('Failed to load user files path:', err);
    showFeedback('error', t('setting.userFiles.loadPathFailed', '无法加载文件存储路径'));
  }
}

async function pickDirectory() {
  const electronApi = desktopApi;
  if (!electronApi?.invoke) return;
  pickLoading.value = true;
  try {
    const response = (await electronApi.invoke(
      SystemChannels.USER_FILES_PICK_DIRECTORY,
    )) as Result<UserFilesPickDirectoryResult>;
    if (!isOk(response)) {
      showFeedback('error', t('setting.userFiles.pickDirectoryFailed', '更改目录失败，请重试'));
      return;
    }
    if (!response.data.canceled && response.data.path) {
      await loadPath();
      showFeedback('success', t('setting.userFiles.directoryChanged', '文件存储位置已更新'));
    }
  } catch (err) {
    console.error('Failed to pick directory:', err);
    showFeedback('error', t('setting.userFiles.pickDirectoryFailed', '更改目录失败，请重试'));
  } finally {
    pickLoading.value = false;
  }
}

async function openDirectory() {
  const electronApi = desktopApi;
  if (!electronApi?.invoke) return;
  openLoading.value = true;
  try {
    const response = (await electronApi.invoke(
      SystemChannels.USER_FILES_OPEN_DIRECTORY,
    )) as Result<null>;
    if (!isOk(response)) {
      showFeedback('error', t('setting.userFiles.openDirectoryFailed', '无法打开文件夹'));
    }
  } catch (err) {
    console.error('Failed to open directory:', err);
    showFeedback('error', t('setting.userFiles.openDirectoryFailed', '无法打开文件夹'));
  } finally {
    openLoading.value = false;
  }
}

function confirmReset() {
  const electronApi = desktopApi;
  if (!electronApi?.invoke) return;
  const confirmed = window.confirm(t('setting.userFiles.resetConfirm'));
  if (confirmed) {
    resetToDefault();
  }
}

async function resetToDefault() {
  const electronApi = desktopApi;
  if (!electronApi?.invoke) return;
  resetLoading.value = true;
  try {
    const response = (await electronApi.invoke(
      SystemChannels.USER_FILES_RESET_PATH,
    )) as Result<{ path: string }>;
    if (!isOk(response)) {
      showFeedback('error', t('setting.userFiles.resetFailed', '恢复默认失败，请重试'));
      return;
    }
    await loadPath();
    showFeedback('success', t('setting.userFiles.resetSuccess', '已恢复默认文件存储位置'));
  } catch (err) {
    console.error('Failed to reset path:', err);
    showFeedback('error', t('setting.userFiles.resetFailed', '恢复默认失败，请重试'));
  } finally {
    resetLoading.value = false;
  }
}

onMounted(() => {
  loadPath();
});
</script>
