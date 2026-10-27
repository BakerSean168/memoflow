import {
  GoalStatus,
  UpdateGoalSchema,
  goalTimeframeEndBoundary,
  goalTimeframeStartBoundary,
  ReminderTriggerType,
} from '@memoflow/goal-contracts';
import type { GoalNativeDraft, GoalNativePatch } from '@memoflow/goal-client';
import { isGoalStatusTransitionAllowed } from './goalStatusTransitions';

/** Preflight AI commands without mutating the native draft. Save still uses the same owner validation. */
export function validateGoalNativePatch(
  draft: GoalNativeDraft,
  patch: GoalNativePatch,
  persistedStatus: GoalNativeDraft['status'],
): void {
  const fields = new Set([...Object.keys(draft), 'keyResult']);
  if (Object.keys(patch).some((key) => !fields.has(key)))
    throw new Error('Unsupported Goal patch field');
  const next = { ...draft, ...patch, keyResults: patch.keyResults ?? draft.keyResults };
  if (patch.keyResult) {
    const { index, changes } = patch.keyResult;
    const row = next.keyResults[index];
    if (!Number.isInteger(index) || !row || 'id' in changes)
      throw new Error('Invalid Key Result patch');
    next.keyResults = next.keyResults.map((item, position) =>
      position === index ? { ...item, ...changes } : item,
    );
  }
  const { status, keyResult: _keyResult, ...ownerDraft } = next;
  // A blank initial name is an unfinished form, not a valid name command.
  const name = patch.name === undefined && !draft.name ? undefined : next.name;
  UpdateGoalSchema.omit({ expectedVersion: true }).parse({ ...ownerDraft, name });
  if (
    !Object.values(GoalStatus).includes(status) ||
    !isGoalStatusTransitionAllowed(persistedStatus, status)
  )
    throw new Error('Invalid Goal status transition');
  if (
    next.start &&
    next.target &&
    goalTimeframeStartBoundary(next.start) > goalTimeframeEndBoundary(next.target)
  )
    throw new Error('Invalid Goal planning window');
  if (next.keyResults.some((item) => !item.title.trim() || item.initialValue === item.targetValue))
    throw new Error('Invalid Key Result measurement');
  for (const trigger of next.reminderConfig?.enabled
    ? next.reminderConfig.triggers.filter((item) => item.enabled)
    : []) {
    if (trigger.type === ReminderTriggerType.RemainingDays && !next.target)
      throw new Error('Reminder requires target');
    if (
      trigger.type === ReminderTriggerType.TimeProgressPercentage &&
      (!next.start || !next.target)
    )
      throw new Error('Reminder requires planning window');
  }
}
