<script setup lang="ts">
/**
 * Launch-time automatic entry (#926), inside Settings → Account & privacy.
 *
 * Desktop only: it reads the main-process preference over the same bridge the
 * account section already uses. The picker offers only accounts that already
 * hold remembered material, because anything else would need a password and
 * therefore must never enter on its own.
 */
import { computed, inject, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@memoflow/ui-vue-shadcn';
import { Rocket } from '@lucide/vue';
import {
  ProfileAccessChannels,
  type ProfileAutoEnterCandidate,
  type ProfileAutoEnterSnapshot,
} from '@memoflow/desktop-contracts';
import { accountUiHost } from '../../account-ui-host';

const { t } = useI18n();
const desktopBridge = inject(accountUiHost.DESKTOP_BRIDGE_KEY, null);

const OFF_VALUE = '__off__';

const snapshot = ref<ProfileAutoEnterSnapshot | null>(null);
const pending = ref(false);
const error = ref(false);

const candidates = computed<ProfileAutoEnterCandidate[]>(() => snapshot.value?.candidates ?? []);
const available = computed(() => candidates.value.length > 0);
// A target that lost its remembered material keeps its value visible instead of
// silently reading as "off"; the user can switch or turn the feature off.
const staleTarget = computed(() => {
  const current = snapshot.value?.profileId;
  return current && !candidates.value.some((candidate) => candidate.profileId === current)
    ? current
    : null;
});
const selectedValue = computed(() => snapshot.value?.profileId ?? OFF_VALUE);

async function invoke<T>(channel: string, payload?: unknown): Promise<T | null> {
  if (!desktopBridge) return null;
  try {
    const result = (await desktopBridge.invoke(channel, payload)) as
      | { ok: true; data: T }
      | { ok: false };
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

async function load(): Promise<void> {
  try {
    const next = await invoke<ProfileAutoEnterSnapshot>(ProfileAccessChannels.AUTO_ENTER_GET);
    snapshot.value = next;
    error.value = next === null;
  } catch {
    snapshot.value = null;
    error.value = true;
  }
}

async function update(value: unknown): Promise<void> {
  if (pending.value || typeof value !== 'string') return;
  pending.value = true;
  error.value = false;
  try {
    const next = await invoke<ProfileAutoEnterSnapshot>(ProfileAccessChannels.AUTO_ENTER_SET, {
      profileId: value === OFF_VALUE ? null : value,
    });
    if (next) snapshot.value = next;
    else {
      error.value = true;
      await load();
    }
  } finally {
    pending.value = false;
  }
}

onMounted(() => {
  if (desktopBridge) void load();
});
</script>

<template>
  <Card v-if="desktopBridge" class="border-border/70" data-testid="account-auto-enter-section">
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Rocket class="h-4 w-4" />
        {{ t('account.autoEnter.title') }}
      </CardTitle>
      <CardDescription>{{ t('account.autoEnter.description') }}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-3">
      <div class="space-y-2">
        <Label for="auto-enter-account">{{ t('account.autoEnter.label') }}</Label>
        <Select
          :model-value="selectedValue"
          :disabled="pending || !available"
          @update:model-value="update"
        >
          <SelectTrigger
            id="auto-enter-account"
            class="w-full sm:max-w-xs"
            data-testid="account-auto-enter-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="OFF_VALUE">{{ t('account.autoEnter.off') }}</SelectItem>
            <SelectItem
              v-for="candidate in candidates"
              :key="candidate.profileId"
              :value="candidate.profileId"
            >
              {{ candidate.displayName }}
            </SelectItem>
            <SelectItem v-if="staleTarget" :value="staleTarget" disabled>
              {{ t('account.autoEnter.unavailableTarget') }}
            </SelectItem>
          </SelectContent>
        </Select>
        <p v-if="error" role="alert" class="text-xs text-destructive">
          {{ t('account.autoEnter.failed') }}
        </p>
        <p
          v-else-if="!available"
          class="text-xs leading-5 text-muted-foreground"
          data-testid="account-auto-enter-unavailable"
        >
          {{ t('account.autoEnter.unavailable') }}
        </p>
      </div>
    </CardContent>
  </Card>
</template>
