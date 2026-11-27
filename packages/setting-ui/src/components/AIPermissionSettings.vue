<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowUpRight, ChevronDown, LockKeyhole, RefreshCw } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@memoflow/ui-vue-shadcn';
import {
  DEFAULT_BULK_THRESHOLD,
  type PermissionEffect,
  type PermissionObject,
  type PermissionSettings,
  type PermissionSnapshot,
} from '@memoflow/ai-contracts';
import { useSettingIdentityScope } from '../composables/useSettingIdentityScope';
import { settingUiHost } from '../setting-ui-host';

const emit = defineEmits<{ 'open-activity': [] }>();

type AccessKind = 'read' | 'write';
const { SettingsObjectCard, SettingsSection, SettingsStatusBlock } = settingUiHost.components;
const { t } = useI18n();
const local = inject(settingUiHost.AI_LOCAL_AGENT_KEY, undefined);
const identityScope = useSettingIdentityScope();

const snapshot = ref<PermissionSnapshot>();
const busy = ref(false);
const loading = ref(false);
const error = ref('');
let generation = 0;
let disposed = false;

const presets = ['read_only', 'confirm_each', 'full_auto'] as const;
const objects: Exclude<PermissionObject, 'ai_permission'>[] = [
  'goal',
  'key_result',
  'task',
  'routine',
  'knowledge',
  'notification',
  'ai',
];
const effects: PermissionEffect[] = ['allow', 'ask', 'deny'];
const writeActions = ['create', 'update', 'delete'] as const;
const defaults: Record<
  (typeof presets)[number],
  { read: PermissionEffect; write: PermissionEffect }
> = {
  read_only: { read: 'allow', write: 'deny' },
  confirm_each: { read: 'allow', write: 'ask' },
  full_auto: { read: 'allow', write: 'allow' },
};
const settings = computed(() => snapshot.value?.settings);
const selectedPreset = computed(() =>
  settings.value?.preset === 'on_demand' ? 'confirm_each' : settings.value?.preset,
);
const hasOverrides = computed(() => settings.value?.preset === 'custom');
const presetSummary = computed(() => {
  const preset = selectedPreset.value;
  return preset && preset !== 'custom' ? defaults[preset] : defaults.confirm_each;
});
const permissionsSummary = computed((): Record<AccessKind, PermissionEffect | 'mixed'> => {
  if (!hasOverrides.value) return presetSummary.value;
  const matrix = settings.value?.customMatrix;
  const all = (items: PermissionEffect[]): PermissionEffect | 'mixed' =>
    items.every((effect) => effect === items[0]) ? items[0]! : 'mixed';
  return {
    read: all(objects.map((object) => matrix?.[object]?.read ?? defaults.confirm_each.read)),
    write: all(
      objects.flatMap((object) =>
        writeActions.map((action) => matrix?.[object]?.[action] ?? defaults.confirm_each.write),
      ),
    ),
  };
});

function cell(object: PermissionObject, access: AccessKind): PermissionEffect | 'mixed' {
  if (object === 'ai_permission') return 'deny';
  if (!settings.value || settings.value.preset !== 'custom') {
    return presetSummary.value[access];
  }
  const matrix = settings.value.customMatrix?.[object];
  if (access === 'read') return matrix?.read ?? defaults.confirm_each.read;
  const values = writeActions.map((action) => matrix?.[action] ?? defaults.confirm_each.write);
  return values.every((value) => value === values[0]) ? values[0]! : 'mixed';
}

function effectLabel(effect: PermissionEffect | 'mixed') {
  return effect === 'mixed'
    ? t('setting.permissions.legacyMixed')
    : t(`setting.permissions.effects.${effect}`);
}
function summaryLabel(effect: PermissionEffect | 'mixed') {
  return effect === 'mixed' ? t('setting.permissions.varies') : effectLabel(effect);
}

async function execute(command: Parameters<NonNullable<typeof local>['permissions']>[0]) {
  if (!local || typeof local.permissions !== 'function') return;
  if (command.action !== 'snapshot' && busy.value) return;
  const current = ++generation;
  const expectedScope = identityScope.value;
  if (command.action === 'snapshot') loading.value = true;
  else busy.value = true;
  error.value = '';
  try {
    const next = await local.permissions(command);
    if (disposed || current !== generation || identityScope.value !== expectedScope) return;
    snapshot.value = next;
  } catch {
    if (disposed || current !== generation || identityScope.value !== expectedScope) return;
    error.value = t('setting.permissions.error');
  } finally {
    if (!disposed && current === generation && identityScope.value === expectedScope) {
      if (command.action === 'snapshot') loading.value = false;
      else busy.value = false;
    }
  }
}

async function save(patch: Partial<PermissionSettings>) {
  if (!settings.value) return;
  await execute({
    action: 'settings',
    settings: { ...settings.value, agentPresets: {}, ...patch },
  });
}

async function setPreset(preset: (typeof presets)[number]) {
  await save({ preset, customMatrix: undefined });
}

