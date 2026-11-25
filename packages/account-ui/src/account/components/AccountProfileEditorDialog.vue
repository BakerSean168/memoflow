<script setup lang="ts">
/**
 * AccountProfileEditorDialog — inline profile editing with an unsaved-change guard
 * (Issue #857; visual redesign in Issue #1093).
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
import { CircleAlert, CircleCheck, LoaderCircle, X } from '@lucide/vue';
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

/** Presentational save feedback; the write itself still lives in `useAccount`. */
type SavePhase = 'idle' | 'saving' | 'success' | 'error';

const draft = reactive<ProfileDraft>({ nickname: '', bio: '' });
const baseline = reactive<ProfileDraft>({ nickname: '', bio: '' });
const saving = ref(false);
const savePhase = ref<SavePhase>('idle');
/** True after a blocked close attempt; reddens the bar until the next edit. */
const guardAlert = ref(false);
/** Blocked close attempts; also the shake counter exposed for tests. */
const shakeAttempts = ref(0);
const nicknameInput = ref<InstanceType<typeof Input> | null>(null);
const surface = ref<HTMLElement | null>(null);

// Mirrors AccountProfile.validate: raw String.length (UTF-16 code units), no trim.
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 20;
const BIO_MAX_LENGTH = 500;

const isDirty = computed(() => draft.nickname !== baseline.nickname || draft.bio !== baseline.bio);
const initials = computed(() => (draft.nickname || 'DU').slice(0, 2).toUpperCase());
const isNicknameValid = computed(() => {
  const { length } = draft.nickname;
  return length >= NICKNAME_MIN_LENGTH && length <= NICKNAME_MAX_LENGTH;
});
const canSave = computed(() => isDirty.value && isNicknameValid.value && !saving.value);
const fieldsDisabled = computed(() => saving.value || (!currentAccount.value && isLoading.value));
const saveStatusText = computed(() => {
  switch (savePhase.value) {
    case 'saving':
      return t('account.profileEditor.saving');
    case 'success':
      return t('account.toast.profileUpdated');
    case 'error':
      return t('account.toast.updateProfileFailed');
    default:
      return '';
  }
});

function persistedDraft(): ProfileDraft {
  const profile = currentAccount.value?.profile;
  return { nickname: profile?.nickname ?? '', bio: profile?.bio ?? '' };
}

/**
 * True while `adoptPersistedProfile` writes the draft. The draft watcher treats
 * those writes as not-an-edit so a just-saved status line is not cleared.
 */
let applyingPersisted = false;

/** Adopt the persisted account values as both the draft and the reset target. */
function adoptPersistedProfile(): void {
  const next = persistedDraft();
  applyingPersisted = true;
  draft.nickname = next.nickname;
  draft.bio = next.bio;
  baseline.nickname = next.nickname;
  baseline.bio = next.bio;
  guardAlert.value = false;
  void nextTick(() => {
    applyingPersisted = false;
  });
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
    savePhase.value = 'idle';
    if (open) void hydrate();
  },
  { immediate: true },
);

