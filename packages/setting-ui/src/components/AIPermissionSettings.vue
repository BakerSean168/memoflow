<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { ChevronDown, LockKeyhole, RefreshCw } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import type {
  PermissionEffect,
  PermissionObject,
  PermissionSettings,
  PermissionSnapshot,
} from '@memoflow/ai-contracts';
import { settingUiHost } from '../setting-ui-host';

type AccessKind = 'read' | 'write';
const { t } = useI18n();
const local = inject(settingUiHost.AI_LOCAL_AGENT_KEY, undefined);
const snapshot = ref<PermissionSnapshot>();
const busy = ref(false);
const error = ref('');
const presets = ['read_only', 'confirm_each', 'full_auto'] as const;
const objects: Exclude<PermissionObject, 'ai_permission'>[] = [
  'goal',
  'key_result',
  'task',
  'routine',
  'knowledge',
  'notification',
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
const displayRules = computed(() => {
  const groups = new Map<
    string,
    {
      key: string;
      object: PermissionObject;
      action: 'read' | 'create' | 'update' | 'delete' | 'write';
      effect: PermissionEffect;
      agentId: string | null;
      ids: string[];
    }
  >();
  for (const rule of snapshot.value?.rules ?? []) {
    const groupWrite =
      rule.id.startsWith('grant:') && rule.agentId === null && rule.action !== 'read';
    const key = groupWrite ? `grant:${rule.object}:${rule.effect}` : rule.id;
    const existing = groups.get(key);
    if (existing) existing.ids.push(rule.id);
    else
      groups.set(key, {
        key,
        object: rule.object,
        action: groupWrite ? 'write' : rule.action,
        effect: rule.effect,
        agentId: rule.agentId,
        ids: [rule.id],
      });
  }
  return [...groups.values()];
});
const presetSummary = computed(() => {
  const preset = selectedPreset.value;
  return preset && preset !== 'custom' ? defaults[preset] : defaults.confirm_each;
});
const permissionsSummary = computed((): Record<AccessKind, PermissionEffect | 'mixed'> => {
  if (!hasOverrides.value) return presetSummary.value;
  const matrix = settings.value?.customMatrix;
  const all = (effects: PermissionEffect[]): PermissionEffect | 'mixed' =>
    effects.every((effect) => effect === effects[0]) ? effects[0]! : 'mixed';
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
  if (!local || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    snapshot.value = await local.permissions(command);
  } catch {
    error.value = t('setting.permissions.error');
  } finally {
    busy.value = false;
  }
}

async function revokeRuleGroup(ruleIds: readonly string[]) {
  if (!local || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    for (const ruleId of ruleIds) {
      snapshot.value = await local.permissions({ action: 'revoke', ruleId });
    }
  } catch {
    error.value = t('setting.permissions.error');
  } finally {
    busy.value = false;
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

/** Keep persisted CRUD contracts; present the common read/write group to users. */
async function changeAccess(object: PermissionObject, access: AccessKind, event: Event) {
  const effect = (event.target as HTMLSelectElement).value as PermissionEffect;
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

onMounted(() => {
  void execute({ action: 'snapshot' });
});
</script>

<template>
  <section class="space-y-4 border-t border-border/70 pt-6" data-testid="ai-permission-settings">
    <header class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-medium">Permissions</h2>
        <p class="mt-1 text-xs leading-5 text-muted-foreground">
          {{ t('setting.permissions.description') }}
        </p>
      </div>
      <Button
        v-if="local"
        variant="ghost"
        size="icon"
        class="size-7 shrink-0"
        :disabled="busy"
        :title="t('setting.permissions.refresh')"
        :aria-label="t('setting.permissions.refresh')"
        data-testid="ai-permissions-refresh"
        @click="execute({ action: 'snapshot' })"
        ><RefreshCw class="size-3.5"
      /></Button>
    </header>
    <p v-if="!local" class="text-xs text-muted-foreground" data-testid="ai-permissions-unavailable">
      {{ t('setting.permissions.unavailable') }}
    </p>
    <p v-if="error" role="alert" class="text-xs text-destructive">{{ error }}</p>

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
          :class="selectedPreset === preset ? 'border-primary/65 bg-primary/5' : 'border-border/70'"
          :aria-pressed="selectedPreset === preset && !hasOverrides"
          :disabled="busy"
          :data-testid="`ai-permission-preset-${preset}`"
          @click="setPreset(preset)"
        >
          <span class="text-sm font-medium">{{ t(`setting.permissions.presets.${preset}`) }}</span>
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
          {{ t('setting.permissions.actions.read') }} · {{ summaryLabel(permissionsSummary.read) }}
        </span>
        <span class="text-muted-foreground">
          {{ t('setting.permissions.write') }} · {{ summaryLabel(permissionsSummary.write) }}
        </span>
        <span v-if="snapshot?.rules.length" class="text-muted-foreground">
          {{ t('setting.permissions.existingRules', { count: displayRules.length }) }}
        </span>
      </div>

      <details
        class="group rounded-lg border border-border/70"
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
                <td v-for="access in ['read', 'write'] as const" :key="access" class="py-1.5 pr-2">
                  <select
                    class="h-8 w-full min-w-24 rounded-md border border-border/70 bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45"
                    :disabled="busy"
                    :value="cell(object, access)"
                    :aria-label="`${t(`setting.permissions.objects.${object}`)} ${access === 'write' ? t('setting.permissions.write') : t('setting.permissions.actions.read')}`"
                    :data-testid="`ai-permission-cell-${object}-${access}`"
                    @change="changeAccess(object, access, $event)"
                  >
                    <option v-if="cell(object, access) === 'mixed'" value="mixed" disabled>
                      {{ t('setting.permissions.legacyMixed') }}
                    </option>
                    <option v-for="effect in effects" :key="effect" :value="effect">
                      {{ effectLabel(effect) }}
                    </option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <div class="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <LockKeyhole class="mt-0.5 size-3.5 shrink-0" />
        <p>{{ t('setting.permissions.limits') }}</p>
      </div>

      <details
        v-if="displayRules.length"
        class="group rounded-lg border border-border/70"
        data-testid="ai-permission-grants"
      >
        <summary
          class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden"
        >
          <span>{{ t('setting.permissions.grants') }} ({{ displayRules.length }})</span>
          <ChevronDown
            class="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <div class="space-y-2 border-t border-border/60 p-3">
          <div
            v-for="rule in displayRules"
            :key="rule.key"
            class="flex items-center justify-between gap-3 text-xs"
          >
            <span class="min-w-0">
              {{ t(`setting.permissions.objects.${rule.object}`) }} ·
              {{
                rule.action === 'write'
                  ? t('setting.permissions.write')
                  : t(`setting.permissions.actions.${rule.action}`)
              }}
              ·
              {{ effectLabel(rule.effect) }}
              <span v-if="rule.agentId" class="text-muted-foreground">
                · {{ t('setting.permissions.legacyAgentRule') }}</span
              >
            </span>
            <Button
              variant="outline"
              size="sm"
              class="h-7 shrink-0 text-xs"
              :disabled="busy"
              :data-testid="`ai-permission-revoke-${rule.ids[0]}`"
              @click="revokeRuleGroup(rule.ids)"
              >{{ t('setting.permissions.revoke') }}</Button
            >
          </div>
        </div>
      </details>

      <details
        v-if="snapshot?.audit.length"
        class="group rounded-lg border border-border/70"
        data-testid="ai-permission-activity"
      >
        <summary
          class="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden"
        >
          <span>{{ t('setting.permissions.activity') }}</span>
          <ChevronDown
            class="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>
        <ol class="space-y-2 border-t border-border/60 p-3 text-xs text-muted-foreground">
          <li v-for="record in snapshot?.audit" :key="record.id">
            {{ record.operationId }} · {{ effectLabel(record.decision) }} ·
            {{ new Date(record.occurredAt).toLocaleString() }}
          </li>
        </ol>
      </details>
    </template>
  </section>
</template>
