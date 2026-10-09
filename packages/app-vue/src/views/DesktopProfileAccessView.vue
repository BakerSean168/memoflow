<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import {
  Avatar,
  AvatarFallback,
  Button,
  Input,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@memoflow/ui-vue-shadcn';
import { LockKeyhole, Trash2, UserRound, Pencil } from '@lucide/vue';
import type { DesktopAccessSnapshot, ProfileSummary } from '@memoflow/contracts/electron';
import { ProfileAccessChannels, WindowChannels } from '@memoflow/contracts/electron';
import { DESKTOP_BRIDGE_KEY } from '../di/keys';

const { t } = useI18n();
const bridge = inject(DESKTOP_BRIDGE_KEY, null);
const snapshot = ref<DesktopAccessSnapshot | null>(null);
const profiles = ref<ProfileSummary[]>([]);
const selectedProfileId = ref<string | null>(null);
const pin = ref('');
const busyProfileId = ref<string | null>(null);
const newName = ref('');
const createRequestId = ref(crypto.randomUUID());
const editingProfileId = ref<string | null>(null);
const editName = ref('');

async function createGuest(): Promise<void> {
  if (busyProfileId.value) return;
  busyProfileId.value = 'creating';
  try {
    const created = await invoke<ProfileSummary>(ProfileAccessChannels.CREATE_GUEST, {
      requestId: createRequestId.value,
      displayName: newName.value.trim() || undefined,
    });
    if (!created?.data) return;
    createRequestId.value = crypto.randomUUID();
    newName.value = '';
    await refreshProfiles();
    await openProfile(created.data);
  } finally {
    if (busyProfileId.value === 'creating') busyProfileId.value = null;
  }
}

async function renameProfile(profile: ProfileSummary): Promise<void> {
  if (busyProfileId.value) return;
  busyProfileId.value = profile.profileId;
  try {
    const result = await invoke(ProfileAccessChannels.RENAME, {
      profileId: profile.profileId,
      displayName: editName.value.trim(),
    });
    if (result) {
      editingProfileId.value = null;
      await refreshProfiles();
    }
  } finally {
    busyProfileId.value = null;
  }
}

async function invoke<T>(
  channel: string,
  ...args: unknown[]
): Promise<{ data: T | undefined } | null> {
  if (!bridge) return null;
  let response: unknown;
  try {
    response = await bridge.invoke(channel, ...args);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.operationFailed'));
    return null;
  }
  const result = response as {
    ok?: boolean;
    data?: T;
    error?: { message?: string };
  };
  if (!result.ok) {
    toast.error(result.error?.message ?? t('common.operationFailed'));
    return null;
  }
  return { data: result.data };
}

async function refreshProfiles(): Promise<void> {
  profiles.value = (await invoke<ProfileSummary[]>(ProfileAccessChannels.LIST))?.data ?? [];
  snapshot.value =
    (await invoke<DesktopAccessSnapshot>(ProfileAccessChannels.GET_SNAPSHOT))?.data ?? null;
}

async function openProfile(profile: ProfileSummary): Promise<void> {
  if (profile.hasPin && selectedProfileId.value !== profile.profileId) {
    selectedProfileId.value = profile.profileId;
    pin.value = '';
    return;
  }
  if (profile.hasPin && !pin.value) {
    toast.error(t('auth.profileAccess.pinRequired'));
    return;
  }

  busyProfileId.value = profile.profileId;
  const opened = await invoke(
    ProfileAccessChannels.SELECT,
    profile.hasPin
      ? { profileId: profile.profileId, pin: pin.value }
      : { profileId: profile.profileId },
  );
  if (!opened || !(await invoke(WindowChannels.TRANSITION_TO_MAIN))) busyProfileId.value = null;
  // A successful transition destroys this renderer; keep actions disabled until then.
}

async function removeProfile(profile: ProfileSummary): Promise<void> {
  const confirmed = window.confirm(
    t('auth.profileAccess.removeConfirm', { name: profile.displayName }),
  );
  if (!confirmed) return;
  const removed = await invoke(ProfileAccessChannels.REMOVE, { profileId: profile.profileId });
  if (removed === null) return;
  toast.success(t('auth.profileAccess.removed'));
  await refreshProfiles();
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || 'MF';
}

onMounted(async () => {
  await refreshProfiles();
  const query = window.location.hash.split('?')[1];
  const targetId = new URLSearchParams(query).get('profileId');
  if (profiles.value.some((profile) => profile.profileId === targetId))
    selectedProfileId.value = targetId;
});
</script>

<template>
  <main
    class="flex min-h-screen w-full items-center justify-center bg-background px-5 py-8 text-foreground"
  >
    <div class="w-full max-w-md space-y-6" data-testid="desktop-profile-access">
      <header class="space-y-2 text-center">
        <div
          class="mx-auto flex h-11 w-11 items-center justify-center rounded-md border bg-muted/40"
        >
          <UserRound class="h-5 w-5" />
        </div>
        <h1 class="text-xl font-semibold">{{ t('auth.profileAccess.title') }}</h1>
        <p class="text-sm leading-6 text-muted-foreground">
          {{ t('auth.profileAccess.description') }}
        </p>
      </header>

      <form class="flex gap-2" data-testid="desktop-profile-create" @submit.prevent="createGuest">
        <Input
          v-model="newName"
          maxlength="80"
          :aria-label="t('auth.profileAccess.name')"
          :placeholder="t('auth.profileAccess.name')"
        />
        <Button type="submit" :disabled="busyProfileId !== null">{{
          t('auth.profileAccess.create')
        }}</Button>
      </form>
      <div class="space-y-2">
        <div
          v-for="profile in profiles"
          :key="profile.profileId"
          class="overflow-hidden rounded-md border bg-card"
        >
          <div class="flex items-stretch">
            <button
              type="button"
              :data-testid="`desktop-profile-open-${profile.profileId}`"
              class="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              :disabled="busyProfileId !== null"
              @click="openProfile(profile)"
            >
              <Avatar class="h-9 w-9 border bg-muted/60">
                <AvatarFallback class="text-xs font-semibold">{{
                  initials(profile.displayName)
                }}</AvatarFallback>
              </Avatar>
              <span class="min-w-0 flex-1">
                <strong class="block truncate text-sm font-medium">{{
                  profile.displayName
                }}</strong>
                <small class="text-xs text-muted-foreground">
                  {{
                    profile.profileKind === 'guest'
                      ? t('auth.profileAccess.guest')
                      : t('auth.profileAccess.registered')
                  }}
                </small>
              </span>
              <span class="flex shrink-0 items-center gap-1 text-xs text-primary">
                <LockKeyhole v-if="profile.hasPin" class="h-3.5 w-3.5" />
                {{ profile.hasPin ? t('auth.profileAccess.unlock') : t('auth.profileAccess.open') }}
              </span>
            </button>

            <Button
              variant="ghost"
              size="icon"
              :disabled="busyProfileId !== null"
              :aria-label="t('auth.profileAccess.rename')"
              :data-testid="`desktop-profile-rename-${profile.profileId}`"
              @click="
                editingProfileId = profile.profileId;
                editName = profile.displayName;
              "
              ><Pencil class="h-4 w-4"
            /></Button>
            <TooltipProvider v-if="snapshot?.profile?.profileId !== profile.profileId">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="h-auto w-11 rounded-none border-l text-muted-foreground hover:text-destructive"
                    :data-testid="`desktop-profile-remove-${profile.profileId}`"
                    :aria-label="t('auth.profileAccess.remove')"
                    :disabled="busyProfileId !== null"
                    @click="removeProfile(profile)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{{ t('auth.profileAccess.remove') }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <form
            v-if="editingProfileId === profile.profileId"
            class="flex gap-2 border-t p-3"
            @submit.prevent="renameProfile(profile)"
          >
            <Input v-model="editName" maxlength="80" :aria-label="t('auth.profileAccess.name')" />
            <Button type="submit" :disabled="!editName.trim() || busyProfileId !== null">{{
              t('auth.profileAccess.save')
            }}</Button>
            <Button type="button" variant="ghost" @click="editingProfileId = null">{{
              t('common.cancel')
            }}</Button>
          </form>
          <form
            v-if="selectedProfileId === profile.profileId && profile.hasPin"
            class="flex gap-2 border-t bg-muted/20 p-3"
            @submit.prevent="openProfile(profile)"
          >
            <Input
              v-model="pin"
              :data-testid="`desktop-profile-pin-${profile.profileId}`"
              inputmode="numeric"
              type="password"
              autocomplete="current-password"
              :placeholder="t('auth.profileAccess.pinPlaceholder')"
              autofocus
            />
            <Button type="submit" :disabled="!pin || busyProfileId !== null">
              {{ t('auth.profileAccess.unlock') }}
            </Button>
          </form>
        </div>
      </div>
    </div>
  </main>
</template>
