import { describe, expect, it } from 'vitest';
import { normalizeCrudData } from './crud-normalization';

describe('normalizeCrudData', () => {
  it('decodes PowerSync JSON text for Prisma scalar-list fields', () => {
    expect(normalizeCrudData('goals', { tags: '["work","focus"]' })).toEqual({
      tags: ['work', 'focus'],
    });
  });

  it('decodes canonical preference payload JSON before Prisma persistence', () => {
    expect(
      normalizeCrudData('user_preference_records', {
        payload: '{"theme":"dark","language":"zh-CN"}',
      }),
    ).toEqual({
      payload: { theme: 'dark', language: 'zh-CN' },
    });
  });

  it('keeps JSON-looking text when the Prisma column is intentionally a string', () => {
    expect(normalizeCrudData('task_templates', { tags: '["work"]' })).toEqual({
      tags: '["work"]',
    });
  });

  it('maps expanded task-goal relation columns without reviving the JSON binding', () => {
    expect(
      normalizeCrudData('task_templates', {
        goal_id: 'goal-1',
        key_result_id: 'kr-1',
        goal_record_value: 2.5,
        goal_progress_trigger: 'EachCompletion',
      }),
    ).toEqual({
      goalId: 'goal-1',
      keyResultId: 'kr-1',
      goalRecordValue: 2.5,
      goalProgressTrigger: 'EachCompletion',
    });
  });

  it('keeps malformed JSON unchanged instead of corrupting an upload batch', () => {
    expect(normalizeCrudData('goals', { tags: '[invalid]' })).toEqual({
      tags: '[invalid]',
    });
  });
});
