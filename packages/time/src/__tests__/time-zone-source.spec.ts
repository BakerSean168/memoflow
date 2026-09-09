import { describe, expect, it } from 'vitest';
import {
  createFixedTimeZoneSource,
  createTimeContext,
  isIanaTimeZoneId,
  parseTimeZoneId,
  requireTimeZoneId,
  resolveTimeZoneId,
} from '../index';

describe('IANA timezone resolution input source (TIME-1101 / TIME-1202)', () => {
  it('resolves local through an injected source instead of hiding host state in recurrence code', () => {
    const source = createFixedTimeZoneSource(requireTimeZoneId('America/New_York'));
    expect(resolveTimeZoneId('local', source)).toBe('America/New_York');
  });

  it('parses valid IANA zones into branded ids and rejects invalid zones', () => {
    expect(isIanaTimeZoneId('Asia/Tokyo')).toBe(true);
    expect(parseTimeZoneId('Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(requireTimeZoneId('UTC')).toBe('UTC');
    expect(resolveTimeZoneId('UTC')).toBe('UTC');
    expect(parseTimeZoneId('local')).toBeNull();
    expect(isIanaTimeZoneId('Mars/Olympus_Mons')).toBe(false);
    expect(() => requireTimeZoneId('Mars/Olympus_Mons')).toThrow(TypeError);
    expect(() => resolveTimeZoneId('Mars/Olympus_Mons')).toThrow(TypeError);
  });

  it('constructs a validated canonical TimeContext at the boundary', () => {
    const context = createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 0 });
    expect(context).toEqual({ timeZone: 'Asia/Tokyo', weekStartsOn: 0 });
    expect(Object.isFrozen(context)).toBe(true);
    expect(() => createTimeContext({ timeZone: 'local' })).toThrow(TypeError);
    expect(() => createTimeContext({ timeZone: 'UTC', weekStartsOn: 7 })).toThrow(TypeError);
  });
});
