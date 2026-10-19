import { computed, inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { z } from 'zod';
import {
  ProfileAccessChannels,
  WindowChannels,
  type ProfileSummary,
} from '@memoflow/contracts/electron';
import { DESKTOP_BRIDGE_KEY } from '../../di/keys';
import { translateResultError } from '../utils/translate-result-error';

const profileSchema = z.object({
  profileId: z.string(),
  profileKind: z.enum(['guest', 'registered']),
  displayName: z.string(),
  avatarSeed: z.string(),
  identifierHint: z.string().nullable(),
  cloudAccountId: z.string().nullable(),
  lastActiveAt: z.number(),
  hasPin: z.boolean(),
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
  const pin = ref('');
  const newName = ref('');
  const createRequestId = ref(crypto.randomUUID());
  const editingProfileId = ref<string | null>(null);
  const editName = ref('');
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
    const opened = await invoke(
      ProfileAccessChannels.SELECT,
      z.unknown(),
      profile.hasPin
        ? { profileId: profile.profileId, pin: pin.value }
        : { profileId: profile.profileId },
    );
    return !!opened && !!(await invoke(WindowChannels.TRANSITION_TO_MAIN, z.unknown()));
  }

  async function openProfile(profile: ProfileSummary): Promise<void> {
    if (
      busyProfileId.value ||
      (!options.accessWindow && snapshot.value?.profile?.profileId === profile.profileId)
    )
      return;
    if (options.accessWindow && profile.hasPin && selectedProfileId.value !== profile.profileId) {
      selectedProfileId.value = profile.profileId;
      pin.value = '';
      return;
    }
    if (options.accessWindow && profile.hasPin && !pin.value) {
      toast.error(t('auth.profileAccess.pinRequired'));
      return;
    }
    busyProfileId.value = profile.profileId;
    try {
      if (!(await navigate(profile))) busyProfileId.value = null;
    } finally {
      pin.value = '';
    }
  }

  async function switchProfile(profileId: string): Promise<void> {
    const profile = profiles.value.find((item) => item.profileId === profileId);
    if (profile) await openProfile(profile);
  }

  async function createGuest(): Promise<void> {
    if (busyProfileId.value) return;
    busyProfileId.value = 'creating';
    try {
      const created = await invoke(ProfileAccessChannels.CREATE_GUEST, profileSchema, {
        requestId: createRequestId.value,
        displayName: newName.value.trim() || undefined,
      });
      if (!created) return;
      createRequestId.value = crypto.randomUUID();
      newName.value = '';
      await refreshProfiles();
      if (await navigate(created.data)) busyProfileId.value = created.data.profileId;
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
    if (!window.confirm(t('auth.profileAccess.removeConfirm', { name: profile.displayName })))
      return;
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
    pin,
    newName,
    editingProfileId,
    editName,
    refreshProfiles,
    openProfile,
    switchProfile,
    createGuest,
    renameProfile,
    removeProfile,
  };
}