const bulkThreshold = computed(() => settings.value?.bulkThreshold ?? DEFAULT_BULK_THRESHOLD);

async function saveBulkThreshold(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isInteger(value) || value < 1 || value > 1000) return;
  await save({ bulkThreshold: value });
}

/** Keep persisted CRUD contracts; present the common read/write group to users. */
async function changeAccess(
  object: PermissionObject,
  access: AccessKind,
  effect: PermissionEffect,
) {
  const matrix = Object.fromEntries(
    objects.map((entry) => {
      const original = settings.value?.customMatrix?.[entry];
      const fallback =
        settings.value?.preset === 'custom' ? defaults.confirm_each : presetSummary.value;
      return [
        entry,
        {
          read: original?.read ?? fallback.read,
          create: original?.create ?? fallback.write,
          update: original?.update ?? fallback.write,
          delete: original?.delete ?? fallback.write,
        },
      ];
    }),
  ) as NonNullable<PermissionSettings['customMatrix']>;
  if (access === 'read') matrix[object]!.read = effect;
  else for (const action of writeActions) matrix[object]![action] = effect;
  await save({ preset: 'custom', customMatrix: matrix });
}

function selectAccess(object: PermissionObject, access: AccessKind, value: unknown) {
  if (typeof value === 'string') void changeAccess(object, access, value as PermissionEffect);
}

watch(identityScope, () => {
  generation += 1;
  snapshot.value = undefined;
  error.value = '';
  if (local) void execute({ action: 'snapshot' });
});

onMounted(() => {
  if (local) void execute({ action: 'snapshot' });
});

onBeforeUnmount(() => {
  disposed = true;
  generation += 1;
});
</script>

