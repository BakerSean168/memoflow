import type { GoalReviewSignal, GoalReviewSystemContext } from '@memoflow/contracts/goal';

/** Pure observed-fact diagnosis. The context builder owns all measurement arithmetic. */
export function analyzeGoalReviewSignals(
  facts: Omit<GoalReviewSystemContext, 'signals'>,
): GoalReviewSignal[] {
  const { startPercentage, endPercentage } = facts.overallProgress;
  const signals: GoalReviewSignal[] = [
    {
      kind: 'overall-movement',
      direction:
        endPercentage > startPercentage
          ? 'increased'
          : endPercentage < startPercentage
            ? 'decreased'
            : 'unchanged',
      evidence: { ...facts.overallProgress },
    },
  ];
  if (facts.keyResults.length > 0) {
    signals.push({
      kind: 'key-result-movement',
      // Stable even when repository/aggregate child order differs.
      evidence: [...facts.keyResults]
        .sort((a, b) =>
          String(a.keyResultId) < String(b.keyResultId)
            ? -1
            : String(a.keyResultId) > String(b.keyResultId)
              ? 1
              : 0,
        )
        .map(({ keyResultId, title, startPercentage, endPercentage, deltaPercentage }) => ({
          keyResultId,
          title,
          startPercentage,
          endPercentage,
          deltaPercentage,
          direction:
            endPercentage > startPercentage
              ? 'improved'
              : endPercentage < startPercentage
                ? 'regressed'
                : 'unchanged',
        })),
    });
  }
  signals.push({ kind: 'measurement-activity', evidence: { ...facts.summary } });
  return signals;
}
