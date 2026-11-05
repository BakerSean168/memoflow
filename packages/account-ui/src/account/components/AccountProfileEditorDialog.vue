<script setup lang="ts">
/**
 * AccountProfileEditorDialog — inline profile editing with an unsaved-change guard
 * (Issue #857).
 *
 * The shell account card only raises `ProfileEditorIntent`; AppShell owns the
 * intent and renders this dialog with `v-model:open`. Fields are inputs from the
 * first paint (no read-then-edit step) and saving reuses the settings profile
 * path (`useAccount().updateMyProfile`) so nickname/bio persist to the active
 * account exactly once, for local and cloud Profiles alike.
 *
 * Guard: from the first edit a persistent bar offers Reset/Save. Closing via the
 * X button, the backdrop or Escape shakes the dialog and reddens the bar instead
 * of discarding the draft. Avatar clicks persist immediately through
 * `AccountAvatarUploader`, so they are not part of the draft.
 */
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@memoflow/ui-vue-shadcn';
import { LoaderCircle, X } from '@lucide/vue';
import { useAccount } from '../composables/useAccount';
import { useAccountAvatar } from '../avatar/useAccountAvatar';
import AccountAvatarUploader from './AccountAvatarUploader.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (event: 'update:open', value: boolean): void }>();

const { t } = useI18n();

const { currentAccount, isLoading, loadMyProfile, updateMyProfile } = useAccount();
const { avatarUrl } = useAccountAvatar(() => currentAccount.value?.profile?.avatarUrl ?? null);

interface ProfileDraft {
  nickname: string;
  bio: string;
}

const draft = reactive<ProfileDraft>({ nickname: '', bio: '' });
const baseline = reactive<ProfileDraft>({ nickname: '', bio: '' });
const saving = ref(false);
/** True after a blocked close attempt; reddens the bar until the next edit. */
const guardAlert = ref(false);
/** Blocked close attempts; also the shake counter exposed for tests. */
const shakeAttempts = ref(0);
const nicknameInput = ref<InstanceType<typeof Input> | null>(null);
const surface = ref<HTMLElement | null>(null);

const isDirty = computed(() => draft.nickname !== baseline.nickname || draft.bio !== baseline.bio);
const initials = computed(() => (draft.nickname || 'DU').slice(0, 2).toUpperCase());
const canSave = computed(() => isDirty.value && draft.nickname.trim().length > 0 && !saving.value);
const fieldsDisabled = computed(() => saving.value || (!currentAccount.value && isLoading.value));

function persistedDraft(): ProfileDraft {
  const profile = currentAccount.value?.profile;
  return { nickname: profile?.nickname ?? '', bio: profile?.bio ?? '' };
}

/** Adopt the persisted account values as both the draft and the reset target. */
function adoptPersistedProfile(): void {
  const next = persistedDraft();
  draft.nickname = next.nickname;
  draft.bio = next.bio;
  baseline.nickname = next.nickname;
  baseline.bio = next.bio;
  guardAlert.value = false;
}

async function hydrate(): Promise<void> {
  if (!currentAccount.value) await loadMyProfile();
  if (props.open) adoptPersistedProfile();
}

watch(
  () => props.open,
  (open) => {
    shakeAttempts.value = 0;
    guardAlert.value = false;
    if (open) void hydrate();
  },
  { immediate: true },
);

// A new edit acknowledges the previous blocked-close warning.
watch([() => draft.nickname, () => draft.bio], () => {
  guardAlert.value = false;
});

/**
 * Shake the dialog surface. The Web Animations API is used instead of a
 * stylesheet class because the account-ui library emits its CSS separately from
 * the app bundles; a keyframe here must not depend on a build import.
 */
function playShake(): void {
  shakeAttempts.value += 1;
  const element = surface.value;
  if (!element || typeof element.animate !== 'function') return;
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }
  element.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-7px)', offset: 0.2 },
      { transform: 'translateX(6px)', offset: 0.4 },
      { transform: 'translateX(-4px)', offset: 0.6 },
      { transform: 'translateX(3px)', offset: 0.8 },
      { transform: 'translateX(0)' },
    ],
    { duration: 360, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' },
  );
}

function blockDismiss(): void {
  guardAlert.value = true;
  playShake();
}

function requestClose(): void {
  if (saving.value) return;
  if (isDirty.value) {
    blockDismiss();
    return;
  }
  emit('update:open', false);
}

function handleOpenChange(value: boolean): void {
  if (value) emit('update:open', true);
  else requestClose();
}

