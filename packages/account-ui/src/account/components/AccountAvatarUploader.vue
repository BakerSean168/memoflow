<script setup lang="ts">
/**
 * AccountAvatarUploader — click-to-upload avatar control (Issue #858).
 *
 * One component owns the whole interaction: click the avatar, pick an image,
 * normalize it, persist it through the platform avatar port and preview the
 * result immediately. Reused by the settings profile card today and by the
 * edit-profile dialog (#857) later.
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { Camera } from '@lucide/vue';
import { Avatar, AvatarFallback, AvatarImage } from '@memoflow/ui-vue-shadcn';
import { useAccountAvatar } from '../avatar/useAccountAvatar';
import { AvatarImageError, type AvatarImageErrorCode } from '../avatar/avatar-image';

const props = withDefaults(
  defineProps<{
    avatarUrl?: string | null;
    initials: string;
    /** Tailwind size classes for the avatar circle. */
    sizeClass?: string;
    disabled?: boolean;
    testId?: string;
  }>(),
  {
    avatarUrl: null,
    sizeClass: 'h-20 w-20',
    disabled: false,
    testId: 'account-avatar-uploader',
  },
);

const emit = defineEmits<{ (event: 'updated', url: string): void }>();

const { t } = useI18n();
const { upload, isUploading, hasStore } = useAccountAvatar();
const fileInput = ref<HTMLInputElement | null>(null);

const errorKeys: Record<AvatarImageErrorCode, string> = {
  'invalid-type': 'account.avatar.invalidType',
  'decode-failed': 'account.avatar.decodeFailed',
  'encode-failed': 'account.avatar.encodeFailed',
};

const isDisabled = () => props.disabled || isUploading.value || !hasStore;

function openPicker(): void {
  if (isDisabled()) return;
  fileInput.value?.click();
}

async function handleFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const url = await upload(file);
    if (url) {
      emit('updated', url);
      toast.success(t('account.avatar.saved'));
    }
  } catch (error) {
    const key = error instanceof AvatarImageError ? errorKeys[error.code] : 'account.avatar.failed';
    toast.error(t('account.avatar.failed'), { description: t(key) });
  } finally {
    // Allow picking the same file again after a failure.
    input.value = '';
  }
}
</script>

<template>
  <div class="flex flex-col items-start gap-2">
    <button
      type="button"
      class="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
      :data-testid="props.testId"
      :disabled="isDisabled()"
      :aria-label="t('account.profile.changeAvatar')"
      :title="t('account.profile.changeAvatar')"
      @click="openPicker"
    >
      <Avatar :class="`border border-border bg-muted/60 ${props.sizeClass}`">
        <AvatarImage v-if="props.avatarUrl" :src="props.avatarUrl" :alt="props.initials" />
        <AvatarFallback class="text-xl font-semibold">{{ props.initials }}</AvatarFallback>
      </Avatar>
      <span
        class="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden="true"
      >
        <Camera class="h-5 w-5" />
      </span>
    </button>
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      :data-testid="`${props.testId}-input`"
      @change="handleFile"
    />
    <p class="text-xs text-muted-foreground">
      {{
        isUploading ? t('account.avatar.uploading') : t('account.profile.avatarRecommendation')
      }}
    </p>
  </div>
</template>
