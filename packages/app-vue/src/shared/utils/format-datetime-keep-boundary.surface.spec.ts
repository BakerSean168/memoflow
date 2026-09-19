import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveEmptyLabel } from '@memoflow/time';

describe('Product date-time presentation boundary', () => {
  const dir = __dirname;
  const react = readFileSync(resolve(dir, '../../../../app-react/src/utils/entity-presentation.ts'), 'utf8');
  const eventList = readFileSync(resolve(dir, '../../modules/schedule/components/ScheduleEventList.vue'), 'utf8');
  const goalReview = readFileSync(resolve(dir, '../../modules/goal/views/GoalReviewDetailView.vue'), 'utf8');

  it('keeps date-time surfaces on the shared Product Time facade', () => {
    expect(react).toContain('formatProductDateTime');
    expect(eventList).toContain('formatProductDateTime');
    for (const source of [react, eventList]) {
      expect(source).not.toMatch(/function formatDateTime\b/);
      expect(source).not.toContain('toLocaleString');
    }
  });

  it('allows Goal Review to intentionally present calendar dates rather than forcing date-time copy', () => {
    expect(goalReview).toContain('formatProductDate');
    expect(goalReview).not.toMatch(/function formatDate\b/);
    expect(goalReview).not.toContain('toLocaleString');
  });

  it('keeps empty catalog meanings distinct', () => {
    expect(resolveEmptyLabel('dash')).toBe('-');
    expect(resolveEmptyLabel('na')).toBe('N/A');
  });
});
