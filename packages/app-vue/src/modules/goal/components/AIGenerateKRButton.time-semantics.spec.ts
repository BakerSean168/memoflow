import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AIGenerateKRButton Product Time semantics (TIME-1205)', () => {
  const source = readFileSync(resolve(__dirname, 'AIGenerateKRButton.vue'), 'utf8');

  it('uses Product Time date codecs and calendar-day defaults', () => {
    expect(source).toContain('fromProductDateInputValue');
    expect(source).toContain('toProductDateInputValue');
    expect(source).toContain('getProductTime().calendar.addDays(now, 30)');
    expect(source).not.toContain('30 * 24 * 60 * 60 * 1000');
    expect(source).not.toContain('new Date(dateStr).getTime()');
    expect(source).not.toContain("toISOString().split('T')[0]");
  });
});
