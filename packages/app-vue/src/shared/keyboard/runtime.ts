import { presentErrorMessage } from '@memoflow/http-client';
import { computed, ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { _getCommandPaletteState, toggleCommandPalette } from '@memoflow/ui-vue-shadcn';
import { toast } from 'vue-sonner';
import { hasDesktopAuthApi } from '../utils/desktop-auth-recovery';
import { DeviceKeymapSchema, type DeviceKeymap } from '@memoflow/contracts/shared';
import { createShortcutEngine, type CommandHandler } from './shortcut-engine';
import { keyboardModules, type KeyboardCommandId, type KeyboardHost } from './commands';
import { isKeyboardVisible, listAdapterFor } from './list-adapter';

function detectHost(): KeyboardHost {
  return {
    platform:
      typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
        ? 'mac'
        : typeof navigator !== 'undefined' && /Win/.test(navigator.platform)
          ? 'windows'
          : 'linux',
    desktop: typeof window !== 'undefined' && hasDesktopAuthApi(window),
  };
}
export const keyboard = (() => {
  const engine = createShortcutEngine(detectHost(), (error) =>
    toast.error(presentErrorMessage(error, '快捷键执行失败')),
  );
  const revision = ref(0);
  const preview = ref<string | null>(null);
  const helpOpen = ref(false);
  const recorder = ref<((event: KeyboardEvent) => void) | null>(null);
  const keymap = ref<DeviceKeymap>({ version: 1, overrides: {} });
  const storageError = ref<string | null>(null);
  let enterPreview: CommandHandler = () => {};
  let currentList: ReturnType<typeof listAdapterFor> = null;
  let previewOrigin: HTMLElement | null = null;
  function closePreview() {
    const id = preview.value;
    if (!id) return;
    const content = [
      ...document.querySelectorAll<HTMLElement>('[data-capsule-preview-content]'),
    ].find((el) => el.dataset.capsulePreviewContent === id);
    const restore = content?.contains(document.activeElement);
    preview.value = null;
    if (restore) {
      const origin = previewOrigin?.isConnected
        ? previewOrigin
        : document.querySelector<HTMLElement>(`[data-testid="capsule-preview-${id}"]`);
      origin?.focus({ preventScroll: true });
    }
    previewOrigin = null;
  }
  function register(id: KeyboardCommandId, handler: CommandHandler, available?: () => boolean) {
    const dispose = engine.register(id, handler, available);
    revision.value++;
    return () => {
      dispose();
      revision.value++;
    };
  }
  register('app.palette', () => toggleCommandPalette());
  register('app.help', () => {
    helpOpen.value = true;
  });
  for (const scope of ['preview', 'list'] as const) {
    register(
      `${scope}.next`,
      () => currentList?.moveSelection(1),
      () => Boolean(currentList?.visibleItems().length),
    );
    register(
      `${scope}.previous`,
      () => currentList?.moveSelection(-1),
      () => Boolean(currentList?.visibleItems().length),
    );
  }
  register('preview.open', () => {
    if (!currentList?.openItem()) return enterPreview();
  });
  register('preview.close', closePreview);
  register(
    'list.open',
    () => {
      currentList?.openItem();
    },
    () => Boolean(currentList?.activeItemId),
  );
  register(
    'list.toggle',
    () => currentList?.toggleSelection(),
    () => Boolean(currentList?.selectable && currentList.activeItemId),
  );
  register(
    'list.extendNext',
    () => currentList?.moveSelection(1, true),
    () => Boolean(currentList?.selectable),
  );
  register(
    'list.extendPrevious',
    () => currentList?.moveSelection(-1, true),
    () => Boolean(currentList?.selectable),
  );
  register(
    'list.clear',
    () => currentList?.clear(),
    () => Boolean(currentList?.activeItemId || currentList?.hasSelection),
  );
  register(
    'list.expand',
    () => {
      currentList?.tree('expand');
    },
    () => Boolean(currentList?.root.hasAttribute('data-keyboard-tree')),
  );
  register(
    'list.collapse',
    () => {
      currentList?.tree('collapse');
    },
    () => Boolean(currentList?.root.hasAttribute('data-keyboard-tree')),
  );
  const commands = computed(() => {
    void revision.value;
    return engine.definitions.map((command) => ({
      ...command,
      keys: keymap.value.disabled?.includes(command.id)
        ? []
        : (keymap.value.overrides[command.id] ?? command.keys),
    }));
  });
  function handle(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229 || event.getModifierState('AltGraph')) return;
    if (recorder.value && event.key === 'Tab') {
      // Leave capture before native focus navigation, so Enter can operate the dialog buttons.
      recorder.value = null;
      return;
    }
    if (recorder.value) {
      event.preventDefault();
      event.stopImmediatePropagation();
      recorder.value(event);
      return;
    }
    const target =
      event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement) ?? null;
    const modals = [
      ...document.querySelectorAll<HTMLElement>(
        '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-keyboard-modal]',
      ),
    ].filter(
      (node) => !node.hasAttribute('data-capsule-preview-content') && isKeyboardVisible(node),
    );
    if (helpOpen.value || _getCommandPaletteState().open) return;
    const topModal = modals[modals.length - 1];
    const modalList = topModal?.contains(target) ? listAdapterFor(target) : null;
    if (topModal && !modalList) return;
    const editable = Boolean(
      target?.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]',
      ),
    );
    const content = preview.value
      ? [...document.querySelectorAll<HTMLElement>('[data-capsule-preview-content]')].find(
          (el) => el.dataset.capsulePreviewContent === preview.value && isKeyboardVisible(el),
        )
      : null;
    currentList =
      modalList ??
      (content
        ? listAdapterFor(
            target && content.contains(target)
              ? target
              : content.querySelector('[data-keyboard-list]'),
          )
        : listAdapterFor(target));
    const scope = modalList
      ? 'list'
      : preview.value
        ? 'preview'
        : currentList
          ? 'list'
          : 'workspace';
    const nativeControl =
      (!preview.value || Boolean(content?.contains(target))) &&
      Boolean(target?.closest('button, a[href], [role="button"]')) &&
      !target?.closest('[data-keyboard-item]');
    engine.handle(event, { scope, editable, nativeControl, listOnly: Boolean(topModal) });
  }
  return {
    engine,
    commands,
    register,
    preview,
    helpOpen,
    recorder,
    keymap,
    storageError,
    closePreview,
    togglePreview(id: string) {
      if (preview.value === id) {
        closePreview();
        return;
      }
      if (!preview.value)
        previewOrigin =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      preview.value = id;
    },
    setPreviewEntry(handler: CommandHandler) {
      enterPreview = handler;
    },
    applyKeymap(value: unknown) {
      engine.setKeymap(value);
      keymap.value = DeviceKeymapSchema.parse(value);
      revision.value++;
    },
    handle,
    moduleIds: keyboardModules.map((m) => m.id),
  };
})();

/** Mounted exactly once by the eager overlay host. */
export function useKeyboardRuntime(): void {
  useEventListener(window, 'keydown', keyboard.handle, { capture: true });
}
