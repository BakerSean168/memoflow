import { describe, expect, it } from 'vitest';
import {
  adaptLegacyTimeStyle,
  composeLegacyTimeStyle,
  createFixedTimeZoneSource,
  createTimeContext,
  createTimeFacade,
  DEFAULT_TIME_STYLE,
  requireTimeZoneId,
} from '../index';

describe('TimeContext + TimePresentationStyle (TIME-1202)', () => {
  it('adapts the legacy local policy through an explicit zone source', () => {
    const source = createFixedTimeZoneSource(requireTimeZoneId('Asia/Tokyo'));
    const adapted = adaptLegacyTimeStyle(DEFAULT_TIME_STYLE, source);

    expect(adapted.context).toEqual({
      timeZone: 'Asia/Tokyo',
      weekStartsOn: DEFAULT_TIME_STYLE.calendar.weekStartsOn,
    });
    expect(adapted.presentation.locale).toBe(DEFAULT_TIME_STYLE.locale);
    expect(DEFAULT_TIME_STYLE.timeZone).toBe('local');
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
    expect(time.style.timeZone).toBe('UTC');
    expect(time.style.calendar.weekStartsOn).toBe(0);
    expect(time.style.locale).toBe('en-US');
    expect(time.format.hm(null)).toBe('EMPTY');
  });

  it('keeps legacy TimeStyle as an explicit compatibility projection', () => {
    const context = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 1 });
    const time = createTimeFacade({ context });
    const projected = composeLegacyTimeStyle(context, time.presentation);

    expect(projected.timeZone).toBe('America/New_York');
    expect(projected.calendar.weekStartsOn).toBe(1);
    expect(projected.locale).toBe(time.presentation.locale);
  });

  it('withContext and withPresentation preserve the split ownership', () => {
    const base = createTimeFacade({
      context: createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      presentation: { locale: 'zh-CN' },
    });

    const moved = base.withContext(createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 0 }));
    expect(moved.context).toEqual({ timeZone: 'Asia/Tokyo', weekStartsOn: 0 });
    expect(moved.presentation.locale).toBe('zh-CN');

    const translated = moved.withPresentation({
      locale: 'en-US',
      empty: { display: 'N/A' },
    });
    expect(translated.context).toEqual(moved.context);
    expect(translated.presentation.locale).toBe('en-US');
    expect(translated.presentation.empty.display).toBe('N/A');
  });

  it('legacy withStyle remains bounded and can still resolve local deterministically', () => {
    const source = createFixedTimeZoneSource(requireTimeZoneId('Asia/Tokyo'));
    const legacy = createTimeFacade({
      style: { timeZone: 'local', calendar: { weekStartsOn: 1 } },
      timeZoneSource: source,
    });

    expect(legacy.style.timeZone).toBe('local');
    expect(legacy.context.timeZone).toBe('Asia/Tokyo');

    const changed = legacy.withStyle({ timeZone: 'UTC', calendar: { weekStartsOn: 0 } });
    expect(changed.context).toEqual({ timeZone: 'UTC', weekStartsOn: 0 });
  });
});
