/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8');

describe('dark product surface semantic tokens', () => {
  it('publishes a neutral surface ramp and separate overlay/card layers', () => {
    for (const token of [
      '--surface:',
      '--surface-raised:',
      '--surface-overlay:',
      '--hover:',
      '--selected:',
      '--border-subtle:',
      '--border-strong:',
      '--foreground-muted:',
      '--foreground-subtle:',
      '--primary-hover:',
    ]) {
      expect(css).toContain(token);
    }
    const dark = css.slice(css.indexOf('.dark {'), css.indexOf('\n  }\n\n  * {'));
    expect(dark).toContain('--background: 0 0% 5.5%');
    expect(dark).toContain('--card: 0 0% 8%');
    expect(dark).toContain('--popover: 0 0% 11%');
    expect(dark).toContain('--border: 0 0% 17%');
    expect(dark).toContain('--primary: 237 80% 68%');
  });
});
