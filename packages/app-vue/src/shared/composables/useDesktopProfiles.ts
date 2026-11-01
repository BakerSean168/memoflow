import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { z } from 'zod';
import {
  CloudAuthChannels,
  ProfileAccessChannels,
  WindowChannels,
  type ProfileSummary,
} from '@memoflow/desktop-contracts';
import { useConfirm } from '@memoflow/ui-vue-shadcn';
import { DESKTOP_BRIDGE_KEY } from '../../di/keys';
import { translateResultError } from '../utils/translate-result-error';

const profileSchema = z.object({
  profileId: z.string(),
  profileKind: z.enum(['local', 'registered']),
  displayName: z.string(),
  avatarSeed: z.string(),
  identifierHint: z.string().nullable(),
  cloudAccountId: z.string().nullable(),
  lastActiveAt: z.number(),
  hasCredential: z.boolean(),
  remembered: z.boolean(),
});
const snapshotSchema = z.object({
  profile: profileSchema.nullable(),
  unlockState: z.enum(['LOCKED', 'UNLOCKED']),
  cloudState: z.enum(['UNBOUND', 'CHECKING', 'ONLINE', 'OFFLINE', 'REAUTH_REQUIRED']),
  capabilities: z.object({
    local: z.boolean(),
    sync: z.boolean(),
    cloudAi: z.boolean(),
    repositoryConnection: z.boolean(),
  }),
});
/** The signed-in Profile the main process opened for the identity window. */
const openedProfileSchema = z.object({ profileId: z.string().min(1) });
/**
 * The device-authorization attempt snapshot. Only the fields the identity
 * window reacts to are read; the rest of the shape belongs to the workspace
 * cloud-connection dialog.
 */
