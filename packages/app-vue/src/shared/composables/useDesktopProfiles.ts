import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { z } from 'zod';
import {
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
}) satisfies z.ZodType<ProfileSummary>;
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
  const newPasswordConfirm = ref('');
  const editingProfileId = ref<string | null>(null);
  const editName = ref('');
  /**
   * The access window swaps states inside one window: the account tiles, or the
   * password state of the tile that could not open directly.
   */
  const accessView = ref<'select' | 'password'>('select');
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
      toast.error(translateResultError(error, t, { fallbackKey: 'common.operationFailed' }));
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

  function backToSelect(): void {
    accessView.value = 'select';
    selectedProfileId.value = null;
    password.value = '';
    remember.value = false;
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

  async function createLocalAccount(): Promise<void> {
    if (busyProfileId.value) return;
    if (!newName.value.trim() || newPassword.value.length < 8) {
      toast.error(t('auth.profileAccess.createInvalid'));
      return;
    }
    // The access window's create state asks for the password twice; the
    // management list keeps its single-password row.
    if (options.accessWindow && newPasswordConfirm.value !== newPassword.value) {
      toast.error(t('auth.profileAccess.passwordMismatch'));
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
      newPasswordConfirm.value = '';
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
    newPasswordConfirm,
    editingProfileId,
    editName,
    refreshProfiles,
    openProfile,
    selectProfile,
    enterPasswordState,
    backToSelect,
    submitPassword,
    switchProfile,
    createLocalAccount,
    renameProfile,
    removeProfile,
  };
}