<template>
  <SettingsSection
    :title="t('setting.permissions.title')"
    :description="t('setting.permissions.description')"
    test-id="ai-permission-settings"
  >
    <template v-if="local" #actions>
      <Button
        variant="ghost"
        size="sm"
        class="h-8 gap-1.5"
        data-testid="ai-permission-open-activity"
        @click="emit('open-activity')"
      >
        {{ t('setting.permissions.openActivity') }}
        <ArrowUpRight class="size-3.5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-8 shrink-0"
        :disabled="busy || loading"
        :title="t('setting.permissions.refresh')"
        :aria-label="t('setting.permissions.refresh')"
        data-testid="ai-permissions-refresh"
        @click="execute({ action: 'snapshot' })"
      >
        <RefreshCw class="size-3.5" :class="{ 'animate-spin': loading }" />
      </Button>
    </template>

    <div class="space-y-5">
      <SettingsStatusBlock
        v-if="!local"
        kind="info"
        :description="t('setting.permissions.unavailable')"
        test-id="ai-permissions-unavailable"
      />
      <SettingsStatusBlock
        v-else-if="loading && !settings"
        kind="loading"
        :title="t('setting.permissions.loading')"
        test-id="ai-permissions-loading"
      />
      <SettingsStatusBlock
        v-if="error"
        kind="error"
        :description="error"
        test-id="ai-permissions-error"
      />

      <template v-if="settings">
        <div
          class="grid gap-2 sm:grid-cols-3"
          role="group"
          :aria-label="t('setting.permissions.title')"
        >
          <button
            v-for="preset in presets"
            :key="preset"
            type="button"
            class="flex min-h-20 flex-col gap-1 rounded-xl border px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            :class="
              selectedPreset === preset ? 'border-primary/65 bg-primary/5' : 'border-border/70'
            "
            :aria-pressed="selectedPreset === preset && !hasOverrides"
            :disabled="busy"
            :data-testid="`ai-permission-preset-${preset}`"
            @click="setPreset(preset)"
          >
            <span class="text-sm font-medium">{{
              t(`setting.permissions.presets.${preset}`)
            }}</span>
            <span class="text-xs leading-5 text-muted-foreground">{{
              t(`setting.permissions.hints.${preset}`)
            }}</span>
          </button>
        </div>

        <div
          class="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-muted/20 px-3 py-2 text-xs"
          data-testid="ai-permission-current-preset"
        >
          <span class="font-medium text-foreground">
            {{
              hasOverrides
                ? t('setting.permissions.presets.custom')
                : t(`setting.permissions.presets.${selectedPreset}`)
            }}
          </span>
          <span class="text-muted-foreground">
            {{ t('setting.permissions.actions.read') }} ·
            {{ summaryLabel(permissionsSummary.read) }}
          </span>
          <span class="text-muted-foreground">
            {{ t('setting.permissions.write') }} · {{ summaryLabel(permissionsSummary.write) }}
          </span>
          <span v-if="snapshot?.rules.length" class="text-muted-foreground">
            {{ t('setting.permissions.existingRules', { count: snapshot.rules.length }) }}
          </span>
        </div>

        <SettingsObjectCard test-id="ai-permission-high-risk">
          <div class="space-y-3">
            <div class="space-y-1">
              <p class="text-sm font-medium text-foreground">
                {{ t('setting.permissions.highRisk.title') }}
              </p>
              <p class="text-xs leading-5 text-muted-foreground">
                {{ t('setting.permissions.highRisk.description') }}
              </p>
              <p class="text-xs font-medium text-foreground">
                {{ t('setting.permissions.bulkSummary', { count: bulkThreshold }) }}
              </p>
            </div>

            <div class="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <LockKeyhole class="mt-0.5 size-3.5 shrink-0" />
              <p>{{ t('setting.permissions.limits') }}</p>
            </div>

            <details
              class="group border-t border-border/60 pt-2.5"
              data-testid="ai-permission-bulk-settings"
            >
              <summary
                class="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
              >
                <span>{{ t('setting.permissions.advancedBulkTitle') }}</span>
                <ChevronDown
                  class="size-4 shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div class="mt-3 space-y-2">
                <label class="flex flex-wrap items-center gap-2 text-xs">
                  <span>{{ t('setting.permissions.highRisk.bulkThreshold') }}</span>
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    class="h-8 w-24 rounded-md border-border/70 px-2 text-xs"
                    :model-value="bulkThreshold"
                    :disabled="busy"
                    data-testid="ai-permission-bulk-threshold"
                    @change="saveBulkThreshold($event)"
                  />
                </label>
                <p class="text-xs leading-5 text-muted-foreground">
                  {{ t('setting.permissions.highRisk.bulkHint') }}
                </p>
              </div>
            </details>
          </div>
        </SettingsObjectCard>

        <details
          class="group rounded-lg border border-border/60"
          data-testid="ai-permission-overrides"
        >
          <summary
            class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden"
          >
            <span>{{ t('setting.permissions.byObject') }}</span>
            <ChevronDown
              class="size-4 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>
          <div class="overflow-x-auto border-t border-border/60 px-3 pb-3">
            <p class="py-2 text-xs leading-5 text-muted-foreground">
              {{ t('setting.permissions.byObjectHint') }}
            </p>
            <table class="w-full text-xs" data-testid="ai-permission-matrix">
              <thead>
                <tr class="text-muted-foreground">
                  <th class="py-2 text-left font-normal">{{ t('setting.permissions.object') }}</th>
                  <th class="py-2 text-left font-normal">
                    {{ t('setting.permissions.actions.read') }}
                  </th>
                  <th class="py-2 text-left font-normal">{{ t('setting.permissions.write') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="object in objects" :key="object" class="border-t border-border/50">
                  <th class="py-2 pr-3 text-left font-medium">
                    {{ t(`setting.permissions.objects.${object}`) }}
                  </th>
                  <td
                    v-for="access in ['read', 'write'] as const"
                    :key="access"
                    class="py-1.5 pr-2"
                  >
                    <Select
                      :model-value="cell(object, access)"
                      :disabled="busy"
                      @update:model-value="selectAccess(object, access, $event)"
                    >
                      <SelectTrigger
                        size="sm"
                        class="min-w-24"
                        :aria-label="`${t(`setting.permissions.objects.${object}`)} ${access === 'write' ? t('setting.permissions.write') : t('setting.permissions.actions.read')}`"
                        :data-testid="`ai-permission-cell-${object}-${access}`"
                      >
                        <SelectValue
                          :placeholder="
                            cell(object, access) === 'mixed'
                              ? t('setting.permissions.legacyMixed')
                              : undefined
                          "
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-if="cell(object, access) === 'mixed'" value="mixed" disabled>
                          {{ t('setting.permissions.legacyMixed') }}
                        </SelectItem>
                        <SelectItem v-for="effect in effects" :key="effect" :value="effect">
                          {{ effectLabel(effect) }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>

        <details
          v-if="snapshot?.rules.length"
          class="group rounded-lg border border-border/60"
          data-testid="ai-permission-grants"
        >
          <summary
            class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden"
          >
            <span>{{ t('setting.permissions.grants') }} ({{ snapshot?.rules.length }})</span>
            <ChevronDown
              class="size-4 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>
          <div class="divide-y divide-border/60 border-t border-border/60 px-3">
            <div
              v-for="rule in snapshot?.rules"
              :key="rule.id"
              class="flex flex-col gap-2 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <span class="font-medium text-foreground">
                  {{ t(`setting.permissions.objects.${rule.object}`) }} ·
                  {{ t(`setting.permissions.actions.${rule.action}`) }}
                </span>
                <Badge
                  :variant="rule.effect === 'deny' ? 'destructive' : 'secondary'"
                  class="text-[11px] font-normal"
                >
                  {{ effectLabel(rule.effect) }}
                </Badge>
                <Badge v-if="rule.agentId" variant="outline" class="text-[11px] font-normal">
                  {{ t('setting.permissions.legacyAgentRule') }}
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                class="h-7 shrink-0 self-start text-xs sm:self-center"
                :disabled="busy"
                :data-testid="`ai-permission-revoke-${rule.id}`"
                @click="execute({ action: 'revoke', ruleId: rule.id })"
              >
                {{ t('setting.permissions.revoke') }}
              </Button>
            </div>
          </div>
        </details>
      </template>
    </div>
  </SettingsSection>
</template>
