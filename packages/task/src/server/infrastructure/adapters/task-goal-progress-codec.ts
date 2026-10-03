import { TaskGoalProgressRuleSchema, type TaskGoalProgressRule } from '@memoflow/contracts/task';

/** Legacy NULL mode uses only the original Fixed value/trigger columns. */
export function decodeTaskGoalProgress(columns: {
  mode?: string | null;
  value: number | null;
  trigger: string | null;
  suggestedValue?: number | null;
}): TaskGoalProgressRule | null {
  const { mode, value, trigger, suggestedValue } = columns;
  if (mode == null && value == null && trigger == null && suggestedValue == null) return null;
  if (mode === 'Prompt') {
    if (value != null) throw new Error('Prompt cannot persist a fixed record value');
    return TaskGoalProgressRuleSchema.parse({
      mode,
      trigger,
      suggestedValue: suggestedValue ?? null,
    });
  }
  if (suggestedValue != null) throw new Error('Fixed cannot persist a suggested value');
  return TaskGoalProgressRuleSchema.parse({ mode: mode ?? 'Fixed', trigger, value });
}

export function encodeTaskGoalProgress(rule: TaskGoalProgressRule | null | undefined) {
  return {
    goalProgressMode: rule?.mode ?? null,
    goalRecordValue: rule?.mode === 'Fixed' ? rule.value : null,
    goalProgressTrigger: rule?.trigger ?? null,
    goalSuggestedValue: rule?.mode === 'Prompt' ? (rule.suggestedValue ?? null) : null,
  };
}
