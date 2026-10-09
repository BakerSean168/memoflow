<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { Button, Dialog, Input } from '@memoflow/ui-vue-shadcn';
import {
  DesktopProfileImportChannels as Channels,
  DesktopProfileImportViewSchema,
  type DesktopProfileImportView,
  type ProfileSummary,
} from '@memoflow/contracts/electron';
import { DESKTOP_BRIDGE_KEY } from '../../di/keys';
import ProductDialogShell from '../../shared/components/ProductDialogShell.vue';

const props = defineProps<{
  open: boolean;
  target: ProfileSummary;
  profiles: ProfileSummary[];
  initialSourceId?: string;
}>();
const emit = defineEmits<{ (event: 'update:open', value: boolean): void }>();
const bridge = inject(DESKTOP_BRIDGE_KEY, null);
const { t } = useI18n();
const sourceId = ref('');
const pin = ref('');
const requestId = ref(crypto.randomUUID());
const selected = ref<DesktopProfileImportView | null>(null);
const records = ref<DesktopProfileImportView[]>([]);
const deleteSource = ref(false);
const busy = ref(false);
const error = ref('');
const sources = computed(() => props.profiles.filter((profile) => profile.profileKind === 'guest'));
const source = computed(() =>
  sources.value.find(
    (profile) => profile.profileId === (selected.value?.sourceProfileId ?? sourceId.value),
  ),
);
const canCommit = computed(() => selected.value?.phase === 'preflight');
const blockers = computed(() => selected.value?.blockers ?? []);
const names: Record<string, string> = {
  'account-profile': 'account',
  preferences: 'preferences',
  labels: 'labels',
  goals: 'goals',
  tasks: 'tasks',
  schedules: 'schedules',
  routines: 'routines',
  notifications: 'notifications',
  'notification-delivery-preferences': 'notificationPreferences',
  'ai-conversations': 'conversations',
};
async function invoke<T>(channel: string, schema: z.ZodType<T>, input: object) {
  if (!bridge) throw new Error(t('shell.profileImport.unavailable'));
  const raw = await bridge.invoke(channel, { targetProfileId: props.target.profileId, ...input });
  const result = z
    .object({
      ok: z.boolean(),
      data: z.unknown().optional(),
      error: z.object({ code: z.string(), message: z.string() }).optional(),
    })
    .parse(raw);
  if (!result.ok)
    throw new Error(
      t(
        `shell.profileImport.errors.${result.error?.code}`,
        result.error?.message ?? t('shell.profileImport.failed'),
      ),
    );
  return schema.parse(result.data);
}
async function refresh() {
  records.value = await invoke(Channels.LIST, z.array(DesktopProfileImportViewSchema), {});
  if (selected.value) {
    selected.value =
      records.value.find((record) => record.requestId === selected.value?.requestId) ??
      selected.value;
    deleteSource.value = selected.value.deleteSource;
  }
}
async function action(kind: 'prepare' | 'commit' | 'recover') {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const channel =
      kind === 'prepare'
        ? Channels.PREPARE
        : kind === 'commit'
          ? Channels.COMMIT
          : Channels.RECOVER;
    const input =
      kind === 'prepare'
        ? {
            requestId: requestId.value,
            sourceProfileId: sourceId.value,
            ...(pin.value ? { pin: pin.value } : {}),
          }
        : {
            requestId: selected.value!.requestId,
            ...(pin.value ? { pin: pin.value } : {}),
            ...(kind === 'commit' ? { deleteSource: deleteSource.value } : {}),
          };
    selected.value = await invoke(channel, DesktopProfileImportViewSchema, input);
    await refresh();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('shell.profileImport.failed');
    await refresh().catch(() => undefined);
  } finally {
    pin.value = '';
    busy.value = false;
  }
}
function selectRecord(record: DesktopProfileImportView) {
  selected.value = record;
  deleteSource.value = record.deleteSource;
  pin.value = '';
}
function newCopy() {
  selected.value = null;
  requestId.value = crypto.randomUUID();
  deleteSource.value = false;
  error.value = '';
  pin.value = '';
}
watch(
  () => props.open,
  async (open) => {
    if (!open) {
      pin.value = '';
      return;
    }
    newCopy();
    sourceId.value =
      props.initialSourceId ?? (sources.value.length === 1 ? sources.value[0]!.profileId : '');
    try {
      await refresh();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : t('shell.profileImport.failed');
    }
  },
  { immediate: true },
);
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <ProductDialogShell
      :open="open"
      test-id="profile-import-dialog"
      size="md"
      body-class="space-y-4"
    >
      <template #title>{{ t('shell.profileImport.title') }}</template>
      <template #description>{{
        t('shell.profileImport.description', { target: target.displayName })
      }}</template>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <template v-if="!selected">
        <label class="block space-y-2 text-sm">
          <span>{{ t('shell.profileImport.source') }}</span>
          <select
            v-model="sourceId"
            :disabled="busy"
            class="w-full rounded-md border bg-background p-2"
            data-testid="profile-import-source"
          >
            <option disabled value="">{{ t('shell.profileImport.source') }}</option>
            <option v-for="profile in sources" :key="profile.profileId" :value="profile.profileId">
              {{ profile.displayName }}
            </option>
          </select>
        </label>
        <p v-if="sources.length === 0" class="text-sm text-muted-foreground">
          {{ t('shell.profileImport.noSources') }}
        </p>
      </template>
      <template v-else>
        <p class="text-sm font-medium" role="status">
          {{ t(`shell.profileImport.phase.${selected.phase}`) }}
        </p>
        <p class="text-sm">
          {{ source?.displayName ?? t('shell.profileImport.removedSource') }} →
          {{ target.displayName }}
        </p>
        <ul v-if="selected.plan" class="space-y-1 text-sm">
          <li v-for="item in selected.plan.preview.capabilities" :key="item.key">
            {{ t(`shell.profileImport.owners.${names[item.key] ?? item.key}`) }}:
            {{
              t('shell.profileImport.counts', {
                created: item.created,
                updated: item.updated,
                skipped: item.skipped,
              })
            }}
          </li>
        </ul>
        <div
          v-if="blockers.length"
          class="space-y-2 rounded-lg border p-3 text-sm"
          data-testid="profile-import-blockers"
        >
          <p>{{ t('shell.profileImport.keepSource') }}</p>
          <ul class="space-y-1">
            <li v-for="(blocker, index) in blockers" :key="index">
              {{ t(`shell.profileImport.blockers.${blocker.reason}`) }} ·
              {{ t(`shell.profileImport.owners.${names[blocker.capability] ?? 'other'}`) }}
            </li>
          </ul>
        </div>
        <p v-if="selected.sourceUnchanged === false" class="text-sm">
          {{ t('shell.profileImport.sourceChanged') }}
        </p>
        <p v-if="['committed', 'verified', 'completed'].includes(selected.phase)" class="text-sm">
          {{
            t('shell.profileImport.verification', {
              server: t(
                selected.serverVerified
                  ? 'shell.profileImport.passed'
                  : 'shell.profileImport.waiting',
              ),
              local: t(
                selected.localVerified
                  ? 'shell.profileImport.passed'
                  : 'shell.profileImport.waiting',
              ),
            })
          }}
        </p>
        <label v-if="canCommit" class="flex items-start gap-2 text-sm">
          <input
            v-model="deleteSource"
            type="checkbox"
            :disabled="busy || blockers.length > 0"
            data-testid="profile-import-delete-source"
          />
          <span>{{ t('shell.profileImport.deleteSource') }}</span>
        </label>
      </template>
      <Input
        v-if="source?.hasPin && (!selected || canCommit || selected.deleteSource)"
        v-model="pin"
        type="password"
        inputmode="numeric"
        maxlength="12"
        autocomplete="off"
        :aria-label="t('shell.profileImport.pin')"
        :placeholder="t('shell.profileImport.pin')"
        :disabled="busy"
      />
      <details v-if="records.length" class="text-sm" :open="!!error">
        <summary>{{ t('shell.profileImport.history') }}</summary>
        <ul class="mt-2 space-y-2">
          <li v-for="record in records" :key="record.requestId">
            <Button variant="outline" :disabled="busy" @click="selectRecord(record)"
              >{{ t(`shell.profileImport.phase.${record.phase}`) }} ·
              {{ record.requestId.slice(0, 8) }}</Button
            >
          </li>
        </ul>
      </details>
      <template #footer>
        <Button variant="ghost" @click="emit('update:open', false)">{{
          t('shell.profileImport.close')
        }}</Button>
        <Button v-if="!selected" :disabled="busy || !sourceId" @click="action('prepare')">{{
          t('shell.profileImport.preview')
        }}</Button>
        <Button v-else-if="canCommit" :disabled="busy" @click="action('commit')">{{
          t('shell.profileImport.commit')
        }}</Button>
        <Button
          v-else-if="selected.phase !== 'completed'"
          :disabled="busy"
          @click="action('recover')"
          >{{ t('shell.profileImport.retry') }}</Button
        >
        <Button v-else variant="outline" :disabled="busy" @click="newCopy">{{
          t('shell.profileImport.newCopy')
        }}</Button>
      </template>
    </ProductDialogShell>
  </Dialog>
</template>
