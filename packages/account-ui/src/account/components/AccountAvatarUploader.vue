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
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { Camera, CircleAlert, LoaderCircle } from '@lucide/vue';
import { Avatar, AvatarFallback, AvatarImage, Button, Input } from '@memoflow/ui-vue-shadcn';
import { useAccountAvatar } from '../avatar/useAccountAvatar';
import {
  AvatarImageError,
  type AvatarImageErrorCode,
  processAvatarFile,
} from '../avatar/avatar-image';

const props = withDefaults(
  defineProps<{
    avatarUrl?: string | null;
    initials: string;
    /** Tailwind size classes for the avatar circle. */
    sizeClass?: string;
    disabled?: boolean;
    testId?: string;
    /** Profile editor stages the image until its Save action. */
    deferred?: boolean;
    compact?: boolean;
  }>(),
  {
    avatarUrl: null,
    sizeClass: 'h-20 w-20',
    disabled: false,
    testId: 'account-avatar-uploader',
    deferred: false,
    compact: false,
  },
);

const emit = defineEmits<{
  (event: 'updated', url: string): void;
  (event: 'draft-change', dirty: boolean): void;
  (event: 'busy-change', busy: boolean): void;
}>();

const { t } = useI18n();
const { upload, isUploading, hasStore, cloudSyncFailed } = useAccountAvatar();
const fileInput = ref<InstanceType<typeof Input> | null>(null);
const pendingImage = ref<Blob | null>(null);
const previewUrl = ref<string | null>(null);
const preparing = ref(false);
const busy = computed(() => preparing.value || isUploading.value);
watch(busy, (value) => emit('busy-change', value), { flush: 'sync' });
function clearPreview(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = null;
}
onScopeDispose(clearPreview);
function reset(): void {
  clearPreview();
  pendingImage.value = null;
  uploadFailure.value = null;
  emit('draft-change', false);
}

const uploadFailure = ref<string | null>(null);

const errorKeys: Record<AvatarImageErrorCode, string> = {
  'invalid-type': 'account.avatar.invalidType',
  'decode-failed': 'account.avatar.decodeFailed',
  'encode-failed': 'account.avatar.encodeFailed',
};

const isDisabled = () => props.disabled || busy.value || !hasStore;
const helperText = computed(() => {
  if (busy.value) return t('account.avatar.uploading');
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
  (fileInput.value?.$el as HTMLInputElement | undefined)?.click();
}

function reportFailure(error: unknown): void {
  const key = error instanceof AvatarImageError ? errorKeys[error.code] : 'account.avatar.failed';
  uploadFailure.value = `${t('account.avatar.failed')}: ${t(key)}`;
  toast.error(t('account.avatar.failed'), { description: t(key) });
}

async function save(): Promise<boolean> {
  if (!pendingImage.value) return true;
  uploadFailure.value = null;
  try {
    const url = await upload(pendingImage.value);
    if (!url) return false;
    // Keep the preview until the parent adopts the new persisted profile.
    pendingImage.value = null;
    emit('updated', url);
    return true;
  } catch (error) {
    reportFailure(error);
    return false;
  }
}

defineExpose({ save, reset });

async function handleFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || isDisabled()) return;
  uploadFailure.value = null;
  try {
    if (props.deferred) {
      preparing.value = true;
      const image = await processAvatarFile(file);
      clearPreview();
      pendingImage.value = image;
      previewUrl.value = URL.createObjectURL(image);
      emit('draft-change', true);
    } else {
      const url = await upload(file);
      if (url) {
        emit('updated', url);
        toast.success(t('account.avatar.saved'));
      }
    }
  } catch (error) {
    reportFailure(error);
  } finally {
    preparing.value = false;
    input.value = '';
  }
}
</script>

<template>
  <div class="flex flex-col items-start gap-2">
    <Button
      type="button"
      variant="ghost"
      :class="props.sizeClass"
      class="group relative shrink-0 rounded-full p-0 hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
      :data-testid="props.testId"
      :disabled="isDisabled()"
      :aria-busy="busy"
      :aria-label="t('account.profile.changeAvatar')"
      :aria-describedby="uploadFailure ? `${props.testId}-error` : undefined"
      :title="t('account.profile.changeAvatar')"
      @click="openPicker"
    >
      <Avatar
        :class="[
          'size-full bg-muted',
          props.compact ? 'border-4 border-card' : 'border border-border',
        ]"
      >
        <AvatarImage
          v-if="previewUrl || props.avatarUrl"
          :src="previewUrl || props.avatarUrl!"
          :alt="props.initials"
        />
        <AvatarFallback class="text-xl font-semibold">{{ props.initials }}</AvatarFallback>
      </Avatar>
      <span
        class="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/55 text-background transition-opacity"
        :class="
          busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
        "
        aria-hidden="true"
      >
        <LoaderCircle v-if="busy" class="size-5 animate-spin" />
        <Camera v-else class="size-5" />
      </span>
      <span
        v-if="props.compact"
        class="absolute right-0 bottom-0 flex size-6 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground"
        aria-hidden="true"
      >
        <Camera class="size-3" />
      </span>
    </Button>
    <Input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      tabindex="-1"
      :disabled="isDisabled()"
      :aria-label="t('account.profile.changeAvatar')"
      :data-testid="`${props.testId}-input`"
      @change="handleFile"
    />
    <p
      v-if="!props.compact || busy || uploadFailure"
      :id="`${props.testId}-error`"
      :role="uploadFailure ? 'alert' : 'status'"
      class="flex items-start gap-1 text-xs leading-5"
      :class="uploadFailure ? 'text-destructive' : 'text-muted-foreground'"
      :data-state="busy ? 'uploading' : uploadFailure ? 'error' : 'idle'"
      :data-testid="`${props.testId}-helper`"
      aria-live="polite"
    >
      <CircleAlert v-if="uploadFailure" class="size-3 shrink-0" aria-hidden="true" />
      <span>{{ helperText }}</span>
    </p>
  </div>
</template>
