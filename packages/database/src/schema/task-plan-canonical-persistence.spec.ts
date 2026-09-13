import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const taskSchema = readFileSync(resolve(process.cwd(), 'prisma/schema/task.prisma'), 'utf8');

describe('TaskPlan canonical persistence cutover', () => {
  it('persists canonical schedule and full reminder JSON as the only scheduling/reminder truth', () => {
    expect(taskSchema).toMatch(/schedule\s+Json\b/);
    expect(taskSchema).toMatch(/reminderConfig\s+String\?\s+@map\("reminder_config"\)/);
    expect(taskSchema).toMatch(/checklist\s+String\?/);
  });

  it('does not resurrect retired flattened TaskPlan columns', () => {
    for (const retired of [
      'time_config_type',
      'time_config_start_time',
      'time_config_end_time',
      'time_config_duration_minutes',
      'time_config_time_point',
      'time_config_time_range_start',
      'time_config_time_range_end',
      'recurrence_rule_type',
      'recurrence_rule_interval',
      'recurrence_rule_days_of_week',
      'recurrence_rule_end_date',
      'recurrence_rule_count',
      'reminder_config_enabled',
      'reminder_config_time_offset_minutes',
      'reminder_config_unit',
      'reminder_config_channel',
      'last_generated_date',
      'generate_ahead_days',
    ]) {
      expect(taskSchema).not.toContain(retired);
    }
  });
});
