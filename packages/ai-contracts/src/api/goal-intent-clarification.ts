import { z } from 'zod';

/** Product-owned questions; a model-authored date is never an answer to these fields. */
export const GoalIntentQuestionSchema = z
  .object({
    field: z.enum(['exam_year_meaning', 'target_date', 'deadline_conflict']),
    year: z.number().int().optional(),
    question: z.string().min(1),
    options: z.array(z.object({ label: z.string() })),
  })
  .strict();
export type GoalIntentQuestion = z.infer<typeof GoalIntentQuestionSchema>;
export const GoalIntentClarificationSchema = z
  .object({
    draftId: z.string().min(1),
    runId: z.string().min(1),
    connectionId: z.string().min(1),
    source: z.string().max(200_000),
    question: GoalIntentQuestionSchema,
    status: z.enum(['pending', 'answered', 'cancelled']),
    answer: z.string().optional(),
  })
  .strict();

export function isGoalDiscussionOnly(text: string): boolean {
  return /(?:先|只|仅).{0,8}讨论|(?:不要|不|别|暂不|先不).{0,4}(?:创建|保存|提交)|discuss only|do not (?:create|save)/i.test(
    text,
  );
}

export function inspectGoalIntent(text: string): GoalIntentQuestion | null {
  if (/(?:考研|研究生|初试)/.test(text)) {
    const years = [...text.matchAll(/(20\d{2})\s*年?/g)].map((match) => Number(match[1]));
    // An explicit role next to a year removes the exam/admission-year ambiguity.
    const explicit =
      /20\d{2}\s*年\s*(?:\d{1,2}\s*月\s*)?(?:参加|进行|报考)?\s*(?:初试|入学)|(?:初试|入学)(?:时间|年份)?[：:为是\s]*20\d{2}/.test(
        text,
      );
    if (years.length && !explicit) {
      const year = years[0];
      return {
        field: 'exam_year_meaning',
        year,
        question: `“${year} 年考研”是指哪一年参加初试？`,
        options: [
          { label: `${year} 年参加初试，${year + 1} 年入学` },
          { label: `${year - 1} 年参加初试，${year} 年入学` },
          { label: '我还不确定' },
        ],
      };
    }
  }
  const deadlines = [
    ...text.matchAll(/(?:截止|最晚|不晚于|deadline)\s*(20\d{2}[-/]\d{1,2}[-/]\d{1,2})/gi),
  ].map((match) => match[1]);
  if (new Set(deadlines).size > 1) {
    return {
      field: 'deadline_conflict',
      question: '出现了不同的截止日期，请明确采用哪个日期（YYYY-MM-DD），或取消。',
      options: [],
    };
  }
  if (
    !/目标截止日期[：:]20\d{2}-\d{2}-\d{2}/.test(text) &&
    /(?:或者|还是|或).{0,8}(?:年底|月底|完成|截止)/.test(text) &&
    /(?:目标|Goal|创建)/i.test(text)
  ) {
    return {
      field: 'target_date',
      question: '目标完成时间还不明确，请填写目标日期（YYYY-MM-DD），或取消。',
      options: [],
    };
  }
  return null;
}

/** Null means no decision: "unsure", cancellation and invalid answers never authorize a commit. */
export function resolveGoalIntent(question: GoalIntentQuestion, answer: string): string | null {
  if (question.field === 'exam_year_meaning') {
    return question.options.slice(0, 2).some((option) => option.label === answer) ? answer : null;
  }
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(answer)) return null;
  const date = new Date(`${answer}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === answer
    ? `目标截止日期：${answer}`
    : null;
}

/** Stable codes returned to agents when a Goal commit must wait for the user. */
export const GoalIntentCommitBlockCodeSchema = z.enum([
  'GOAL_CLARIFICATION_REQUIRED',
  'GOAL_DISCUSSION_ONLY',
]);
export type GoalIntentCommitBlockCode = z.infer<typeof GoalIntentCommitBlockCodeSchema>;

/** Typed refusal so callers branch on `code`, never on the error message. */
export class GoalIntentCommitBlockedError extends Error {
  constructor(readonly code: GoalIntentCommitBlockCode) {
    super(code);
    this.name = 'GoalIntentCommitBlockedError';
  }
}

/** Throws {@link GoalIntentCommitBlockedError} while the request is discussion-only or ambiguous. */
export function assertGoalIntentCanCommit(source: string): void {
  if (isGoalDiscussionOnly(source)) throw new GoalIntentCommitBlockedError('GOAL_DISCUSSION_ONLY');
  if (inspectGoalIntent(source))
    throw new GoalIntentCommitBlockedError('GOAL_CLARIFICATION_REQUIRED');
}
