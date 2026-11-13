import { computed, ref } from 'vue';
import { toast } from 'vue-sonner';
import { z } from 'zod';
import {
  ProfileAccessChannels,
  ProfileAutoEnterSnapshotSchema,
  WindowChannels,
  type ProfileSummary,
} from '@memoflow/desktop-contracts';
import { useConfirm } from '@memoflow/ui-vue-shadcn';
import { canQuickEnterProfile } from '../utils/desktop-profile-access';
import type { DesktopProfilesSharedContext } from './useDesktopProfiles';

export const profileSchema = z.object({
  profileId: z.string(),
  profileKind: z.enum(['local', 'registered']),
  displayName: z.string(),
  avatarSeed: z.string(),
  avatarUrl: z.string().nullable().optional(),
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

/** Unlock, sign-in and registration actions the Profile catalog routes into. */
export interface DesktopProfileCatalogCross {
  enterPasswordState: (profile: ProfileSummary) => void;
  resetSignInState: () => void;
  resetRegisterState: () => void;
}

/** Profile catalog: list, selection, removal and workspace-entry routing. */
export function useDesktopProfileCatalog(
  ctx: DesktopProfilesSharedContext,
  cross: DesktopProfileCatalogCross,
) {
  const {
    t,
    options,
    invoke,
    invokeScoped,
    profiles,
    busyProfileId,
    selectedProfileId,
    accessView,
    password,
    remember,
  } = ctx;
  const snapshot = ref<z.infer<typeof snapshotSchema> | null>(null);
  const newName = ref('');
  const newPassword = ref('');
  const editingProfileId = ref<string | null>(null);
  const editName = ref('');
  // One in-window hint after a failed launch-time automatic entry; it is never a
  // separate error window and disappears as soon as the user picks a tile.
  const autoEnterFailed = ref(false);

  const sortedProfiles = computed(() =>
    [...profiles.value].sort((a, b) => {
      const active = snapshot.value?.profile?.profileId;
      return (
        Number(b.profileId === active) - Number(a.profileId === active) ||
        b.lastActiveAt - a.lastActiveAt
      );
    }),
  );

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
    behavior: { silent?: boolean } = {},
  ): Promise<boolean> {
    const opened = await invokeScoped(
      ProfileAccessChannels.SELECT,
      z.unknown(),
      { silent: behavior.silent },
      credentials.password === undefined
        ? { profileId: profile.profileId }
        : {
            profileId: profile.profileId,
            password: credentials.password,
            remember: remember.value,
          },
    );
    if (!opened) return false;
    return !!(await invokeScoped(WindowChannels.TRANSITION_TO_MAIN, z.unknown(), {
      silent: behavior.silent,
    }));
  }

  /**
   * Tile routing for the access window. A registered Profile and a local account
   * whose data key is still remembered open directly; every other local account
   * asks for its password inside the window.
   *
   * `silent` is the launch-time automatic entry (#926): it reuses exactly this
   * path, but reports failure to the caller instead of toasting and never opens
   * the password state for a target that no longer qualifies.
   */
  async function selectProfile(
    profile: ProfileSummary,
    behavior: { silent?: boolean } = {},
  ): Promise<boolean> {
    if (busyProfileId.value) return false;
    autoEnterFailed.value = false;
    if (!options.accessWindow) {
      await openProfile(profile);
      return false;
    }
    if (canQuickEnterProfile(profile)) {
      busyProfileId.value = profile.profileId;
      if (await selectAndEnter(profile, {}, behavior)) return true;
      busyProfileId.value = null;
      // A registered Profile keeps its existing re-authentication presentation in
      // the workspace. A remembered key that safeStorage can no longer unseal
      // falls through to the password state; the copy is never deleted here.
      if (profile.profileKind === 'registered' || behavior.silent) return false;
    }
    cross.enterPasswordState(profile);
    return false;
  }

  /**
   * The Steam-style cold start (#926): when automatic entry is on and the target
   * still owns remembered material, fire the tile path once. Anything else —
   * disabled, suppressed by a sign-out in this launch, no target, or invalid
   * material — falls back to the identity window with one visible hint.
   */
  async function tryAutoEnter(): Promise<'entered' | 'skipped' | 'failed'> {
    const setting = await invokeScoped(
      ProfileAccessChannels.AUTO_ENTER_GET,
      ProfileAutoEnterSnapshotSchema,
      { silent: true },
    );
    if (!setting?.data.profileId || setting.data.suppressed) return 'skipped';
    const target = profiles.value.find((profile) => profile.profileId === setting.data.profileId);
    if (!target || !canQuickEnterProfile(target)) {
      autoEnterFailed.value = true;
      return 'failed';
    }
    if (await selectProfile(target, { silent: true })) return 'entered';
    autoEnterFailed.value = true;
    return 'failed';
  }

  function backToSelect(): void {
    cross.resetSignInState();
    cross.resetRegisterState();
    accessView.value = 'select';
    selectedProfileId.value = null;
    password.value = '';
    remember.value = false;
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
    snapshot,
    sortedProfiles,
    newName,
    newPassword,
    editingProfileId,
    editName,
    autoEnterFailed,
    refreshProfiles,
    navigate,
    selectAndEnter,
    selectProfile,
    tryAutoEnter,
    backToSelect,
    enterOpenedProfile,
    setAccessWindowHeight,
    openProfile,
    switchProfile,
    createLocalAccount,
    renameProfile,
    removeProfile,
  };
}
