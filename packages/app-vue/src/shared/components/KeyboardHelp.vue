<script setup lang="ts">
import { displayChord } from '../keyboard/keymap';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
} from '@memoflow/ui-vue-shadcn';
import { keyboard } from '../keyboard/runtime';
</script>
<template>
  <Dialog v-model:open="keyboard.helpOpen.value">
    <DialogContent class="max-h-[80vh] max-w-2xl overflow-y-auto" data-testid="keyboard-help">
      <DialogHeader
        ><DialogTitle>快捷键</DialogTitle
        ><DialogDescription
          >数字键打开预览；J / K 选择；Enter 进入；Esc
          关闭。输入文字时普通字符快捷键暂停。</DialogDescription
        ></DialogHeader
      >
      <dl class="divide-y">
        <template
          v-for="command in keyboard.commands.value.filter((c) => c.keys.length)"
          :key="command.id"
        >
          <div class="flex items-center justify-between gap-4 py-2 text-sm">
            <dt>
              {{ command.title }}
              <span class="text-xs text-muted-foreground">{{
                command.scope === 'preview' ? '· 预览' : command.scope === 'list' ? '· 列表' : ''
              }}</span>
            </dt>
            <dd class="shrink-0 font-mono text-xs">
              {{ command.keys.map((key) => displayChord(key, keyboard.engine.host)).join(' / ') }}
            </dd>
          </div>
        </template>
      </dl>
      <Button
        variant="outline"
        @click="
          keyboard.helpOpen.value = false;
          keyboard.engine.execute('app.shortcuts');
        "
        >自定义快捷键</Button
      >
    </DialogContent>
  </Dialog>
</template>