const signInAttemptSchema = z.object({
  attemptId: z.string(),
  status: z.enum([
    'requesting_code',
    'awaiting_authorization',
    'connecting_profile',
    'connected',
    'denied',
    'expired',
    'cancelled',
    'failed',
  ]),
  result: z.object({ targetProfileId: z.string(), activation: z.string() }).nullable(),
  userCode: z.string(),
  verificationUrl: z.string(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});

/**
 * States the identity window swaps inside one window. `login` and `register`
 * are the formal sign-in/registration surfaces; `password` is the per-tile
 * unlock state of a local account.
 */
export type DesktopAccessView = 'select' | 'password' | 'login' | 'register';
export type DesktopRegisterMode = 'cloud' | 'local';

const GITHUB_POLL_INTERVAL_MS = 1_500;

/** Registry metadata and operations shared by the access window and workspace management. */
export function useDesktopProfiles(options: { accessWindow?: boolean } = {}) {
  const bridge = inject(DESKTOP_BRIDGE_KEY, null);
  const { t } = useI18n();
  const profiles = ref<ProfileSummary[]>([]);
  const snapshot = ref<z.infer<typeof snapshotSchema> | null>(null);
  const busyProfileId = ref<string | null>(null);
  const selectedProfileId = ref<string | null>(null);
  const password = ref('');
  const remember = ref(false);
  const newName = ref('');
  const newPassword = ref('');
  const editingProfileId = ref<string | null>(null);
  const editName = ref('');
  const accessView = ref<DesktopAccessView>('select');

  // Sign-in state: cloud email/password, and the GitHub device attempt.
  const loginEmail = ref('');
  const loginPassword = ref('');
  const loginRemember = ref(true);
  const signInBusy = ref(false);
  const githubPending = ref(false);
  const githubUserCode = ref('');
  const githubAttemptId = ref<string | null>(null);
  let githubPollTimer: ReturnType<typeof setTimeout> | null = null;

  // Registration state: one form shape, two backends (cloud / local account).
  const registerMode = ref<DesktopRegisterMode>('cloud');
  const registerEmail = ref('');
  const registerName = ref('');
  const registerPassword = ref('');
  const registerPasswordConfirm = ref('');
  const registerBusy = ref(false);

  const passwordTarget = computed(
    () => profiles.value.find((profile) => profile.profileId === selectedProfileId.value) ?? null,
  );
  const sortedProfiles = computed(() =>
    [...profiles.value].sort((a, b) => {
      const active = snapshot.value?.profile?.profileId;
      return (
        Number(b.profileId === active) - Number(a.profileId === active) ||
        b.lastActiveAt - a.lastActiveAt
      );
    }),
  );

  async function invoke<T>(
    channel: string,
    schema: z.ZodType<T>,
    ...args: unknown[]
  ): Promise<{ data: T } | null> {
    return invokeScoped(channel, schema, {}, ...args);
  }

  async function invokeScoped<T>(
    channel: string,
    schema: z.ZodType<T>,
    options: { scope?: string; silent?: boolean },
    ...args: unknown[]
  ): Promise<{ data: T } | null> {
    if (!bridge) return null;
    try {
      const result = z
        .object({
          ok: z.boolean(),
          data: schema.optional(),
          error: z.object({ code: z.string(), message: z.string() }).passthrough().optional(),
        })
        .parse(await bridge.invoke(channel, ...args));
      if (!result.ok) throw result.error ?? new Error(t('common.operationFailed'));
      return { data: schema.parse(result.data) };
    } catch (error) {
      if (!options.silent)
        toast.error(
          translateResultError(error, t, {
            scope: options.scope,
            fallbackKey: 'common.operationFailed',
          }),
        );
      return null;
    }
  }

  async function refreshProfiles(): Promise<void> {
    const list = await invoke(ProfileAccessChannels.LIST, z.array(profileSchema));
    const access = await invoke(ProfileAccessChannels.GET_SNAPSHOT, snapshotSchema);
    if (list) profiles.value = list.data;
    if (access) snapshot.value = access.data;
  }

  async function navigate(profile: ProfileSummary): Promise<boolean> {
    if (!options.accessWindow) {
      // The host destroys the outgoing renderer and stops schedulers before opening by ID.
      // Protected targets arrive preselected at Profile Access; metadata never authorizes access.
      return !!(await invoke(
        WindowChannels.TRANSITION_TO_PROFILE_ACCESS,
        z.unknown(),
        profile.profileId,
      ));
    }
    return selectAndEnter(profile);
  }

  /**
   * Select a Profile and, when the main process accepts it, enter the workspace.
   * `password` is only sent when the caller verified it; a local account without
   * one relies on the remembered safeStorage key copy held by the main process.
   */
  async function selectAndEnter(
    profile: ProfileSummary,
    credentials: { password?: string } = {},
  ): Promise<boolean> {
    const opened = await invoke(
      ProfileAccessChannels.SELECT,
      z.unknown(),
      credentials.password === undefined
        ? { profileId: profile.profileId }
        : {
            profileId: profile.profileId,
            password: credentials.password,
            remember: remember.value,
          },
    );
    if (!opened) return false;
    return !!(await invoke(WindowChannels.TRANSITION_TO_MAIN, z.unknown()));
  }

  /**
   * Tile routing for the access window. A registered Profile and a local account
   * whose data key is still remembered open directly; every other local account
   * asks for its password inside the window.
   */
  async function selectProfile(profile: ProfileSummary): Promise<void> {
    if (busyProfileId.value) return;
    if (!options.accessWindow) {
      await openProfile(profile);
      return;
    }
    if (profile.profileKind === 'registered' || profile.remembered) {
      busyProfileId.value = profile.profileId;
      if (await selectAndEnter(profile)) return;
      busyProfileId.value = null;
      // A registered Profile keeps its existing re-authentication presentation in
      // the workspace. A remembered key that safeStorage can no longer unseal
      // falls through to the password state; the copy is never deleted here.
      if (profile.profileKind === 'registered') return;
    }
    enterPasswordState(profile);
  }

  function enterPasswordState(profile: ProfileSummary): void {
    selectedProfileId.value = profile.profileId;
    password.value = '';
    remember.value = false;
    accessView.value = 'password';
  }

  /** The "+" tile: the formal sign-in surface, not an inline account form. */
  function enterLoginState(): void {
    resetSignInState();
    accessView.value = 'login';
  }

  function enterRegisterState(mode: DesktopRegisterMode = 'cloud'): void {
    resetRegisterState();
    registerMode.value = mode;
    accessView.value = 'register';
  }

  function backToSelect(): void {
    resetSignInState();
    resetRegisterState();
    accessView.value = 'select';
    selectedProfileId.value = null;
    password.value = '';
    remember.value = false;
  }

  function resetSignInState(): void {
    stopGithubPolling();
    loginEmail.value = '';
    loginPassword.value = '';
    loginRemember.value = true;
    signInBusy.value = false;
    githubPending.value = false;
    githubUserCode.value = '';
    githubAttemptId.value = null;
  }

  function resetRegisterState(): void {
    registerEmail.value = '';
    registerName.value = '';
    registerPassword.value = '';
    registerPasswordConfirm.value = '';
    registerBusy.value = false;
  }

  /**
   * The main process registers or finds the Profile for the signed-in cloud
   * account, adopts the session and opens the Profile; the window only asks for
   * the transition once that commit succeeded.
   */
  async function enterOpenedProfile(): Promise<boolean> {
    return !!(await invoke(WindowChannels.TRANSITION_TO_MAIN, z.unknown()));
  }

  /**
   * The registration state is taller than the rest of the identity window.
   * The main process applies it as a layout-only height and keeps persisting
   * the base height, so the next launch does not open in the taller state.
   */
  async function setAccessWindowHeight(height: 640 | 780): Promise<void> {
    if (!options.accessWindow) return;
    await invokeScoped(
      WindowChannels.SET_PROFILE_ACCESS_HEIGHT,
      z.unknown(),
      { silent: true },
      { height },
    );
  }

  async function signInWithPassword(): Promise<void> {
    if (signInBusy.value) return;
    const email = loginEmail.value.trim();
    if (!email || !loginPassword.value) {
      toast.error(t('auth.validation.passwordRequired'));
      return;
    }
    signInBusy.value = true;
    try {
      const result = await invokeScoped(
        CloudAuthChannels.SIGN_IN,
        openedProfileSchema,
        { scope: 'auth' },
        { email, password: loginPassword.value, remember: loginRemember.value },
      );
      // The password never outlives the request, on success or failure.
      loginPassword.value = '';
      if (result) await enterOpenedProfile();
    } finally {
      signInBusy.value = false;
    }
  }

  async function forgotPassword(): Promise<void> {
    await invokeScoped(CloudAuthChannels.FORGOT_PASSWORD, z.unknown(), { scope: 'auth' });
  }

  /**
   * GitHub sign-in reuses the device-authorization page, which already offers
   * GitHub. The main process starts an attempt without an origin Profile and
   * commits the same register-and-open path the password form uses.
   */
  async function signInWithGithub(): Promise<void> {
    if (githubPending.value || signInBusy.value) return;
    const started = await invokeScoped(
      CloudAuthChannels.GITHUB_SIGN_IN_BEGIN,
      signInAttemptSchema,
      { scope: 'auth' },
      { remember: loginRemember.value },
    );
    if (!started) return;
    githubAttemptId.value = started.data.attemptId;
    githubUserCode.value = started.data.userCode;
    githubPending.value = true;
    scheduleGithubPoll();
  }

  function scheduleGithubPoll(): void {
    stopGithubPolling();
    githubPollTimer = setTimeout(() => {
      void pollGithubAttempt();
    }, GITHUB_POLL_INTERVAL_MS);
  }

  async function pollGithubAttempt(): Promise<void> {
    const attemptId = githubAttemptId.value;
    if (!attemptId || !githubPending.value) return;
    const status = await invokeScoped(
      CloudAuthChannels.CLOUD_CONNECTION_STATUS,
      signInAttemptSchema,
      { scope: 'auth', silent: true },
      { attemptId },
    );
    if (!githubPending.value || githubAttemptId.value !== attemptId) return;
    if (!status) {
      // A transport hiccup is not a verdict: keep the waiting state and retry.
      scheduleGithubPoll();
      return;
    }
    const attempt = status.data;
    if (attempt.status === 'connected' && attempt.result) {
      githubPending.value = false;
      githubAttemptId.value = null;
      await enterOpenedProfile();
      return;
    }
    if (['denied', 'expired', 'cancelled', 'failed'].includes(attempt.status)) {
      githubPending.value = false;
      githubAttemptId.value = null;
      toast.error(
        attempt.error?.code
          ? translateResultError(attempt.error, t, { scope: 'auth' })
          : t('auth.profileAccess.githubFailed'),
      );
      return;
    }
    scheduleGithubPoll();
  }

  async function cancelGithubSignIn(): Promise<void> {
    const attemptId = githubAttemptId.value;
    stopGithubPolling();
    githubPending.value = false;
    githubUserCode.value = '';
    githubAttemptId.value = null;
    if (attemptId)
      await invokeScoped(
        CloudAuthChannels.CLOUD_CONNECTION_CANCEL,
        z.unknown(),
        { scope: 'auth', silent: true },
        { attemptId },
      );
  }

  function stopGithubPolling(): void {
    if (githubPollTimer) {
      clearTimeout(githubPollTimer);
      githubPollTimer = null;
    }
  }

  /**
   * Cloud registration signs up, adopts the session and enters; the user never
   * has to sign in again. Server-side password rules are echoed verbatim.
   */
  async function submitCloudRegistration(): Promise<void> {
    if (registerBusy.value) return;
    const email = registerEmail.value.trim();
    if (!email || !registerPassword.value) {
      toast.error(t('auth.validation.passwordRequired'));
      return;
    }
    if (registerPassword.value !== registerPasswordConfirm.value) {
      toast.error(t('auth.profileAccess.passwordMismatch'));
      return;
    }
    registerBusy.value = true;
    try {
      const result = await invokeScoped(
        CloudAuthChannels.SIGN_UP,
        openedProfileSchema,
        { scope: 'auth' },
        {
          email,
          password: registerPassword.value,
          name: registerName.value.trim() || undefined,
          remember: loginRemember.value,
        },
      );
      registerPassword.value = '';
      registerPasswordConfirm.value = '';
      if (result) await enterOpenedProfile();
    } finally {
      registerBusy.value = false;
    }
  }

  /**
   * Local registration creates the first-segment local account and enters.
   * The password rule is length 8–100 only, as decided for local accounts.
   */
  async function submitLocalRegistration(): Promise<void> {
    if (registerBusy.value) return;
    const displayName = registerName.value.trim();
    if (!displayName || registerPassword.value.length < 8) {
      toast.error(t('auth.profileAccess.createInvalid'));
      return;
    }
    if (registerPassword.value !== registerPasswordConfirm.value) {
      toast.error(t('auth.profileAccess.passwordMismatch'));
      return;
    }
    registerBusy.value = true;
    const createdPassword = registerPassword.value;
    try {
      const created = await invoke(
        ProfileAccessChannels.CREATE_LOCAL_ACCOUNT,
        profileSchema,
        { displayName, password: createdPassword },
      );
      registerPassword.value = '';
      registerPasswordConfirm.value = '';
      if (!created) return;
      registerName.value = '';
      await refreshProfiles();
      await selectAndEnter(created.data, { password: createdPassword });
    } finally {
      registerBusy.value = false;
    }
  }

  async function submitPassword(): Promise<void> {
    const profile = passwordTarget.value;
    if (!profile || busyProfileId.value) return;
    if (password.value.length < 8) {
      toast.error(t('auth.profileAccess.passwordRequired'));
      return;
    }
    busyProfileId.value = profile.profileId;
    const entered = await selectAndEnter(profile, { password: password.value });
    if (!entered) busyProfileId.value = null;
    password.value = '';
  }

  async function openProfile(profile: ProfileSummary): Promise<void> {
    if (
      busyProfileId.value ||
      (!options.accessWindow && snapshot.value?.profile?.profileId === profile.profileId)
    )
      return;
    busyProfileId.value = profile.profileId;
    try {
      if (!(await navigate(profile))) busyProfileId.value = null;
    } finally {
      password.value = '';
    }
  }

  async function switchProfile(profileId: string): Promise<void> {
    const profile = profiles.value.find((item) => item.profileId === profileId);
    if (profile) await openProfile(profile);
  }

  /** Workspace account management keeps its single-password create row. */
  async function createLocalAccount(): Promise<void> {
    if (busyProfileId.value) return;
    if (!newName.value.trim() || newPassword.value.length < 8) {
      toast.error(t('auth.profileAccess.createInvalid'));
      return;
    }
    const createdPassword = newPassword.value;
    busyProfileId.value = 'creating';
    try {
      const created = await invoke(ProfileAccessChannels.CREATE_LOCAL_ACCOUNT, profileSchema, {
        displayName: newName.value.trim(),
        password: createdPassword,
      });
      if (!created) return;
      newName.value = '';
      newPassword.value = '';
      await refreshProfiles();
      const entered = options.accessWindow
        ? await selectAndEnter(created.data, { password: createdPassword })
        : await navigate(created.data);
      if (entered) busyProfileId.value = created.data.profileId;
    } finally {
      if (busyProfileId.value === 'creating') busyProfileId.value = null;
    }
  }

  async function renameProfile(profile: ProfileSummary): Promise<void> {
    if (busyProfileId.value) return;
    busyProfileId.value = profile.profileId;
    try {
      if (
        await invoke(ProfileAccessChannels.RENAME, z.unknown(), {
          profileId: profile.profileId,
          displayName: editName.value.trim(),
        })
      ) {
        editingProfileId.value = null;
        await refreshProfiles();
      }
    } finally {
      busyProfileId.value = null;
    }
  }

  async function removeProfile(profile: ProfileSummary): Promise<void> {
    if (busyProfileId.value || snapshot.value?.profile?.profileId === profile.profileId) return;
    const confirmed = await useConfirm({
      title: t('auth.profileAccess.removeConfirmTitle'),
      description: t('auth.profileAccess.removeConfirm', { name: profile.displayName }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      variant: 'destructive',
    });
    if (!confirmed) return;
    busyProfileId.value = profile.profileId;
    try {
      if (
        await invoke(ProfileAccessChannels.REMOVE, z.unknown(), { profileId: profile.profileId })
      ) {
        toast.success(t('auth.profileAccess.removed'));
        await refreshProfiles();
      }
    } finally {
      busyProfileId.value = null;
    }
  }

  return {
    profiles: sortedProfiles,
    snapshot,
    busyProfileId,
    selectedProfileId,
    passwordTarget,
    accessView,
    password,
    remember,
    newName,
    newPassword,
    editingProfileId,
    editName,
    loginEmail,
    loginPassword,
    loginRemember,
    signInBusy,
    githubPending,
    githubUserCode,
    registerMode,
    registerEmail,
    registerName,
    registerPassword,
    registerPasswordConfirm,
    registerBusy,
    refreshProfiles,
    openProfile,
    selectProfile,
    enterPasswordState,
    enterLoginState,
    enterRegisterState,
    backToSelect,
    submitPassword,
    switchProfile,
    setAccessWindowHeight,
    signInWithPassword,
    signInWithGithub,
    cancelGithubSignIn,
    forgotPassword,
    submitCloudRegistration,
    submitLocalRegistration,
    createLocalAccount,
    renameProfile,
    removeProfile,
    disposeAuth: stopGithubPolling,
  };
}
