import { describe, expect, it } from 'vitest';
import { decodeTaskGoalProgress, encodeTaskGoalProgress } from './task-goal-progress-codec';
describe('Task Goal progress persistence invariant', () => {
  it('decodes LinkOnly and legacy Fixed', () => {
    expect(decodeTaskGoalProgress({ value: null, trigger: null })).toBeNull();
    expect(decodeTaskGoalProgress({ value: -2, trigger: 'EachCompletion' })).toEqual({
      mode: 'Fixed',
      value: -2,
      trigger: 'EachCompletion',
    });
  });
  it.each([
    { mode: 'Prompt', value: 2, trigger: 'EachCompletion' },
    { mode: 'Prompt', value: null, trigger: 'PlanCompletion' },
    { mode: 'Fixed', value: 2, trigger: 'EachCompletion', suggestedValue: 0 },
    { mode: null, value: 0, trigger: 'EachCompletion' },
    { mode: null, value: 2, trigger: null },
    { mode: 'Unknown', value: 2, trigger: 'EachCompletion' },
  ])('rejects malformed persisted columns %j', (columns) => {
    expect(() => decodeTaskGoalProgress(columns)).toThrow();
  });
  it('encodes Prompt suggestion in its own column', () => {
    expect(
      encodeTaskGoalProgress({ mode: 'Prompt', trigger: 'EachCompletion', suggestedValue: 0 }),
    ).toEqual({
      goalProgressMode: 'Prompt',
      goalProgressTrigger: 'EachCompletion',
      goalRecordValue: null,
      goalSuggestedValue: 0,
    });
  });
});
