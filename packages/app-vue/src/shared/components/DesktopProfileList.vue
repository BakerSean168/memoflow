<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@memoflow/ui-vue-shadcn';
import { LockKeyhole, Pencil, Plus, Trash2 } from '@lucide/vue';
import type { ProfileSummary } from '@memoflow/desktop-contracts';
import type { useDesktopProfiles } from '../composables/useDesktopProfiles';

const props = defineProps<{
  presenter: ReturnType<typeof useDesktopProfiles>;
  management?: boolean;
}>();
const emit = defineEmits<{ (event: 'password-settings'): void; (event: 'add'): void }>();
const { t } = useI18n();
const {
  profiles,
  snapshot,
  selectedProfileId,
  password,
  busyProfileId,
  newName,
  newPassword,
  editingProfileId,
  editName,
  createLocalAccount,
  renameProfile,
  openProfile,
  selectProfile,
  removeProfile,
} = props.presenter;
function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || 'MF';
}
const vFocusPassword = { mounted: (element: HTMLElement) => element.focus() };

const activeProfileId = computed(() => snapshot.value?.profile?.profileId ?? null);

// Access mode exposes one detail card per tile. Hover reveals it after a short
// dwell so sweeping the pointer across the row cannot open a card by accident;
// keyboard focus reveals it immediately.
const openTileId = ref<string | null>(null);
// Escape closes the card while the tile keeps focus; suppress the focus reveal
// until the tile loses focus or the user explicitly asks for the card again.
const suppressedTileId = ref<string | null>(null);
const HOVER_OPEN_DELAY_MS = 220;
const HOVER_CLOSE_DELAY_MS = 160;
let openTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function clearOpenTimer(): void {
  if (openTimer) {
    clearTimeout(openTimer);
    openTimer = null;
  }
}

function clearCloseTimer(): void {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function dismissTile(): void {
  clearOpenTimer();
  clearCloseTimer();
  openTileId.value = null;
}

function revealTile(profileId: string): void {
  if (suppressedTileId.value === profileId) return;
  clearOpenTimer();
  clearCloseTimer();
  openTileId.value = profileId;
}

function scheduleReveal(profileId: string): void {
  suppressedTileId.value = null;
  if (openTileId.value === profileId) return;
  clearOpenTimer();
  clearCloseTimer();
  openTimer = setTimeout(() => {
    openTimer = null;
    openTileId.value = profileId;
  }, HOVER_OPEN_DELAY_MS);
}

function tileMenuHasFocus(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && Boolean(active.closest('[data-profile-tile-menu]'));
}

function scheduleDismiss(): void {
  clearOpenTimer();
  clearCloseTimer();
  closeTimer = setTimeout(() => {
    closeTimer = null;
    if (!tileMenuHasFocus()) openTileId.value = null;
  }, HOVER_CLOSE_DELAY_MS);
}

/** Keyboard path into the revealed card: ArrowDown moves focus to its first action. */
async function focusTileMenu(profileId: string): Promise<void> {
  suppressedTileId.value = null;
  revealTile(profileId);
  await nextTick();
  document
    .querySelector<HTMLElement>(`[data-profile-tile-menu="${profileId}"] button`)
    ?.focus({ preventScroll: true });
}

async function handleMenuEscape(profileId: string): Promise<void> {
  suppressedTileId.value = profileId;
  dismissTile();
  await nextTick();
  document
    .querySelector<HTMLElement>(`[data-testid="desktop-profile-open-${profileId}"]`)
    ?.focus({ preventScroll: true });
}

function handleTileBlur(profileId: string): void {
  if (suppressedTileId.value === profileId) suppressedTileId.value = null;
  scheduleDismiss();
}

function handleMenuFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (!(next instanceof HTMLElement) || !next.closest('[data-profile-tile-menu]')) dismissTile();
}

function requestRemoval(profile: ProfileSummary): void {
  dismissTile();
  void removeProfile(profile);
}

function openFromTile(profile: ProfileSummary): void {
  dismissTile();
  void selectProfile(profile);
}

