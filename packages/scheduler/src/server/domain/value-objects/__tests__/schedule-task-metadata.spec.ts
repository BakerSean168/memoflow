import { describe, expect, it } from 'vitest';
import { ScheduleTaskMetadata } from '../schedule-task-metadata';

describe('ScheduleTaskMetadata', () => {
  it('creates default metadata with empty payload and tags', () => {
    const metadata = ScheduleTaskMetadata.createDefault();

    expect(metadata.payload).toEqual({});
    expect(metadata.tags).toEqual([]);
    expect(metadata.hasPayload).toBe(false);
    expect(metadata.hasTags).toBe(false);
    expect(metadata.priorityDisplay).toBe('普通');
  });

  it('adds and removes tags immutably without duplicates', () => {
    const metadata = ScheduleTaskMetadata.createDefault().addTag('a').addTag('a').addTag('b');
    const updated = metadata.removeTag('a');

    expect(metadata.tags).toEqual(['a', 'b']);
    expect(updated.tags).toEqual(['b']);
    expect(updated.tagsDisplay).toBe('b');
  });

  it('updates payload, timeout, and DTO round-trip', () => {
    const metadata = ScheduleTaskMetadata.fromDTO({
      payload: { goalId: 'goal-1' },
      tags: ['goal'],
      priority: 'High',
      timeout: 120000,
    });

    const updated = metadata
      .setPayload({ reminderId: 'reminder-1' })
      .setPriority('Urgent')
      .setTimeout(45000);

    expect(updated.hasTimeout).toBe(true);
    expect(updated.timeoutFormatted).toBe('45 秒');
    expect(updated.priorityColor).toBe('red');
    expect(updated.payloadSummary).toBe('1 个字段');
    expect(updated.toDTO()).toEqual({
      payload: { reminderId: 'reminder-1' },
      tags: ['goal'],
      priority: 'Urgent',
      timeout: 45000,
    });
  });
});
