<script setup lang="ts">
import { presentErrorMessage } from '@memoflow/http-client';
import { ResultErrorException } from '@memoflow/contracts/result';
import { computed, onBeforeUnmount, ref } from 'vue';
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
import type { DeviceKeymap } from '@memoflow/contracts/shared';
import { keyboard } from '../../../shared/keyboard/runtime';
import {
  eventChord,
  normalizeChord,
  validateKeymap,
  displayChord,
} from '../../../shared/keyboard/keymap';
import { saveDeviceKeymap } from '../../../shared/keyboard/device-keymap';
import type { KeyboardCommandId } from '../../../shared/keyboard/commands';

const search = ref('');
const editing = ref<KeyboardCommandId | null>(null);
const recorded = ref<string | null>(null);
const message = ref('');
const busy = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const scopeNames = { app: '应用', workspace: '工作区', preview: '预览', list: '列表' };
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
    return { ...validateKeymap(draft.value, keyboard.engine.host), error: '' };
  } catch (error) {
    return { conflicts: [], error: error instanceof Error ? error.message : '无效配置' };
  }
});
const conflictTitles = computed(() =>
  [...new Set(validation.value.conflicts.flatMap((c) => c.commands))]
    .filter((id) => id !== editing.value)
    .map((id) => keyboard.commands.value.find((c) => c.id === id)?.title ?? id)
    .join('、'),
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
    const chord = eventChord(event, keyboard.engine.host);
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
            normalizeChord(key, keyboard.engine.host) ===
            normalizeChord(command.keys[index]!, keyboard.engine.host),
        )
      )
        delete next.overrides[command.id];
    }
    await saveDeviceKeymap(next);
    message.value = '已保存到此设备，即时生效';
    stopRecording();
  } catch (error) {
    message.value =
      error instanceof ResultErrorException || error instanceof DOMException
        ? presentErrorMessage(error, '保存失败')
        : error instanceof Error
          ? error.message
          : '保存失败';
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
            (key) => normalizeChord(key, keyboard.engine.host) !== conflict.chord,
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
async function resetAll() {
  if (
    await useConfirm({
      title: '恢复默认快捷键',
      description: '清除此设备当前用户的所有自定义键位？',
      confirmText: '恢复默认',
      cancelText: '取消',
    })
  )
    await save({ version: 1, overrides: {} });
}
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
    if (file.size > 65536) throw new Error('配置文件不能超过 64 KB');
    const parsed = validateKeymap(JSON.parse(await file.text()), keyboard.engine.host);
    if (parsed.conflicts.length)
      throw new Error(`导入配置存在冲突：${parsed.conflicts.map((c) => c.chord).join('、')}`);
    if (
      await useConfirm({
        title: '导入快捷键',
        description: `将替换此设备的自定义配置（${Object.keys(parsed.keymap.overrides).length} 条覆盖）。`,
        confirmText: '导入',
        cancelText: '取消',
      })
    )
      await save(parsed.keymap);
  } catch (error) {
    message.value = error instanceof Error ? error.message : '导入失败';
  } finally {
    input.value = '';
  }
}
onBeforeUnmount(stopRecording);
</script>

<template>
  <section class="space-y-6" data-testid="keyboard-settings">
    <header class="space-y-2">
      <h2 class="text-xl font-semibold tracking-tight">快捷键</h2>
      <p class="text-sm text-muted-foreground">
        此设备 · 当前用户配置。修改即时生效，通过导入导出迁移到其他设备。
      </p>
      <p class="text-xs text-muted-foreground">
        数字键预览，Enter 进入，Alt + 数字直达。J / K 仅在列表获得焦点时生效。
      </p>
    </header>
    <div class="flex flex-wrap items-center gap-2">
      <Input
        v-model="search"
        class="min-w-48 flex-1"
        placeholder="搜索命令或快捷键…"
        aria-label="搜索快捷键"
      />
      <Button variant="outline" :disabled="busy" @click="fileInput?.click()">导入</Button>
      <Button variant="outline" @click="exportKeymap">导出</Button>
      <Button variant="ghost" :disabled="busy" @click="resetAll">恢复默认</Button>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        class="hidden"
        aria-label="导入快捷键配置"
        @change="importKeymap"
      />
    </div>
    <p v-if="keyboard.storageError.value" role="alert" class="text-sm text-destructive">
      {{ keyboard.storageError.value }}；当前使用默认键位。
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
          <p class="mt-1 text-xs text-muted-foreground">{{ scopeNames[command.scope] }}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="min-w-24 font-mono"
          :aria-label="`录制：${command.title}`"
          :disabled="busy"
          @click="record(command.id)"
          >{{
            command.keys.map((key) => displayChord(key, keyboard.engine.host)).join(' / ') ||
            '未绑定'
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
          :aria-label="`${command.keys.length ? '禁用' : '启用'}：${command.title}`"
          @click="toggle(command.id)"
          >{{ command.keys.length ? '禁用' : '启用' }}</Button
        >
        <Button
          variant="ghost"
          size="sm"
          :disabled="
            busy ||
            (!(command.id in keyboard.keymap.value.overrides) &&
              !keyboard.keymap.value.disabled?.includes(command.id))
          "
          :aria-label="`重置：${command.title}`"
          @click="reset(command.id)"
          >重置</Button
        >
      </div>
      <p v-if="!commands.length" class="p-6 text-center text-sm text-muted-foreground">
        没有匹配的快捷键
      </p>
    </div>
    <p class="text-xs leading-relaxed text-muted-foreground">
      Alt 组合键可能被系统或浏览器扩展占用；macOS 使用
      Option，组合中的字母和数字按物理键位匹配。已知浏览器保留键会被阻止绑定。应用快捷键只在
      MemoFlow 获得焦点时生效。
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
          ><DialogTitle>录制快捷键</DialogTitle
          ><DialogDescription
            >按下新的按键组合。Tab 停止录制并移至操作按钮，Esc 取消。</DialogDescription
          ></DialogHeader
        >
        <div
          class="rounded-lg border bg-muted/30 py-8 text-center font-mono text-xl"
          aria-live="polite"
        >
          {{ recorded || (keyboard.recorder.value ? '等待按键…' : '按 Esc 返回后重新录制') }}
        </div>
        <p v-if="validation.error" role="alert" class="text-sm text-destructive">
          {{ validation.error }}
        </p>
        <p v-if="conflictTitles" role="alert" class="text-sm text-destructive">
          与 {{ conflictTitles }} 冲突。可替换其绑定，或录制其他按键。
        </p>
        <p v-if="message" role="status" class="text-sm text-destructive">{{ message }}</p>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" @click="stopRecording">取消</Button>
          <Button
            v-if="conflictTitles"
            :disabled="busy || !!validation.error"
            @click="saveRecorded(true)"
            >替换冲突绑定</Button
          >
          <Button v-else :disabled="busy || !recorded || !!validation.error" @click="saveRecorded()"
            >保存</Button
          >
        </div>
      </DialogContent>
    </Dialog>
  </section>
</template>
