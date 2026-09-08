import { describe, expect, it } from 'vitest';
import { normalizeLegacyTaskTag, parseLegacyTaskTags } from './task-shared-label-migration';

describe('Task Shared Label migration', () => {
  it('uses the canonical trim + NFKC + case-insensitive label identity rule', () => {
    expect(normalizeLegacyTaskTag('  ＷＯＲＫ 项目  ')).toEqual({
      name: 'WORK 项目',
      normalizedName: 'work 项目',
    });
  });

  it('deduplicates legacy JSON tags by normalized label identity while preserving first display spelling', () => {
    expect(parseLegacyTaskTags('[" Work ","WORK","Health"]')).toEqual([
      { name: 'Work', normalizedName: 'work' },
      { name: 'Health', normalizedName: 'health' },
    ]);
  });

  it('fails closed on malformed or non-string legacy tag payloads', () => {
    expect(() => parseLegacyTaskTags('{broken')).toThrow('not valid JSON');
    expect(() => parseLegacyTaskTags('["Work", 1]')).toThrow('JSON array of strings');
  });

  it('fails closed instead of silently dropping invalid legacy label names', () => {
    expect(() => parseLegacyTaskTags('["   "]')).toThrow('must not be empty');
    expect(() => parseLegacyTaskTags(JSON.stringify(['x'.repeat(51)]))).toThrow('at most 50');
  });
});
