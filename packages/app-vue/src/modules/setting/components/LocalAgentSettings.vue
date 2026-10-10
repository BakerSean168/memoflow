<template>
  <section v-if="client" class="space-y-4 rounded-xl border p-4" data-testid="ai-local-settings">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="font-semibold">{{ t('aiAssistant.local.connections') }}</h3>
        <p class="mt-1 text-xs text-muted-foreground">{{ t('aiAssistant.local.description') }}</p>
      </div>
      <Button size="sm" variant="outline" :disabled="busy" @click="refresh">{{
        t('aiAssistant.local.refresh')
      }}</Button>
    </div>
    <p v-if="error" role="alert" class="text-sm text-destructive">
      {{ t('aiAssistant.local.actionFailed') }}
    </p>
    <div
      v-for="connection in connections"
      :key="connection.id"
      class="space-y-2 rounded-lg border p-3"
    >
      <p class="text-sm font-medium">
        {{ connection.name }} · {{ connection.driver }}
        <span v-if="!connection.enabled">· {{ t('aiAssistant.local.disabled') }}</span>
      </p>
      <p class="break-all text-xs text-muted-foreground">{{ connection.executablePath }}</p>
      <p v-if="statuses[connection.id]" class="text-xs" role="status">
        {{ statusLabel(statuses[connection.id]) }}
      </p>
      <div class="flex gap-2">
        <Button size="sm" variant="outline" :disabled="busy" @click="probe(connection.id)">{{
          t('aiAssistant.local.check')
        }}</Button>
        <Button size="sm" variant="outline" :disabled="busy" @click="edit(connection)">{{
          t('aiAssistant.local.edit')
        }}</Button>
        <Button size="sm" variant="ghost" :disabled="busy" @click="remove(connection.id)">{{
          t('aiAssistant.local.remove')
        }}</Button>
      </div>
    </div>
    <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="save">
      <label class="space-y-1 text-sm"
        ><span>{{ t('aiAssistant.local.driver') }}</span
        ><select v-model="form.driver" class="block w-full rounded-md border bg-background p-2">
          <option value="codex">Codex</option>
          <option value="claude">Claude Code</option>
          <option value="pi">Pi</option>
          <option value="dsh">DeepSeek Harness (DSH)</option>
        </select></label
      >
      <label class="space-y-1 text-sm"
        ><span>{{ t('aiAssistant.local.name') }}</span
        ><Input v-model="form.name" required :maxlength="120"
      /></label>
      <label class="space-y-1 text-sm"
        ><span>{{ t('aiAssistant.local.executable') }}</span
        ><Input v-model="form.executablePath" required :maxlength="4096" :placeholder="form.driver"
      /></label>
      <label class="space-y-1 text-sm"
        ><span>{{ t('aiAssistant.local.home') }}</span
        ><Input v-model="form.homePath" :maxlength="4096"
      /></label>
      <label class="flex items-center gap-2 text-sm"
        ><input v-model="form.enabled" type="checkbox" />{{ t('aiAssistant.local.enabled') }}</label
      >
      <fieldset class="space-y-1 text-sm">
        <legend>{{ t('aiAssistant.local.writeScopes') }}</legend>
        <label v-for="scope in scopes" :key="scope" class="mr-3 inline-flex items-center gap-1"
          ><input v-model="form.writeScopes" type="checkbox" :value="scope" />{{
            t(
              scope === 'goals:write'
                ? 'aiAssistant.local.goalWrites'
                : 'aiAssistant.local.taskWrites',
            )
          }}</label
        >
      </fieldset>
      <p class="text-xs text-muted-foreground sm:col-span-2">
        {{ t('aiAssistant.local.removalHint') }}
      </p>
      <div class="flex gap-2">
        <Button type="submit" size="sm" :disabled="busy">{{ t('aiAssistant.local.save') }}</Button
        ><Button v-if="editing" type="button" size="sm" variant="outline" @click="reset">{{
          t('aiAssistant.local.cancel')
        }}</Button>
      </div>
    </form>
  </section>
</template>
<script setup lang="ts">
import { inject, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input } from '@memoflow/ui-vue-shadcn';
import {
  LocalAgentConnectionInputSchema,
  type LocalAgentConnection,
  type LocalAgentConnectionInput,
  type LocalAgentStatus,
} from '@memoflow/contracts/ai';
import { AI_LOCAL_AGENT_KEY } from '../../../di/keys';
const client = inject(AI_LOCAL_AGENT_KEY, undefined);
const { t } = useI18n();
const connections = ref<LocalAgentConnection[]>([]);
const statuses = ref<Record<string, LocalAgentStatus>>({});
const busy = ref(false);
const error = ref(false);
const editing = ref<LocalAgentConnection | null>(null);
const scopes = ['goals:write', 'tasks:write'] as const;
const form = reactive<LocalAgentConnectionInput>({
  driver: 'codex',
  name: 'Codex',
  executablePath: 'codex',
  homePath: '',
  enabled: true,
  writeScopes: [],
});
watch(
  () => form.driver,
  (driver, previous) => {
    if (form.executablePath === previous) form.executablePath = driver;
    if (form.name.toLowerCase() === previous)
      form.name =
        driver === 'dsh'
          ? 'DeepSeek Harness (DSH)'
          : driver === 'pi'
            ? 'Pi'
            : driver === 'claude'
              ? 'Claude Code'
              : 'Codex';
  },
);
async function action(work: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = false;
  try {
    await work();
  } catch {
    error.value = true;
  } finally {
    busy.value = false;
  }
}
async function refresh() {
  if (client)
    await action(async () => {
      connections.value = await client.listConnections();
    });
}
function edit(connection: LocalAgentConnection) {
  editing.value = connection;
  Object.assign(form, {
    driver: connection.driver,
    name: connection.name,
    executablePath: connection.executablePath,
    homePath: connection.homePath ?? '',
    enabled: connection.enabled,
    writeScopes: [...connection.writeScopes],
  });
}
function reset() {
  editing.value = null;
  Object.assign(form, {
    driver: 'codex',
    name: 'Codex',
    executablePath: 'codex',
    homePath: '',
    enabled: true,
    writeScopes: [],
  });
}
async function save() {
  if (!client) return;
  await action(async () => {
    await client.saveConnection(
      LocalAgentConnectionInputSchema.parse({
        ...form,
        homePath: form.homePath?.trim() || undefined,
      }),
      editing.value?.id,
      editing.value?.revision,
    );
    connections.value = await client.listConnections();
    reset();
  });
}
async function probe(id: string) {
  if (client)
    await action(async () => {
      statuses.value[id] = await client.probeConnection(id);
    });
}
async function remove(id: string) {
  if (client)
    await action(async () => {
      await client.deleteConnection(id);
      connections.value = await client.listConnections();
      if (editing.value?.id === id) reset();
    });
}
function statusLabel(status: LocalAgentStatus) {
  return status.status === 'ready'
    ? t('aiAssistant.local.ready', { count: status.models.length })
    : status.message;
}
onMounted(refresh);
</script>
