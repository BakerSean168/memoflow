<template>
  <SettingsSection
    :title="t('setting.userFiles.title')"
    :description="t('setting.userFiles.description')"
    test-id="user-files-settings"
  >
    <SettingsPropertyRow :label="t('setting.userFiles.currentDirectory')" layout="stacked">
      <div class="flex items-center gap-2">
        <code
          class="flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-muted/45 px-3 py-2 text-[12px] text-foreground"
        >
          {{ currentPath || '...' }}
        </code>
        <Badge v-if="isCustom" variant="secondary">{{ t('setting.userFiles.customBadge') }}</Badge>
      </div>
    </SettingsPropertyRow>

    <SettingsPropertyRow
      v-if="isCustom"
      :label="t('setting.userFiles.defaultDirectory')"
      layout="stacked"
    >
      <code
        class="block overflow-x-auto whitespace-nowrap rounded-md bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground"
      >
        {{ defaultPath }}
      </code>
    </SettingsPropertyRow>

    <SettingsStatusBlock
      v-if="feedback"
      :kind="feedback.type"
      :description="feedback.message"
      test-id="user-files-feedback"
      class="my-3"
    />

    <div class="grid grid-cols-1 gap-3 pt-3 @2xl/panel:grid-cols-3">
      <Button variant="outline" class="w-full" :disabled="loading" @click="pickDirectory">
        <Loader2 v-if="pickLoading" class="mr-2 h-4 w-4 animate-spin" />
        <FolderInput v-else class="mr-2 h-4 w-4" />
        {{ t('setting.userFiles.changeDirectory') }}
      </Button>

      <Button variant="outline" class="w-full" :disabled="openLoading" @click="openDirectory">
        <Loader2 v-if="openLoading" class="mr-2 h-4 w-4 animate-spin" />
        <ExternalLink v-else class="mr-2 h-4 w-4" />
        {{ t('setting.userFiles.openDirectory') }}
      </Button>

      <Button
        variant="outline"
        class="w-full"
        :disabled="!isCustom || loading"
        @click="confirmReset"
      >
        <Loader2 v-if="resetLoading" class="mr-2 h-4 w-4 animate-spin" />
        <RotateCcw v-else class="mr-2 h-4 w-4" />
        {{ t('setting.userFiles.resetToDefault') }}
      </Button>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Badge, Button } from '@memoflow/ui-vue-shadcn';
import { ExternalLink, FolderInput, Loader2, RotateCcw } from '@lucide/vue';
import { SystemChannels } from '@memoflow/contracts/electron';
import { isOk, type Result } from '@memoflow/contracts/result';
import {
  SettingsPropertyRow,
  SettingsSection,
  SettingsStatusBlock,
} from '../../../components/shared/settings';
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
    const response = (await electronApi.invoke(SystemChannels.USER_FILES_RESET_PATH)) as Result<{
      path: string;
    }>;
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
