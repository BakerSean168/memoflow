import type { DeviceKeymap } from '@memoflow/contracts/shared';
import {
  commandDefinitions,
  type KeyboardCommandId,
  type KeyboardHost,
  type ShortcutScope,
} from './commands';
import { eventChord, normalizeChord, validateKeymap } from './keymap';

export interface KeyboardContext {
  scope: Exclude<ShortcutScope, 'app'> | 'modal' | 'palette';
  editable: boolean;
  nativeControl?: boolean;
  listOnly?: boolean;
}
export type CommandHandler = () => void | Promise<unknown>;

export function createShortcutEngine(
  host: KeyboardHost,
  onError: (error: unknown) => void = () => {},
) {
  const definitions = commandDefinitions(host);
  const handlers = new Map<
    KeyboardCommandId,
    { execute: CommandHandler; available: () => boolean }
  >();
  const pending = new Set<KeyboardCommandId>();
  let keymap: DeviceKeymap = { version: 1, overrides: {} };
  function bindings(id: KeyboardCommandId): readonly string[] {
    if (keymap.disabled?.includes(id)) return [];
    return keymap.overrides[id] ?? definitions.find((c) => c.id === id)?.keys ?? [];
  }
  function available(id: KeyboardCommandId): boolean {
    return Boolean(handlers.get(id)?.available()) && !pending.has(id);
  }
  function execute(id: KeyboardCommandId): boolean {
    const handler = handlers.get(id);
    if (!handler || !available(id)) return false;
    try {
      const result = handler.execute();
      if (result instanceof Promise) {
        pending.add(id);
        void result.catch(onError).finally(() => pending.delete(id));
      }
    } catch (error) {
      onError(error);
    }
    return true;
  }
  return {
    host,
    definitions,
    bindings,
    available,
    execute,
    register(id: KeyboardCommandId, execute: CommandHandler, available = () => true) {
      if (handlers.has(id)) throw new Error(`Command already registered: ${id}`);
      const handler = { execute, available };
      handlers.set(id, handler);
      return () => {
        if (handlers.get(id) === handler) handlers.delete(id);
      };
    },
    setKeymap(input: unknown) {
      const parsed = validateKeymap(input, host);
      if (parsed.conflicts.length)
        throw new Error(`快捷键冲突：${parsed.conflicts.map((c) => c.chord).join(', ')}`);
      keymap = parsed.keymap;
    },
    handle(event: KeyboardEvent, context: KeyboardContext): boolean {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.getModifierState('AltGraph') ||
        (event.ctrlKey && event.altKey)
      )
        return false;
      if (context.scope === 'modal' || context.scope === 'palette') return false;
      const chord = eventChord(event, host);
      if (!chord) return false;
      const candidates = definitions.filter((c) =>
        bindings(c.id).some((k) => normalizeChord(k, host) === chord),
      );
      candidates.sort(
        (a, b) => Number(b.scope === context.scope) - Number(a.scope === context.scope),
      );
      for (const command of candidates) {
        if (context.listOnly && command.scope !== 'list') continue;
        const inScope =
          command.scope === context.scope ||
          command.scope === 'app' ||
          (command.scope === 'workspace' &&
            (context.scope === 'list' || context.scope === 'preview'));
        if (!inScope || (event.repeat && !command.repeat)) continue;
        if (context.editable && (!command.editable || !(event.ctrlKey || event.metaKey))) continue;
        if (context.nativeControl && (event.key === 'Enter' || event.key === ' ')) continue;
        if (!execute(command.id)) continue;
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      return false;
    },
  };
}
