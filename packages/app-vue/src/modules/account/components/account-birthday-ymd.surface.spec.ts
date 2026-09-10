import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Account birthday Ymd presentation surface (TIME-1206)', () => {
  const form = readFileSync(resolve(__dirname, 'ProfileForm.vue'), 'utf8');
  const card = readFileSync(resolve(__dirname, 'ProfileCard.vue'), 'utf8');

  it('keeps the calendar form date-only without browser timezone conversion', () => {
    expect(form).toContain('new CalendarDate');
    expect(form).toContain('requireYmd');
    expect(form).not.toContain('getLocalTimeZone');
    expect(form).not.toContain('fromDate(');
    expect(form).not.toContain('.toDate(');
    expect(form).not.toContain('.getTime()');
  });

  it('renders birthday as Ymd rather than falling back to Instant formatting', () => {
    expect(card).toContain('format.ymdDisplay');
    expect(card).not.toContain('formatProductDate(');
    expect(card).not.toContain('string | number | null');
  });
});
