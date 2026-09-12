import { describe, expect, it } from 'vitest';
import {
  createFixedTimeZoneSource,
  createTimeContext,
  isIanaTimeZoneId,
  parseTimeZoneId,
  requireTimeZoneId,
} from '../index';

describe('IANA timezone boundary source (TIME-1206)', () => {
  it('returns a validated IANA id only when the boundary explicitly asks for it', () => {
    const source = createFixedTimeZoneSource(requireTimeZoneId('America/New_York'));
    expect(source.currentTimeZoneId()).toBe('America/New_York');
  });

  it('parses valid IANA zones and rejects legacy local/invalid policies', () => {
    expect(isIanaTimeZoneId('Asia/Tokyo')).toBe(true);
    expect(parseTimeZoneId('Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(requireTimeZoneId('UTC')).toBe('UTC');
    expect(parseTimeZoneId('local')).toBeNull();
    expect(isIanaTimeZoneId('Mars/Olympus_Mons')).toBe(false);
    expect(() => requireTimeZoneId('Mars/Olympus_Mons')).toThrow(TypeError);
  });

  it('constructs a frozen canonical TimeContext at the boundary', () => {
    const context = createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 0 });
    expect(context).toEqual({ timeZone: 'Asia/Tokyo', weekStartsOn: 0 });
    expect(Object.isFrozen(context)).toBe(true);
    expect(() => createTimeContext({ timeZone: 'local' })).toThrow(TypeError);
    expect(() => createTimeContext({ timeZone: 'UTC', weekStartsOn: 7 })).toThrow(TypeError);
  });
});