function handleEscapeKeyDown(event: KeyboardEvent): void {
  if (!isDirty.value) return;
  event.preventDefault();
  if (!saving.value) blockDismiss();
}

function handlePointerDownOutside(event: Event): void {
  if (!isDirty.value) return;
  event.preventDefault();
  if (!saving.value) blockDismiss();
}

function handleReset(): void {
  if (saving.value) return;
  draft.nickname = baseline.nickname;
  draft.bio = baseline.bio;
  guardAlert.value = false;
}

async function handleSave(): Promise<void> {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const saved = await updateMyProfile({
      nickname: draft.nickname,
      bio: draft.bio || null,
    });
    // A failed save keeps the draft and the bar so the user can retry; the
    // existing toast from `useAccount` reports the failure.
    if (saved) adoptPersistedProfile();
  } finally {
    saving.value = false;
  }
}

function focusNickname(event: Event): void {
  event.preventDefault();
  void nextTick(() => {
    const element = nicknameInput.value?.$el as HTMLElement | undefined;
    element?.focus?.({ preventScroll: true });
  });
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="flex max-h-[min(88vh,620px)] flex-col gap-0 overflow-hidden rounded-2xl border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface-overlay))] p-0 sm:max-w-[420px]"
      @escape-key-down="handleEscapeKeyDown"
      @pointer-down-outside="handlePointerDownOutside"
      @open-auto-focus="focusNickname"
    >
      <div
        ref="surface"
        class="flex min-h-0 flex-1 flex-col"
        data-testid="profile-editor-dialog"
        :data-guard="guardAlert ? 'alert' : 'idle'"
        :data-shake-attempts="shakeAttempts"
      >
        <div
          class="flex shrink-0 items-start justify-between gap-4 border-b border-[hsl(var(--border-subtle))] px-5 py-4"
        >
          <div class="min-w-0 space-y-1">
            <DialogTitle class="text-[16px] font-semibold tracking-[-0.015em]">
              {{ t('account.profileEditor.title') }}
            </DialogTitle>
            <DialogDescription class="text-[12px] leading-5 text-muted-foreground">
              {{ t('account.profileEditor.description') }}
            </DialogDescription>
          </div>
          <button
            type="button"
            class="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            :aria-label="t('common.close')"
            :disabled="saving"
            data-testid="profile-editor-close"
            @click="requestClose"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>

        <div class="min-h-0 flex-1 space-y-4 overflow-hidden px-5 py-5">
          <AccountAvatarUploader
            :avatar-url="avatarUrl"
            :initials="initials"
            :disabled="fieldsDisabled"
            size-class="h-16 w-16"
            test-id="profile-editor-avatar"
          />

          <div class="space-y-1.5">
            <Label for="profile-editor-nickname">{{ t('account.profile.nickname') }}</Label>
            <Input
              id="profile-editor-nickname"
              ref="nicknameInput"
              v-model="draft.nickname"
              data-testid="profile-editor-nickname"
              :placeholder="t('account.placeholder.nickname')"
              :disabled="fieldsDisabled"
              maxlength="100"
            />
          </div>

          <div class="space-y-1.5">
            <Label for="profile-editor-bio">{{ t('account.profile.bio') }}</Label>
            <Textarea
              id="profile-editor-bio"
              v-model="draft.bio"
              class="min-h-[76px] resize-none"
              data-testid="profile-editor-bio"
              :placeholder="t('account.placeholder.bio')"
              :disabled="fieldsDisabled"
              maxlength="500"
              rows="3"
            />
          </div>
        </div>

        <div
          v-if="isDirty"
          class="shrink-0 border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--surface)/0.72)] px-5 py-3"
          data-testid="profile-editor-footer"
        >
          <div
            class="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors"
            :class="
              guardAlert
                ? 'border-destructive bg-destructive/10 ring-1 ring-destructive/40'
                : 'border-[hsl(var(--border-subtle))] bg-background'
            "
            data-testid="profile-editor-prompt"
            role="status"
            aria-live="polite"
          >
            <p class="text-[13px] font-medium" data-testid="profile-editor-prompt-text">
              {{ t('account.profileEditor.unsaved') }}
            </p>
            <div class="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                :disabled="saving"
                data-testid="profile-editor-reset"
                @click="handleReset"
              >
                {{ t('account.profileEditor.reset') }}
              </Button>
              <Button
                size="sm"
                :disabled="!canSave"
                data-testid="profile-editor-save"
                @click="handleSave"
              >
                <LoaderCircle v-if="saving" class="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {{ saving ? t('account.profileEditor.saving') : t('account.profileEditor.save') }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
