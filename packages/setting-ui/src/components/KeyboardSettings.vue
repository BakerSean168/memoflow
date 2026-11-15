<script setup lang="ts">
import { presentErrorMessage } from '@memoflow/http-client';
import { ResultErrorException } from '@memoflow/transport-contracts/result';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  useConfirm,
} from '@memoflow/ui-vue-shadcn';
import type { DeviceKeymap, KeyboardCommandId } from '@memoflow/desktop-contracts';
import { settingUiHost, type SettingShortcutScope } from '../setting-ui-host';
import { useSettingsSectionReset } from '../composables/useSettingsSectionReset';

const { t } = useI18n();
const keyboard = settingUiHost.keyboard;

const search = ref('');
const editing = ref<KeyboardCommandId | null>(null);
const recorded = ref<string | null>(null);
const message = ref('');
const busy = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const scopeLabel = (scope: SettingShortcutScope) => t(`setting.keyboard.scopes.${scope}`);
const listSeparator = computed(() => t('setting.keyboard.listSeparator'));
const commands = computed(() =>
  keyboard.commands.value.filter((c) =>
    `${c.title} ${c.id} ${c.keys.join(' ')}`.toLowerCase().includes(search.value.toLowerCase()),
  ),
);
const draft = computed<DeviceKeymap>(() => ({
  version: 1,
  disabled: keyboard.keymap.value.disabled?.filter((id) => id !== editing.value),
  overrides: {
    ...keyboard.keymap.value.overrides,
    ...(editing.value && recorded.value ? { [editing.value]: [recorded.value] } : {}),
  },
}));
const validation = computed(() => {
  try {
    return { ...settingUiHost.validateKeymap(draft.value, keyboard.engine.host), error: '' };
  } catch (error) {
    return {
      conflicts: [],
      error: error instanceof Error ? error.message : t('setting.keyboard.invalidKeymap'),
    };
  }
});
const conflictTitles = computed(() =>
  [...new Set(validation.value.conflicts.flatMap((c) => c.commands))]
    .filter((id) => id !== editing.value)
    .map((id) => keyboard.commands.value.find((c) => c.id === id)?.title ?? id)
    .join(listSeparator.value),
);
function stopRecording() {
  keyboard.recorder.value = null;
  editing.value = null;
  recorded.value = null;
}
function record(id: KeyboardCommandId) {
  editing.value = id;
  recorded.value = null;
  message.value = '';
  keyboard.recorder.value = (event) => {
    if (event.key === 'Escape') {
      stopRecording();
      return;
    }
    if (event.repeat) return;
    const chord = settingUiHost.eventChord(event, keyboard.engine.host);
    if (chord) recorded.value = chord;
  };
}
async function save(input: DeviceKeymap) {
  busy.value = true;
  message.value = '';
  try {
    // Store only deviations, so future defaults remain discoverable.
    const next: DeviceKeymap = { ...input, overrides: { ...input.overrides } };
    if (!next.disabled?.length) delete next.disabled;
    for (const command of keyboard.engine.definitions) {
      const keys = next.overrides[command.id];
      if (
        keys &&
        keys.length === command.keys.length &&
        keys.every(
          (key, index) =>
            settingUiHost.normalizeChord(key, keyboard.engine.host) ===
            settingUiHost.normalizeChord(command.keys[index]!, keyboard.engine.host),
        )
      )
        delete next.overrides[command.id];
    }
    await settingUiHost.saveDeviceKeymap(next);
    message.value = t('setting.keyboard.saved');
    stopRecording();
  } catch (error) {
    message.value =
      error instanceof ResultErrorException || error instanceof DOMException
        ? presentErrorMessage(error, t('setting.keyboard.saveFailed'))
        : error instanceof Error
          ? error.message
          : t('setting.keyboard.saveFailed');
  } finally {
    busy.value = false;
  }
}
async function saveRecorded(replace = false) {
  if (!recorded.value || !editing.value || validation.value.error) return;
  const next = { ...draft.value, overrides: { ...draft.value.overrides } };
  if (replace) {
    for (const conflict of validation.value.conflicts) {
      for (const id of conflict.commands) {
        if (id === editing.value) continue;
        const command = keyboard.commands.value.find((c) => c.id === id);
        if (command)
          next.overrides[command.id] = command.keys.filter(
            (key) => settingUiHost.normalizeChord(key, keyboard.engine.host) !== conflict.chord,
          );
      }
    }
  }
  await save(next);
}
function reset(id: KeyboardCommandId) {
  const overrides = { ...keyboard.keymap.value.overrides };
  delete overrides[id];
  void save({
    version: 1,
    overrides,
    disabled: keyboard.keymap.value.disabled?.filter((key) => key !== id),
  });
}
function toggle(id: KeyboardCommandId) {
  const command = keyboard.commands.value.find((c) => c.id === id)!;
  const disabled = keyboard.keymap.value.disabled ?? [];
  if (disabled.includes(id))
    void save({ ...keyboard.keymap.value, disabled: disabled.filter((key) => key !== id) });
  else if (!command.keys.length) reset(id);
  else void save({ ...keyboard.keymap.value, disabled: [...disabled, id] });
}
async function applyDefaultKeymap() {
  await save({ version: 1, overrides: {} });
}
async function resetAll() {
  if (
    await useConfirm({
      title: t('setting.keyboard.restoreConfirm.title'),
      description: t('setting.keyboard.restoreConfirm.description'),
      confirmText: t('setting.keyboard.restoreConfirm.confirm'),
      cancelText: t('setting.keyboard.restoreConfirm.cancel'),
    })
  )
    await applyDefaultKeymap();
}
// The settings shell restores the active section through the same action.
useSettingsSectionReset('shortcuts', applyDefaultKeymap);
function exportKeymap() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(keyboard.keymap.value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'memoflow-keymap.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importKeymap(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  try {
    if (!file) return;
    if (file.size > 65536) throw new Error(t('setting.keyboard.fileTooLarge'));
    const parsed = settingUiHost.validateKeymap(
      JSON.parse(await file.text()),
      keyboard.engine.host,
    );
    if (parsed.conflicts.length)
      throw new Error(
        t('setting.keyboard.importConflicts', {
          chords: parsed.conflicts.map((c) => c.chord).join(listSeparator.value),
        }),
      );
    if (
      await useConfirm({
        title: t('setting.keyboard.importConfirm.title'),
        description: t('setting.keyboard.importConfirm.description', {
          count: Object.keys(parsed.keymap.overrides).length,
        }),
        confirmText: t('setting.keyboard.importConfirm.confirm'),
        cancelText: t('setting.keyboard.importConfirm.cancel'),
      })
    )
      await save(parsed.keymap);
  } catch (error) {
    message.value = error instanceof Error ? error.message : t('setting.keyboard.importFailed');
  } finally {
    input.value = '';
  }
}
onBeforeUnmount(stopRecording);
</script>

