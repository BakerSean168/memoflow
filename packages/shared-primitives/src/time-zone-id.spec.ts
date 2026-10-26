import { describe, expect, it } from 'vitest';
import {
  TimeZoneIdSchema,
  isIanaTimeZoneId,
  parseTimeZoneId,
  requireTimeZoneId,
} from './time-zone-id';

describe('TimeZoneId primitive', () => {
  it('accepts valid IANA zones, including UTC and Asia/Tokyo', () => {
    expect(isIanaTimeZoneId('UTC')).toBe(true);
    expect(isIanaTimeZoneId('Asia/Tokyo')).toBe(true);
    expect(TimeZoneIdSchema.parse('UTC')).toBe('UTC');
    expect(parseTimeZoneId('Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(requireTimeZoneId('UTC')).toBe('UTC');
  });

  it('rejects invalid and non-portable local zones', () => {
    expect(isIanaTimeZoneId('Mars/Olympus_Mons')).toBe(false);
    expect(parseTimeZoneId('Mars/Olympus_Mons')).toBeNull();
    expect(TimeZoneIdSchema.safeParse('Mars/Olympus_Mons').success).toBe(false);
    expect(TimeZoneIdSchema.safeParse('local').success).toBe(false);
    expect(() => requireTimeZoneId('Mars/Olympus_Mons')).toThrow(TypeError);
  });
});
