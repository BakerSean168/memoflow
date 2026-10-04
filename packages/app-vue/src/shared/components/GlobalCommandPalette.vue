<script setup lang="ts">
/**
 * GlobalCommandPalette.vue
 *
 * 全局命令面板，Ctrl+K / Cmd+K 唤起。
 * 基于 shadcn-vue 的 CommandDialog 组件。
 *
 * 使用方式：
 *   1. 在 App.vue 中挂载 <GlobalCommandPalette />
 *   2. 通过 registerStaticCommands / registerDynamicCommands 注册命令
 *   3. 用户按 Ctrl+K 即可呼出
 */
import { useI18n } from 'vue-i18n';
import { _getCommandPaletteState, _setOpen, useCommandGroups } from '@memoflow/ui-vue-shadcn';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@memoflow/ui-vue-shadcn';

const state = _getCommandPaletteState();
const groups = useCommandGroups();
const { t } = useI18n();

function handleSelect(action: () => void) {
  _setOpen(false);
  // Execute after dialog closes for smooth transition
  setTimeout(action, 150);
}
</script>

<template>
  <CommandDialog :open="state.open" @update:open="_setOpen">
    <CommandInput :placeholder="t('common.commandPalettePlaceholder')" />
    <CommandList>
      <CommandEmpty>{{ t('common.noMatchingCommands') }}</CommandEmpty>
      <template v-for="(group, index) in groups" :key="group.id">
        <CommandSeparator v-if="index > 0" />
        <CommandGroup :heading="group.label">
          <CommandItem
            v-for="item in group.items"
            :key="item.id"
            :value="item.label"
            @select="() => handleSelect(item.action)"
          >
            <span class="flex-1">{{ item.label }}</span>
            <kbd
              v-if="item.shortcut"
              class="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground"
            >
              {{ item.shortcut }}
            </kbd>
          </CommandItem>
        </CommandGroup>
      </template>
    </CommandList>
  </CommandDialog>
</template>