onBeforeUnmount(() => {
  clearOpenTimer();
  clearCloseTimer();
});
</script>
<template>
  <div v-if="management" class="space-y-3">
    <form
      class="flex gap-2"
      data-testid="desktop-profile-create"
      @submit.prevent="createLocalAccount"
    >
      <Input
        v-model="newName"
        maxlength="80"
        :aria-label="t('auth.profileAccess.name')"
        :placeholder="t('auth.profileAccess.name')"
      />
      <Input
        v-model="newPassword"
        type="password"
        autocomplete="new-password"
        :aria-label="t('auth.profileAccess.password')"
        :placeholder="t('auth.profileAccess.password')"
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
            class="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset basis-full sm:basis-0"
            :disabled="busyProfileId !== null"
            :aria-current="activeProfileId === profile.profileId ? 'true' : undefined"
            @click="openProfile(profile)"
          >
            <Avatar class="h-9 w-9 border bg-muted/60">
              <AvatarImage
                v-if="profile.avatarUrl"
                :src="profile.avatarUrl"
                :alt="profile.displayName"
              />
              <AvatarFallback class="text-xs font-semibold">{{
                initials(profile.displayName)
              }}</AvatarFallback>
            </Avatar>
            <span class="min-w-0 flex-1">
              <strong class="block truncate text-sm font-medium">{{ profile.displayName }}</strong>
              <small class="text-xs text-muted-foreground">
                {{
                  profile.profileKind === 'local'
                    ? t('auth.profileAccess.local')
                    : t('auth.profileAccess.registered')
                }}
                · {{ profile.identifierHint || profile.profileId }}
                <span v-if="activeProfileId === profile.profileId">
                  · {{ t('shell.account.currentProfile') }}</span
                >
              </small>
            </span>
            <span class="flex shrink-0 items-center gap-1 text-xs text-primary">
              <LockKeyhole v-if="profile.hasCredential" class="h-3.5 w-3.5" />
              {{
                profile.hasCredential
                  ? t('auth.profileAccess.unlock')
                  : t('auth.profileAccess.open')
              }}
            </span>
          </button>

          <Button
            variant="ghost"
            size="sm"
            :disabled="busyProfileId !== null"
            :data-testid="`desktop-profile-password-settings-${profile.profileId}`"
            @click="
              activeProfileId === profile.profileId
                ? emit('password-settings')
                : openProfile(profile)
            "
            >{{
              activeProfileId === profile.profileId
                ? t('shell.account.passwordSettings')
                : t('shell.account.openForPassword')
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
          <TooltipProvider v-if="activeProfileId !== profile.profileId">
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
          v-if="selectedProfileId === profile.profileId && profile.hasCredential"
          class="flex gap-2 border-t bg-muted/20 p-3"
          @submit.prevent="openProfile(profile)"
        >
          <Input
            v-focus-password
            v-model="password"
            :data-testid="`desktop-profile-password-${profile.profileId}`"
            type="password"
            autocomplete="current-password"
            :placeholder="t('auth.profileAccess.passwordPlaceholder')"
            autofocus
          />
          <Button type="submit" :disabled="!password || busyProfileId !== null">
            {{ t('auth.profileAccess.unlock') }}
          </Button>
        </form>
      </div>
    </div>
  </div>

  <div v-else class="flex flex-col items-center gap-6" data-testid="desktop-profile-tiles">
    <div class="flex flex-wrap items-start justify-center gap-x-2 gap-y-4">
      <div v-for="profile in profiles" :key="profile.profileId" class="w-[5.5rem]">
        <Popover
          :open="openTileId === profile.profileId"
          @update:open="
            (open) => {
              if (!open) dismissTile();
            }
          "
        >
          <PopoverTrigger as-child>
            <button
              type="button"
              :data-testid="`desktop-profile-open-${profile.profileId}`"
              class="group flex w-full flex-col items-center gap-2 rounded-2xl px-1 py-2 text-center transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              :aria-current="activeProfileId === profile.profileId ? 'true' : undefined"
              :disabled="busyProfileId !== null"
              @click="selectProfile(profile)"
              @focus="revealTile(profile.profileId)"
              @blur="handleTileBlur(profile.profileId)"
              @mouseenter="scheduleReveal(profile.profileId)"
              @mouseleave="scheduleDismiss"
              @keydown.down.prevent="focusTileMenu(profile.profileId)"
              @keydown.esc="dismissTile"
            >
              <Avatar
                size="base"
                class="border bg-muted/60 ring-2 ring-transparent transition-[box-shadow,border-color] duration-150 group-hover:border-foreground/20 group-focus-visible:ring-ring"
                :class="
                  activeProfileId === profile.profileId ? 'ring-primary/70' : 'ring-transparent'
                "
              >
                <AvatarImage
                  v-if="profile.avatarUrl"
                  :src="profile.avatarUrl"
                  :alt="profile.displayName"
                />
                <AvatarFallback class="font-semibold text-muted-foreground">{{
                  initials(profile.displayName)
                }}</AvatarFallback>
              </Avatar>
              <span class="w-full truncate text-xs font-medium">{{ profile.displayName }}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="center"
            :side-offset="10"
            class="w-52 p-0"
            :data-profile-tile-menu="profile.profileId"
            :data-testid="`desktop-profile-menu-${profile.profileId}`"
            @open-auto-focus.prevent
            @close-auto-focus.prevent
            @escape-key-down="handleMenuEscape(profile.profileId)"
            @pointer-down-outside="dismissTile"
            @mouseenter="revealTile(profile.profileId)"
            @mouseleave="scheduleDismiss"
            @focusout="handleMenuFocusOut"
          >
            <div class="space-y-1 px-3 pb-2 pt-3">
              <p class="truncate text-sm font-medium">{{ profile.displayName }}</p>
              <p class="flex items-center gap-1 text-xs text-muted-foreground">
                <LockKeyhole v-if="profile.hasCredential" class="h-3 w-3" aria-hidden="true" />
                {{
                  profile.profileKind === 'local'
                    ? t('auth.profileAccess.local')
                    : t('auth.profileAccess.registered')
                }}
                <template v-if="activeProfileId === profile.profileId">
                  · {{ t('shell.account.currentProfile') }}
                </template>
              </p>
              <p
                class="truncate font-mono text-[11px] text-muted-foreground/80"
                :title="profile.identifierHint || profile.profileId"
              >
                {{ profile.identifierHint || profile.profileId }}
              </p>
            </div>
            <Separator />
            <div class="space-y-0.5 p-1">
              <Button
                variant="ghost"
                size="sm"
                class="w-full justify-start gap-2"
                :data-testid="`desktop-profile-menu-open-${profile.profileId}`"
                :disabled="busyProfileId !== null"
                @click="openFromTile(profile)"
              >
                {{
                  profile.hasCredential
                    ? t('auth.profileAccess.unlock')
                    : t('auth.profileAccess.open')
                }}
              </Button>
              <Button
                v-if="activeProfileId !== profile.profileId"
                variant="ghost"
                size="sm"
                class="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                :data-testid="`desktop-profile-remove-${profile.profileId}`"
                :disabled="busyProfileId !== null"
                @click="requestRemoval(profile)"
              >
                <Trash2 class="h-4 w-4" aria-hidden="true" />
                {{ t('common.delete') }}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <button
        type="button"
        data-testid="desktop-profile-create-local"
        class="group flex w-[5.5rem] flex-col items-center gap-2 rounded-2xl px-1 py-2 text-center transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        :aria-label="t('auth.profileAccess.create')"
        :disabled="busyProfileId !== null"
        @click="emit('add')"
      >
        <span
          class="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors group-hover:border-foreground/30 group-hover:text-foreground"
        >
          <Plus class="h-6 w-6" aria-hidden="true" />
        </span>
      </button>
    </div>
  </div>
</template>
