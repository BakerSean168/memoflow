import { afterEach, describe, expect, it } from 'vitest';
import {
  createDefaultUserPreferenceProfile,
  type UserPreferenceProfile,
} from '@memoflow/contracts/setting';
import { formatProductDateTime, formatProductHm, setProductTimePreferences } from './product-time';

afterEach(() => {
  setProductTimePreferences(createDefaultUserPreferenceProfile());
});

describe('Product Time presentation', () => {
  it('normalizes epoch, ISO string, and Date inputs through the same time facade', () => {
    const epoch = Date.parse('2026-08-01T09:30:00.000Z');

    expect(formatProductHm(new Date(epoch))).toBe(formatProductHm(epoch));
    expect(formatProductHm(new Date(epoch).toISOString())).toBe(formatProductHm(epoch));
  });

  it('uses the empty label for invalid values', () => {
    expect(formatProductHm('not-a-date', 'empty')).toBe('empty');
  });

  it('renders a full reminder instant in the canonical user timezone', () => {
    const profile: UserPreferenceProfile = {
      presentation: { theme: 'dark', language: 'zh-CN' },
      regional: {
        timeZone: 'Asia/Shanghai',
        dateStyle: 'medium',
        timeStyle: '24h',
        weekStartsOn: 1,
      },
    };
    setProductTimePreferences(profile);

    const oneHourFrom1356 = Date.parse('2026-09-28T06:56:00.000Z');
    const formatted = formatProductDateTime(oneHourFrom1356);

    expect(formatted).toContain('2026');
    expect(formatted).toContain('9');
    expect(formatted).toContain('28');
    expect(formatted).toContain('14:56');
  });
});
