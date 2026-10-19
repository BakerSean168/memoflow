<script setup lang="ts">
import { useI18n } from 'vue-i18n';
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
import { LockKeyhole, Trash2, Pencil } from '@lucide/vue';
import type { useDesktopProfiles } from '../composables/useDesktopProfiles';

const props = defineProps<{
  presenter: ReturnType<typeof useDesktopProfiles>;
  management?: boolean;
}>();
const emit = defineEmits<{ (event: 'pin-settings'): void }>();
const { t } = useI18n();
const {
  profiles,
  snapshot,
  selectedProfileId,
  pin,
  busyProfileId,
  newName,
  editingProfileId,
  editName,
  createGuest,
  renameProfile,
  openProfile,
  removeProfile,
} = props.presenter;
function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || 'MF';
}
const vFocusPin = { mounted: (element: HTMLElement) => element.focus() };
</script>
<template>
  <div class="space-y-3">
    <form class="flex gap-2" data-testid="desktop-profile-create" @submit.prevent="createGuest">
      <Input
        v-model="newName"
        maxlength="80"
        :aria-label="t('auth.profileAccess.name')"
        :placeholder="t('auth.profileAccess.name')"
      />
      <Button data-testid="shell-create-profile" type="submit" :disabled="busyProfileId !== null">{{
        t('auth.profileAccess.create')
      }}</Button>
    </form>
    <div class="space-y-2">
      <div
        v-for="profile in profiles"
        :key="profile.profileId"
        class="overflow-hidden rounded-md border bg-card"
      >
        <div class="flex flex-wrap items-stretch">
          <button
            type="button"
            :data-testid="`desktop-profile-open-${profile.profileId}`"
            class="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            :class="{ 'basis-full sm:basis-0': management }"
            :disabled="busyProfileId !== null"
            :aria-current="snapshot?.profile?.profileId === profile.profileId ? 'true' : undefined"
            @click="openProfile(profile)"
          >
            <Avatar class="h-9 w-9 border bg-muted/60">
              <AvatarFallback class="text-xs font-semibold">{{
                initials(profile.displayName)
              }}</AvatarFallback>
            </Avatar>
            <span class="min-w-0 flex-1">
              <strong class="block truncate text-sm font-medium">{{ profile.displayName }}</strong>
              <small class="text-xs text-muted-foreground">
                {{
                  profile.profileKind === 'guest'
                    ? t('auth.profileAccess.guest')
                    : t('auth.profileAccess.registered')
                }}
                · {{ profile.identifierHint || profile.profileId }}
                <span v-if="snapshot?.profile?.profileId === profile.profileId">
                  · {{ t('shell.account.currentProfile') }}</span
                >
              </small>
            </span>
            <span class="flex shrink-0 items-center gap-1 text-xs text-primary">
              <LockKeyhole v-if="profile.hasPin" class="h-3.5 w-3.5" />
              {{ profile.hasPin ? t('auth.profileAccess.unlock') : t('auth.profileAccess.open') }}
            </span>
          </button>

          <Button
            v-if="management"
            variant="ghost"
            size="sm"
            :disabled="busyProfileId !== null"
            :data-testid="`desktop-profile-pin-settings-${profile.profileId}`"
            @click="
              snapshot?.profile?.profileId === profile.profileId
                ? emit('pin-settings')
                : openProfile(profile)
            "
            >{{
              snapshot?.profile?.profileId === profile.profileId
                ? t('shell.account.pinSettings')
                : t('shell.account.openForPin')
            }}</Button
          >
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
            v-focus-pin
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
</template>
