import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createFixedTimeZoneSource,
  createTimeContext,
  createTimeFacade,
  requireTimeZoneId,
} from '../index';

describe('TimeContext + TimePresentationStyle canonical split (TIME-1206)', () => {
  it('keeps device/host zone lookup as an explicit boundary source', () => {
    const source = createFixedTimeZoneSource(requireTimeZoneId('Asia/Tokyo'));
    const context = createTimeContext({ timeZone: source.currentTimeZoneId(), weekStartsOn: 1 });
    expect(context).toEqual({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 });
  });

  it('accepts canonical context and presentation without exposing a second semantic truth', () => {
    const context = createTimeContext({ timeZone: 'UTC', weekStartsOn: 0 });
    const time = createTimeFacade({
      context,
      presentation: {
        locale: 'en-US',
        empty: { display: 'EMPTY' },
      },
    });

    expect(time.context).toEqual(context);
    expect(time.presentation.locale).toBe('en-US');
    expect(time.presentation.empty.display).toBe('EMPTY');
    expect(time.format.hm(null)).toBe('EMPTY');
    expect('style' in time).toBe(false);
  });

  it('withContext and withPresentation preserve split ownership', () => {
    const base = createTimeFacade({
      context: createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      presentation: { locale: 'zh-CN' },
    });

    const moved = base.withContext(createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 0 }));
    expect(moved.context).toEqual({ timeZone: 'Asia/Tokyo', weekStartsOn: 0 });
    expect(moved.presentation.locale).toBe('zh-CN');

    const translated = moved.withPresentation({ locale: 'en-US', empty: { display: 'N/A' } });
    expect(translated.context).toEqual(moved.context);
    expect(translated.presentation.locale).toBe('en-US');
    expect(translated.presentation.empty.display).toBe('N/A');
  });

  it('public facade source has no ambient or mixed-style fallback', () => {
    const facade = readFileSync(resolve(__dirname, '../facade.ts'), 'utf8');
    const index = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');

    for (const forbidden of [
      'defaultTime',
      'withStyle',
      'PartialTimeStyle',
      'DEFAULT_TIME_STYLE',
      'mergeTimeStyle',
      'timeZoneSource?:',
    ]) {
      expect(facade).not.toContain(forbidden);
      expect(index).not.toContain(forbidden);
    }
    expect(facade).toContain('context: TimeContext');
  });
});
