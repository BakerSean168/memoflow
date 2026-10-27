import { describe, expect, it } from 'vitest';
import { formatTaskDuration } from './format-task-duration';

describe('formatTaskDuration', () => {
  it('uses locale-aware duration units', () => {
    expect(formatTaskDuration(0, 'zh-CN')).toBe('0分钟');
    expect(formatTaskDuration(65, 'zh-CN')).toBe('1小时5分钟');
    expect(formatTaskDuration(65, 'en-US')).toMatch(/^1 hr 5 min$/);
  });
});