// A new edit acknowledges the previous blocked-close warning and any save result.
watch([() => draft.nickname, () => draft.bio], () => {
  guardAlert.value = false;
  if (!saving.value && !applyingPersisted) savePhase.value = 'idle';
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
  savePhase.value = 'idle';
}

async function handleSave(): Promise<void> {
  if (!canSave.value) return;
  saving.value = true;
  savePhase.value = 'saving';
  try {
    const saved = await updateMyProfile({
      nickname: draft.nickname,
      bio: draft.bio || null,
    });
    // A failed save keeps the draft and the bar so the user can retry; the
    // existing toast from `useAccount` reports the failure.
    if (saved) {
      adoptPersistedProfile();
      savePhase.value = 'success';
    } else {
      savePhase.value = 'error';
    }
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
      class="flex max-h-[min(88vh,620px)] w-[calc(100vw-2rem)] max-w-[440px] flex-col gap-0 overflow-hidden rounded-2xl p-0"
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
        <header class="flex shrink-0 items-start justify-between gap-4 px-6 pt-6 pb-2">
          <div class="min-w-0 space-y-1">
            <DialogTitle class="text-base leading-6 font-semibold tracking-[-0.01em]">
              {{ t('account.profileEditor.title') }}
            </DialogTitle>
            <DialogDescription class="text-sm leading-5 text-muted-foreground">
              {{ t('account.profileEditor.description') }}
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-8 shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground"
            :aria-label="t('common.close')"
            :disabled="saving"
            data-testid="profile-editor-close"
            @click="requestClose"
          >
            <X class="size-4" aria-hidden="true" />
          </Button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6">
          <div class="flex flex-col gap-6">
            <AccountAvatarUploader
              :avatar-url="avatarUrl"
              :initials="initials"
              :disabled="fieldsDisabled"
              size-class="h-16 w-16"
              test-id="profile-editor-avatar"
            />

            <div class="flex flex-col gap-2">
              <Label for="profile-editor-nickname" class="text-sm font-medium">
                {{ t('account.profile.nickname') }}
              </Label>
              <Input
                id="profile-editor-nickname"
                ref="nicknameInput"
                v-model="draft.nickname"
                data-testid="profile-editor-nickname"
                :placeholder="t('account.placeholder.nickname')"
                :disabled="fieldsDisabled"
                :aria-invalid="!isNicknameValid"
                :aria-describedby="!isNicknameValid ? 'profile-editor-nickname-hint' : undefined"
                :maxlength="NICKNAME_MAX_LENGTH"
                class="aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive"
              />
              <div class="flex items-start justify-between gap-3">
                <p
                  v-if="!isNicknameValid"
                  id="profile-editor-nickname-hint"
                  class="flex items-start gap-1.5 text-xs leading-5 text-destructive"
                  data-testid="profile-editor-nickname-hint"
                  role="alert"
                >
                  <CircleAlert class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>{{ t('account.profileEditor.nicknameHint') }}</span>
                </p>
                <span class="flex-1" aria-hidden="true" />
                <span
                  class="shrink-0 text-xs leading-5 text-muted-foreground tabular-nums"
                  data-testid="profile-editor-nickname-count"
                >
                  {{ draft.nickname.length }}/{{ NICKNAME_MAX_LENGTH }}
                </span>
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <Label for="profile-editor-bio" class="text-sm font-medium">
                {{ t('account.profile.bio') }}
              </Label>
              <Textarea
                id="profile-editor-bio"
                v-model="draft.bio"
                class="resize-none"
                data-testid="profile-editor-bio"
                :placeholder="t('account.placeholder.bio')"
                :disabled="fieldsDisabled"
                :maxlength="BIO_MAX_LENGTH"
                rows="4"
              />
              <div class="flex items-center justify-end">
                <span
                  class="text-xs leading-5 text-muted-foreground tabular-nums"
                  data-testid="profile-editor-bio-count"
                >
                  {{ draft.bio.length }}/{{ BIO_MAX_LENGTH }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="savePhase !== 'idle'"
          class="flex shrink-0 items-start gap-2 px-6 text-xs leading-5"
          :class="[isDirty ? 'pb-3' : 'pb-6', savePhase === 'error' ? 'text-destructive' : '']"
          :data-phase="savePhase"
          data-testid="profile-editor-status"
          :role="savePhase === 'error' ? 'alert' : 'status'"
          aria-live="polite"
        >
          <LoaderCircle
            v-if="savePhase === 'saving'"
            class="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <CircleAlert
            v-else-if="savePhase === 'error'"
            class="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <CircleCheck v-else class="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
          <span :class="savePhase === 'saving' ? 'text-muted-foreground' : ''">
            {{ saveStatusText }}
          </span>
        </div>

        <footer
          v-if="isDirty"
          class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/60 px-6 py-4"
          data-testid="profile-editor-footer"
        >
          <p
            class="flex min-w-0 items-start gap-1.5 text-xs leading-5"
            :class="guardAlert ? 'text-destructive' : 'text-muted-foreground'"
            data-testid="profile-editor-prompt"
            role="status"
            aria-live="polite"
          >
            <CircleAlert v-if="guardAlert" class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span data-testid="profile-editor-prompt-text">
              {{ t('account.profileEditor.unsaved') }}
            </span>
          </p>
          <div class="ms-auto flex shrink-0 items-center gap-2">
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
              <LoaderCircle v-if="saving" class="mr-2 size-4 animate-spin" aria-hidden="true" />
              {{ saving ? t('account.profileEditor.saving') : t('account.profileEditor.save') }}
            </Button>
          </div>
        </footer>
      </div>
    </DialogContent>
  </Dialog>
</template>
