<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@memoflow/ui-vue-shadcn';
import type {
  AgentInstance,
  PermissionAction,
  PermissionEffect,
  PermissionObject,
  PermissionPreset,
  PermissionSnapshot,
  PermissionSettings,
} from '@memoflow/ai-contracts';
import { settingUiHost } from '../setting-ui-host';
const { t } = useI18n();
const local = inject(settingUiHost.AI_LOCAL_AGENT_KEY, undefined);
const registry = inject(settingUiHost.AI_AGENT_REGISTRY_KEY, undefined);
const snapshot = ref<PermissionSnapshot>();
const agents = ref<AgentInstance[]>([]);
const busy = ref(false);
const error = ref('');
const presets = ['read_only', 'confirm_each', 'on_demand', 'full_auto'] as const;
const objects: PermissionObject[] = [
  'goal',
  'key_result',
  'task',
  'routine',
  'knowledge',
  'notification',
  'ai_permission',
];
const actions: PermissionAction[] = ['read', 'create', 'update', 'delete'];
const effects: PermissionEffect[] = ['allow', 'ask', 'deny'];
const defaults = {
  read_only: ['allow', 'deny', 'deny', 'deny'],
  confirm_each: ['allow', 'ask', 'ask', 'ask'],
  on_demand: ['allow', 'allow', 'ask', 'ask'],
  full_auto: ['allow', 'allow', 'allow', 'allow'],
} as const;
const settings = computed(() => snapshot.value?.settings);
function agentName(id: string | null): string {
  if (id === null) return t('setting.permissions.global');
  return (
    agents.value.find((agent) => (agent.legacyConnectionId ?? agent.instanceId) === id)?.name ?? id
  );
}
function cell(object: PermissionObject, action: PermissionAction): PermissionEffect {
  if (object === 'ai_permission') return 'deny';
  if (settings.value?.preset === 'custom')
    return (
      settings.value.customMatrix?.[object]?.[action] ?? defaults.on_demand[actions.indexOf(action)]
    );
  return defaults[settings.value?.preset ?? 'on_demand'][actions.indexOf(action)];
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
async function save(patch: Partial<PermissionSettings>) {
  if (settings.value)
    await execute({
      action: 'settings',
      settings: { ...settings.value, ...patch },
    });
}
async function matrix(object: PermissionObject, action: PermissionAction, event: Event) {
  const customMatrix = Object.fromEntries(
    objects.map((object) => [
      object,
      Object.fromEntries(actions.map((action) => [action, cell(object, action)])),
    ]),
  ) as NonNullable<PermissionSettings['customMatrix']>;
  customMatrix[object][action] = (event.target as HTMLSelectElement).value as PermissionEffect;
  await save({ preset: 'custom', customMatrix });
}
async function agent(id: string, event: Event) {
  const agentPresets = { ...settings.value?.agentPresets };
  const value = (event.target as HTMLSelectElement).value;
  if (value === 'inherit') delete agentPresets[id];
  else agentPresets[id] = value as PermissionPreset;
  await save({ agentPresets });
}
onMounted(async () => {
  await execute({ action: 'snapshot' });
  try {
    agents.value = (await registry?.list())?.instances ?? [];
  } catch {
    error.value = t('setting.permissions.error');
  }
});
</script>
<template>
  <section class="space-y-6" data-testid="ai-permission-settings">
    <header>
      <h2 class="text-lg font-semibold">
        {{ t('setting.permissions.title') }}
      </h2>
      <p class="mt-2 text-sm text-muted-foreground">
        {{ t('setting.permissions.description') }}
      </p>
    </header>
    <p v-if="!local" data-testid="ai-permissions-unavailable">
      {{ t('setting.permissions.unavailable') }}
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <Button
      v-if="local"
      variant="outline"
      :disabled="busy"
      data-testid="ai-permissions-refresh"
      @click="execute({ action: 'snapshot' })"
      >{{ t('setting.permissions.refresh') }}</Button
    >
    <template v-if="settings">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          v-for="preset in presets"
          :key="preset"
          type="button"
          class="rounded-xl border p-4 text-left hover:bg-muted"
          :class="settings.preset === preset ? 'border-primary bg-primary/5' : ''"
          :aria-pressed="settings.preset === preset"
          :disabled="busy"
          :data-testid="`ai-permission-preset-${preset}`"
          @click="save({ preset, customMatrix: undefined })"
        >
          <span class="block font-medium">{{ t(`setting.permissions.presets.${preset}`) }}</span
          ><span class="mt-2 block text-xs text-muted-foreground">{{
            t(`setting.permissions.hints.${preset}`)
          }}</span>
        </button>
      </div>
      <p data-testid="ai-permission-current-preset">
        {{ t('setting.permissions.current') }}:
        {{ t(`setting.permissions.presets.${settings.preset}`) }}
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm" data-testid="ai-permission-matrix">
          <thead>
            <tr>
              <th class="p-2 text-left">
                {{ t('setting.permissions.object') }}
              </th>
              <th v-for="action in actions" :key="action" class="p-2">
                {{ t(`setting.permissions.actions.${action}`) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="object in objects" :key="object" class="border-t">
              <th class="p-2 text-left font-normal">
                {{ t(`setting.permissions.objects.${object}`) }}
              </th>
              <td v-for="action in actions" :key="action" class="p-2">
                <select
                  class="w-full rounded border bg-background p-2"
                  :value="cell(object, action)"
                  :disabled="busy || object === 'ai_permission'"
                  :aria-label="`${t(`setting.permissions.objects.${object}`)} ${t(`setting.permissions.actions.${action}`)}`"
                  :data-testid="`ai-permission-cell-${object}-${action}`"
                  @change="matrix(object, action, $event)"
                >
                  <option v-for="effect in effects" :key="effect" :value="effect">
                    {{ t(`setting.permissions.effects.${effect}`) }}
                  </option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-xs text-muted-foreground">
        {{ t('setting.permissions.limits') }}
      </p>
      <section class="space-y-3">
        <h3 class="font-medium">{{ t('setting.permissions.agents') }}</h3>
        <label
          v-for="item in agents"
          :key="item.instanceId"
          class="flex items-center justify-between gap-3 rounded-lg border p-3"
          ><span>{{ item.name }}</span
          ><select
            class="rounded border bg-background p-2"
            :disabled="busy"
            :value="settings.agentPresets[item.legacyConnectionId ?? item.instanceId] ?? 'inherit'"
            :data-testid="`ai-permission-agent-${item.instanceId}`"
            @change="agent(item.legacyConnectionId ?? item.instanceId, $event)"
          >
            <option value="inherit">
              {{ t('setting.permissions.inherit') }}
            </option>
            <option v-for="preset in presets" :key="preset" :value="preset">
              {{ t(`setting.permissions.presets.${preset}`) }}
            </option>
          </select></label
        >
      </section>
      <section class="space-y-3" data-testid="ai-permission-grants">
        <h3 class="font-medium">{{ t('setting.permissions.grants') }}</h3>
        <p v-if="!snapshot?.rules.length">
          {{ t('setting.permissions.empty') }}
        </p>
        <div
          v-for="rule in snapshot?.rules"
          :key="rule.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
        >
          <div>
            <p>
              {{ agentName(rule.agentId) }} ·
              {{ t(`setting.permissions.objects.${rule.object}`) }} ·
              {{ t(`setting.permissions.actions.${rule.action}`) }} ·
              {{ t(`setting.permissions.effects.${rule.effect}`) }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ t(`setting.permissions.sources.${rule.source}`)
              }}<template v-if="rule.createdAt">
                · {{ new Date(rule.createdAt).toLocaleString() }}</template
              ><template v-else> · {{ t('setting.permissions.unknownTime') }}</template>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            :disabled="busy"
            :data-testid="`ai-permission-revoke-${rule.id}`"
            @click="execute({ action: 'revoke', ruleId: rule.id })"
            >{{ t('setting.permissions.revoke') }}</Button
          >
        </div>
      </section>
      <section class="space-y-3" data-testid="ai-permission-activity">
        <h3 class="font-medium">{{ t('setting.permissions.activity') }}</h3>
        <p v-if="!snapshot?.audit.length">
          {{ t('setting.permissions.empty') }}
        </p>
        <ol class="space-y-2">
          <li
            v-for="record in snapshot?.audit"
            :key="record.id"
            class="rounded-lg border p-3 text-sm"
          >
            <p>
              {{ agentName(record.agentId) }} · {{ record.operationId }} ·
              {{ t(`setting.permissions.effects.${record.decision}`) }} ·
              {{ t(`setting.permissions.executions.${record.execution}`) }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ new Date(record.occurredAt).toLocaleString() }} ·
              {{ t(`setting.permissions.decidedBy.${record.decidedBy}`) }}
            </p>
          </li>
        </ol>
      </section>
    </template>
  </section>
</template>
