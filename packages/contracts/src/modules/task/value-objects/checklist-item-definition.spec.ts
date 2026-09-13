import { describe, expect, it } from 'vitest';
import {
  ChecklistItemDefinitionSchema,
  TaskPlanChecklistSchema,
} from './checklist-item-definition';

describe('TaskPlanChecklistSchema', () => {
  it('accepts definitions with unique ids', () => {
    const items = [
      { id: 'check-1', title: 'Prepare evidence', order: 0 },
      { id: 'check-2', title: 'Review draft', order: 1 },
    ];

    expect(TaskPlanChecklistSchema.safeParse(items).success).toBe(true);
  });

  it('rejects duplicate definition ids', () => {
    const items = [
      { id: 'check-1', title: 'Prepare evidence', order: 0 },
      { id: 'check-1', title: 'Duplicate identity', order: 1 },
    ];

    const result = TaskPlanChecklistSchema.safeParse(items);
    expect(result.success).toBe(false);
    if (!result.success) {
      const duplicateIssues = result.error.issues.filter((issue) =>
        issue.message.includes('unique'),
      );
      expect(duplicateIssues.length).toBeGreaterThan(0);
    }
  });

  it('keeps the 100-item ceiling', () => {
    const items = Array.from({ length: 101 }, (_, order) => ({
      id: `check-${order}`,
      title: `Item ${order}`,
      order,
    }));

    expect(TaskPlanChecklistSchema.safeParse(items).success).toBe(false);
  });

  it('still validates each item through ChecklistItemDefinitionSchema', () => {
    expect(
      TaskPlanChecklistSchema.safeParse([{ id: 'check-1', title: '', order: 0 }]).success,
    ).toBe(false);
    expect(
      ChecklistItemDefinitionSchema.safeParse({ id: '', title: 'No id', order: 0 }).success,
    ).toBe(false);
  });
});
