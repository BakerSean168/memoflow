/**
 * MemoFlow-owned Task plan completion policy extension point.
 *
 * Both policies require every non-waived occurrence to be completed for success.
 * The only vNext distinction is whether an explicit Missed fact makes success
 * impossible (StrictNoBackfill) or remains correctable (AllowCorrection).
 */
export const TaskPlanCompletionPolicy = {
  AllowCorrection: 'AllowCorrection',
  StrictNoBackfill: 'StrictNoBackfill',
} as const;

export type TaskPlanCompletionPolicy =
  (typeof TaskPlanCompletionPolicy)[keyof typeof TaskPlanCompletionPolicy];
