import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeLegacyTaskTag, parseLegacyTaskTags } from './task-shared-label-migration';

const normalizationFixtures = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../../../tools/test/fixtures/label-normalization.json'),
    'utf8',
  ),
) as Array<{ input: string; name: string; normalizedName: string }>;

describe('Task Shared Label migration', () => {
  it('matches the canonical Shared Label normalization fixture', () => {
    for (const fixture of normalizationFixtures) {
      expect(normalizeLegacyTaskTag(fixture.input)).toEqual({
        name: fixture.name,
        normalizedName: fixture.normalizedName,
      });
    }
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
