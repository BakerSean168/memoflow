import { describe, expect, it, vi } from 'vitest';
import { requestedTimestamp, serializeContent } from './ordered-memory.shared';

describe('ordered memory write normalization', () => {
  it('keeps already serialized content and serializes structured content', () => {
    expect(serializeContent('{"format":2}')).toBe('{"format":2}');
    expect(serializeContent({ format: 2, parts: [] })).toBe('{"format":2,"parts":[]}');
  });

  it('accepts Date, ISO and numeric timestamps and falls back to the clock when absent or invalid', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    try {
      expect(requestedTimestamp(new Date(5))).toBe(5);
      expect(requestedTimestamp('1970-01-01T00:00:00.007Z')).toBe(7);
      expect(requestedTimestamp(9)).toBe(9);
      expect(requestedTimestamp(undefined)).toBe(1_800_000_000_000);
      expect(requestedTimestamp('not a date')).toBe(1_800_000_000_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
