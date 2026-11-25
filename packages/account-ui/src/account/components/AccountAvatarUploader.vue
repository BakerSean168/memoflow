<script setup lang="ts">
/**
 * AccountAvatarUploader — click-to-upload avatar control (Issue #858).
 *
 * One component owns the whole interaction: click the avatar, pick an image,
 * normalize it, persist it through the platform avatar port and preview the
 * result immediately. Reused by the settings profile card today and by the
 * edit-profile dialog (#857) later.
 *
 * Visual states (#1093): empty (initials fallback), stored image, hover/focus
 * camera affordance, uploading (blocked picker + spinner), and an inline
 * failure line next to the recommendation so the error does not live only in a
 * toast.
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { Camera, CircleAlert, LoaderCircle } from '@lucide/vue';
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
const { upload, isUploading, hasStore, cloudSyncFailed } = useAccountAvatar();
const fileInput = ref<HTMLInputElement | null>(null);
const uploadFailure = ref<string | null>(null);

const errorKeys: Record<AvatarImageErrorCode, string> = {
  'invalid-type': 'account.avatar.invalidType',
  'decode-failed': 'account.avatar.decodeFailed',
  'encode-failed': 'account.avatar.encodeFailed',
};

const isDisabled = () => props.disabled || isUploading.value || !hasStore;
const helperText = computed(() => {
  if (isUploading.value) return t('account.avatar.uploading');
  if (uploadFailure.value) return uploadFailure.value;
  return t('account.profile.avatarRecommendation');
});

// Issue #859: the local save already succeeded; a failed background upload only
// shows the short retry notice so the user is never blocked.
watch(cloudSyncFailed, () => {
  toast.error(t('account.avatar.cloudSyncFailed'));
});

function openPicker(): void {
  if (isDisabled()) return;
  uploadFailure.value = null;
  fileInput.value?.click();
}

async function handleFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploadFailure.value = null;
  try {
    const url = await upload(file);
    if (url) {
      emit('updated', url);
      toast.success(t('account.avatar.saved'));
    }
  } catch (error) {
    const key = error instanceof AvatarImageError ? errorKeys[error.code] : 'account.avatar.failed';
    uploadFailure.value = `${t('account.avatar.failed')}: ${t(key)}`;
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
      :aria-busy="isUploading"
      :aria-label="t('account.profile.changeAvatar')"
      :title="t('account.profile.changeAvatar')"
      @click="openPicker"
    >
      <Avatar :class="`border border-border bg-muted/60 ${props.sizeClass}`">
        <AvatarImage v-if="props.avatarUrl" :src="props.avatarUrl" :alt="props.initials" />
        <AvatarFallback class="text-xl font-semibold">{{ props.initials }}</AvatarFallback>
      </Avatar>
      <span
        class="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/55 text-background transition-opacity"
        :class="
          isUploading
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
        "
        aria-hidden="true"
      >
        <LoaderCircle v-if="isUploading" class="size-5 animate-spin" />
        <Camera v-else class="size-5" />
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
    <p
      class="flex items-start gap-1.5 text-xs leading-5"
      :class="uploadFailure ? 'text-destructive' : 'text-muted-foreground'"
      :data-state="isUploading ? 'uploading' : uploadFailure ? 'error' : 'idle'"
      :data-testid="`${props.testId}-helper`"
      aria-live="polite"
    >
      <CircleAlert v-if="uploadFailure" class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{{ helperText }}</span>
    </p>
  </div>
</template>
