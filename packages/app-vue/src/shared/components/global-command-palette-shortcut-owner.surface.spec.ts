import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const componentsRoot = resolve(__dirname);

describe('global command palette shortcut ownership', () => {
  it('keeps Ctrl/Cmd+K on the eager overlay host only', () => {
    const overlays = readFileSync(resolve(componentsRoot, 'GlobalOverlays.vue'), 'utf8');
    const palette = readFileSync(resolve(componentsRoot, 'GlobalCommandPalette.vue'), 'utf8');

    expect(overlays).toContain("window.addEventListener('keydown', handleGlobalShortcut)");
    expect(overlays).toContain('toggleCommandPalette()');

    expect(palette).not.toContain("window.addEventListener('keydown'");
    expect(palette).not.toContain('handleKeydown');
  });
});
