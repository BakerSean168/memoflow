import { describe, expect, it } from 'vitest';
import { isYmd, parseYmd, requireYmd, YmdSchema } from './ymd';

describe('Ymd portable primitive', () => {
  it('accepts real calendar days including leap day', () => {
    expect(isYmd('2024-02-29')).toBe(true);
    expect(parseYmd('2026-09-09')).toBe('2026-09-09');
    expect(YmdSchema.parse('2000-02-29')).toBe('2000-02-29');
  });

  it('rejects malformed and impossible calendar days', () => {
    for (const value of ['2026-2-09', '2026-02-30', '2025-02-29', '2026-13-01', '0000-01-01']) {
      expect(isYmd(value)).toBe(false);
      expect(parseYmd(value)).toBeNull();
      expect(YmdSchema.safeParse(value).success).toBe(false);
    }
  });

  it('fails closed at requireYmd boundaries', () => {
    expect(requireYmd('1999-12-31')).toBe('1999-12-31');
    expect(() => requireYmd('1999-11-31')).toThrow('Invalid calendar date');
  });
});