<template>
  <section class="space-y-6" data-testid="keyboard-settings">
    <header class="space-y-2">
      <h2 class="text-xl font-semibold tracking-tight">{{ t('setting.keyboard.title') }}</h2>
      <p class="text-sm text-muted-foreground">
        {{ t('setting.keyboard.description') }}
      </p>
      <p class="text-xs text-muted-foreground">
        {{ t('setting.keyboard.hints') }}
      </p>
    </header>
    <div class="flex flex-wrap items-center gap-2">
      <Input
        v-model="search"
        class="min-w-48 flex-1"
        :placeholder="t('setting.keyboard.searchPlaceholder')"
        :aria-label="t('setting.keyboard.searchAria')"
      />
      <Button variant="outline" :disabled="busy" @click="fileInput?.click()">{{
        t('setting.keyboard.import')
      }}</Button>
      <Button variant="outline" @click="exportKeymap">{{ t('setting.keyboard.export') }}</Button>
      <Button variant="ghost" :disabled="busy" @click="resetAll">{{
        t('setting.keyboard.restoreDefaults')
      }}</Button>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        class="hidden"
        :aria-label="t('setting.keyboard.importAria')"
        @change="importKeymap"
      />
    </div>
    <p v-if="keyboard.storageError.value" role="alert" class="text-sm text-destructive">
      {{ t('setting.keyboard.storageFallback', { error: keyboard.storageError.value }) }}
    </p>
    <p v-if="message" role="status" class="text-sm" data-testid="keyboard-settings-status">
      {{ message }}
    </p>
    <div class="divide-y rounded-xl border">
      <div
        v-for="command in commands"
        :key="command.id"
        class="flex flex-wrap items-center gap-3 px-4 py-3"
        :data-testid="`shortcut-${command.id}`"
      >
        <div class="min-w-40 flex-1">
          <p class="text-sm font-medium">{{ command.title }}</p>
          <p class="mt-1 text-xs text-muted-foreground">{{ scopeLabel(command.scope) }}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="min-w-24 font-mono"
          :aria-label="t('setting.keyboard.recordAria', { title: command.title })"
          :disabled="busy"
          @click="record(command.id)"
          >{{
            command.keys
              .map((key) => settingUiHost.displayChord(key, keyboard.engine.host))
              .join(' / ') || t('setting.keyboard.unbound')
          }}</Button
        >
        <Button
          variant="ghost"
          size="sm"
          :disabled="
            busy ||
            (!command.keys.length &&
              !keyboard.keymap.value.disabled?.includes(command.id) &&
              !keyboard.engine.definitions.find((c) => c.id === command.id)?.keys.length)
          "
          :aria-label="
            t(
              command.keys.length ? 'setting.keyboard.disableAria' : 'setting.keyboard.enableAria',
              { title: command.title },
            )
          "
          @click="toggle(command.id)"
          >{{
            command.keys.length ? t('setting.keyboard.disable') : t('setting.keyboard.enable')
          }}</Button
        >
        <Button
          variant="ghost"
          size="sm"
          :disabled="
            busy ||
            (!(command.id in keyboard.keymap.value.overrides) &&
              !keyboard.keymap.value.disabled?.includes(command.id))
          "
          :aria-label="t('setting.keyboard.resetAria', { title: command.title })"
          @click="reset(command.id)"
          >{{ t('setting.keyboard.reset') }}</Button
        >
      </div>
      <p v-if="!commands.length" class="p-6 text-center text-sm text-muted-foreground">
        {{ t('setting.keyboard.empty') }}
      </p>
    </div>
    <p class="text-xs leading-relaxed text-muted-foreground">
      {{ t('setting.keyboard.notes') }}
    </p>
    <Dialog
      :open="editing !== null"
      @update:open="
        (open) => {
          if (!open) stopRecording();
        }
      "
    >
      <DialogContent data-testid="shortcut-recorder">
        <DialogHeader
          ><DialogTitle>{{ t('setting.keyboard.recorder.title') }}</DialogTitle
          ><DialogDescription>{{
            t('setting.keyboard.recorder.description')
          }}</DialogDescription></DialogHeader
        >
        <div
          class="rounded-lg border bg-muted/30 py-8 text-center font-mono text-xl"
          aria-live="polite"
        >
          {{
            recorded ||
            (keyboard.recorder.value
              ? t('setting.keyboard.recorder.waiting')
              : t('setting.keyboard.recorder.idle'))
          }}
        </div>
        <p v-if="validation.error" role="alert" class="text-sm text-destructive">
          {{ validation.error }}
        </p>
        <p v-if="conflictTitles" role="alert" class="text-sm text-destructive">
          {{ t('setting.keyboard.recorder.conflict', { titles: conflictTitles }) }}
        </p>
        <p v-if="message" role="status" class="text-sm text-destructive">{{ message }}</p>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" @click="stopRecording">{{
            t('setting.keyboard.recorder.cancel')
          }}</Button>
          <Button
            v-if="conflictTitles"
            :disabled="busy || !!validation.error"
            @click="saveRecorded(true)"
            >{{ t('setting.keyboard.recorder.replace') }}</Button
          >
          <Button
            v-else
            :disabled="busy || !recorded || !!validation.error"
            @click="saveRecorded()"
            >{{ t('setting.keyboard.recorder.save') }}</Button
          >
        </div>
      </DialogContent>
    </Dialog>
  </section>
</template>
