import { DeviceKeymapSchema, type DeviceKeymap } from '@memoflow/contracts/shared';
import { commandDefinitions, type KeyboardHost, type ShortcutScope } from './commands';

const aliases: Record<string, string> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  cmd: 'Meta',
  command: 'Meta',
  meta: 'Meta',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  mod: 'Mod',
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  space: 'Space',
  backslash: 'Backslash',
  '\\': 'Backslash',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
};
const modifiers = ['Ctrl', 'Meta', 'Alt', 'Shift'];

export function normalizeChord(raw: string, host: KeyboardHost): string | null {
  const parts = raw
    .trim()
    .split('+')
    .map((p) => aliases[p.toLowerCase()] ?? (p.length === 1 ? p.toUpperCase() : p));
  const key = parts.pop();
  if (
    !key ||
    modifiers.includes(key) ||
    key === 'Mod' ||
    !/^(?:[A-Z0-9/?.,;\[\]'=-]|Enter|Escape|Space|Backslash|Arrow(?:Up|Down|Left|Right)|F(?:[1-9]|1[0-2]))$/.test(
      key,
    )
  )
    return null;
  const mods = parts.map((p) => (p === 'Mod' ? (host.platform === 'mac' ? 'Meta' : 'Ctrl') : p));
  if (mods.some((p) => !modifiers.includes(p)) || new Set(mods).size !== mods.length) return null;
  // '?' already represents the shifted character on layouts that require Shift.
  return [
    ...modifiers.filter((m) => mods.includes(m) && !(key === '?' && m === 'Shift')),
    key,
  ].join('+');
}

export function eventChord(event: KeyboardEvent, host: KeyboardHost): string | null {
  let key = event.key === ' ' ? 'Space' : event.key;
  // Option produces symbols on macOS. Alt chords deliberately use physical Latin
  // letter/digit positions; unmodified shortcuts follow the user's keyboard layout.
  if (event.altKey && /^(Key[A-Z]|Digit[0-9])$/.test(event.code))
    key = event.code.replace(/^(Key|Digit)/, '');
  if (event.code === 'Backslash') key = 'Backslash';
  return normalizeChord(
    [
      event.ctrlKey && 'Ctrl',
      event.metaKey && 'Meta',
      event.altKey && 'Alt',
      event.shiftKey && key !== '?' && 'Shift',
      key,
    ]
      .filter(Boolean)
      .join('+'),
    host,
  );
}

export function reservedChord(chord: string, host: KeyboardHost): string | null {
  if (host.desktop && chord === normalizeChord('Mod+Shift+D', host))
    return '此组合键已用于桌面端显示 / 隐藏应用';
  if (/^(?:Ctrl|Meta)\+Alt\+/.test(chord)) return 'Ctrl+Alt 可能是 AltGraph，不能用于应用快捷键';
  if (host.platform === 'windows' && chord.includes('Meta+')) return 'Windows 键由操作系统保留';
  if (/^(?:Alt\+F4|Meta\+(?:Q|Space)|Ctrl\+Alt\+Delete)$/.test(chord))
    return '此组合键由操作系统保留';
  if (
    !host.desktop &&
    /^(?:(?:Ctrl|Meta)\+(?:[0-9LRTWN]|Shift\+[ONTW])|Alt\+(?:ArrowLeft|ArrowRight)|F(?:5|6|11|12))$/.test(
      chord,
    )
  )
    return '此组合键由浏览器保留';
  return null;
}

export function scopesOverlap(a: ShortcutScope, b: ShortcutScope): boolean {
  if ((a === 'preview' && b === 'list') || (a === 'list' && b === 'preview')) return false;
  return true;
}
export interface KeymapConflict {
  chord: string;
  commands: string[];
}
export function validateKeymap(
  input: unknown,
  host: KeyboardHost,
): { keymap: DeviceKeymap; conflicts: KeymapConflict[] } {
  const decoded = DeviceKeymapSchema.safeParse(input);
  if (!decoded.success) throw new Error('配置包含未知命令、无效键位或不支持的版本');
  const keymap = decoded.data;
  const used: Array<{ chord: string; id: string; scope: ShortcutScope }> = [];
  const conflicts: KeymapConflict[] = [];
  for (const command of commandDefinitions(host)) {
    const keys = keymap.disabled?.includes(command.id)
      ? []
      : (keymap.overrides[command.id] ?? command.keys);
    const unique = new Set<string>();
    for (const key of keys) {
      const chord = normalizeChord(key, host);
      if (!chord) throw new Error(`无效快捷键：${key}`);
      const reserved = reservedChord(chord, host);
      if (reserved) throw new Error(`${key}：${reserved}`);
      if (unique.has(chord)) throw new Error(`重复快捷键：${key}`);
      unique.add(chord);
      for (const other of used) {
        if (other.chord === chord && scopesOverlap(command.scope, other.scope))
          conflicts.push({ chord, commands: [other.id, command.id] });
      }
      used.push({ chord, id: command.id, scope: command.scope });
    }
  }
  return { keymap, conflicts };
}

export function displayChord(chord: string, host: KeyboardHost): string {
  return (normalizeChord(chord, host) ?? chord)
    .replace('Meta', host.platform === 'mac' ? '⌘' : 'Meta')
    .replace('Backslash', '\\')
    .replace('ArrowDown', '↓')
    .replace('ArrowUp', '↑')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→');
}
