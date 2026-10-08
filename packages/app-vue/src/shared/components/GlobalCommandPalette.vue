<script setup lang="ts">
import { displayChord } from '../keyboard/keymap';
/** Displays the runtime command catalog and its current device bindings. */
import { computed } from 'vue';
import { keyboard } from '../keyboard/runtime';
import { useI18n } from 'vue-i18n';
import { _getCommandPaletteState, _setOpen } from '@memoflow/ui-vue-shadcn';
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
const groups = computed(() => [
  {
    id: 'commands',
    label: '命令',
    items: keyboard.commands.value
      .filter(
        (command) =>
          command.scope !== 'list' &&
          command.scope !== 'preview' &&
          keyboard.engine.available(command.id),
      )
      .map((command) => ({
        id: command.id,
        label: command.title,
        shortcut: command.keys.map((key) => displayChord(key, keyboard.engine.host)).join(' / '),
        action: () => keyboard.engine.execute(command.id),
      })),
  },
]);
const { t } = useI18n();

function handleSelect(action: () => void) {
  _setOpen(false);
  action();
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
