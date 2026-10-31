import { describe, expect, it } from 'vitest';
import {
  assertGoalDirectWriteAllowed,
  assertGoalIntentCanCommit,
  GoalIntentCommitBlockedError,
  inspectGoalIntent,
  isGoalDirectWriteRequested,
  resolveGoalIntent,
} from './goal-intent-clarification';

describe('Goal critical intent clarification', () => {
  it('requires the exam-year meaning before accepting model-generated dates', () => {
    expect(inspectGoalIntent('备战 2027 年考研，目标北京大学')).toMatchObject({
      field: 'exam_year_meaning',
      year: 2027,
    });
  });
  it('does not ask ordinary Goals or an explicit timeline', () => {
    expect(inspectGoalIntent('每天阅读半小时')).toBeNull();
    expect(inspectGoalIntent('2026 年 12 月参加初试，2027 年入学')).toBeNull();
  });
  it('resolves either meaning without inventing an exact exam day', () => {
    const pending = inspectGoalIntent('备战 2027 年考研')!;
    expect(resolveGoalIntent(pending, pending.options[0].label)).toContain('2027 年参加初试');
    expect(resolveGoalIntent(pending, pending.options[1].label)).toContain('2026 年参加初试');
    expect(resolveGoalIntent(pending, '我还不确定')).toBeNull();
    expect(resolveGoalIntent(pending, 'model guessed this')).toBeNull();
  });
  it('flags vague dates and contradictory deadline semantics', () => {
    expect(inspectGoalIntent('创建 Goal：下个月底或者年底完成')).toMatchObject({
      field: 'target_date',
    });
    expect(inspectGoalIntent('创建目标：最晚 2027-01-01 完成，但截止 2027-02-01')).toMatchObject({
      field: 'deadline_conflict',
    });
  });
  it('blocks commits with a typed code instead of a message string', () => {
    const blocked = (source: string) => {
      try {
        assertGoalIntentCanCommit(source);
        return null;
      } catch (error) {
        return error instanceof GoalIntentCommitBlockedError ? error.code : 'untyped';
      }
    };
    expect(blocked('先讨论一下考研规划，不要创建')).toBe('GOAL_DISCUSSION_ONLY');
    expect(blocked('帮我备战 2027 年考研')).toBe('GOAL_CLARIFICATION_REQUIRED');
    expect(blocked('每天阅读半小时')).toBeNull();
  });

  it('treats only an explicit background request as permission to skip the Goal form', () => {
    for (const text of [
      '不用打开表单，后台直接创建：三个月读完 6 本书',
      '跳过表单，直接写入这个目标',
      '后台创建一个目标就行',
      'Create the goal without opening the form',
      'background write is fine, skip the panel',
    ])
      expect(isGoalDirectWriteRequested(text), text).toBe(true);
    for (const text of [
      '帮我创建一个目标：三个月内读完 6 本书',
      '直接帮我创建这个目标',
      '在右侧表单里帮我建一个目标',
      'Create a goal to read 6 books',
    ])
      expect(isGoalDirectWriteRequested(text), text).toBe(false);
    expect(() => assertGoalDirectWriteAllowed(undefined)).toThrow(GoalIntentCommitBlockedError);
    expect(() => assertGoalDirectWriteAllowed('帮我创建一个目标')).toThrow('GOAL_PANEL_REQUIRED');
    expect(() => assertGoalDirectWriteAllowed('后台直接写入，不要打开表单')).not.toThrow();
  });
});
