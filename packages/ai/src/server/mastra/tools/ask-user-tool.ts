import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type {
  AssistantRuntimeAskUserAnswers,
  AssistantRuntimeAskUserQuestion,
  AssistantRuntimeToolAnswerCommand,
} from '@memoflow/ai-contracts';

const MAX_QUESTIONS = 4;
const MAX_HEADER_CHARS = 120;
const MAX_QUESTION_CHARS = 2000;
const MAX_LABEL_CHARS = 500;
const MAX_DESCRIPTION_CHARS = 1000;
/** Historical single-question payloads allowed up to 20; the tool now emits 2-4. */
const MAX_LEGACY_OPTIONS = 20;
const MAX_ANSWER_CHARS = 4000;

/**
 * The model-facing contract mirrors Claude's AskUserQuestion tool: one call
 * carries 1-4 questions, each with a short header chip, a complete question and
 * 2-4 described options. Users can always answer with their own text instead of
 * an option, so the host never asks the model to add an "Other" choice.
 */
export const ASK_USER_TOOL_DESCRIPTION = [
  'Ask the user up to 4 questions when their answer changes what you do next:',
  '- Gather preferences or requirements you cannot infer from the workspace',
  '- Clarify an ambiguous instruction',
  '- Let the user choose between implementation approaches',
  '',
  'Ask once, with every related decision in the same call, instead of asking the same person repeatedly.',
  '',
  'Each question must provide:',
  '- header: a very short label (at most 12 characters) shown as a chip, such as "Approach", "Library" or "Auth method".',
  '- question: the complete question, clear and specific, ending with a question mark. Phrase it for multiple selections when selectionMode is multi_select.',
  '- options: 2-4 distinct, mutually exclusive choices unless multi_select is set. Each option needs a concise label (1-5 words) and a description of what choosing it means or causes. Never add an "Other" option; the host always offers free text.',
  '- selectionMode: "single_select" (default) or "multi_select" when more than one choice may apply.',
  '',
  'If you recommend an option, list it first and add "(Recommended)" to its label. Do not use this tool to confirm information the user already gave you.',
].join('\n');

const askUserOptionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1)
    .max(MAX_LABEL_CHARS)
    .describe('Concise display text, 1-5 words.'),
  description: z
    .string()
    .trim()
    .max(MAX_DESCRIPTION_CHARS)
    .optional()
    .describe('What this option means or what happens if it is chosen.'),
});

const askUserQuestionSchema = z.object({
  header: z
    .string()
    .trim()
    .min(1)
    .max(MAX_HEADER_CHARS)
    .describe('Very short chip label, at most 12 characters.'),
  question: z
    .string()
    .trim()
    .min(1)
    .max(MAX_QUESTION_CHARS)
    .describe('The complete question, ending with a question mark.'),
  options: z
    .array(askUserOptionSchema)
    .min(2)
    .max(4)
    .describe('2-4 distinct choices. Never include an "Other" option.'),
  selectionMode: z
    .enum(['single_select', 'multi_select'])
    .optional()
    .describe('Whether the user may pick one option or several. Defaults to single_select.'),
});

const askUserInputSchema = z.object({
  questions: z.array(askUserQuestionSchema).min(1).max(MAX_QUESTIONS),
});

const askUserSuspendSchema = askUserInputSchema;

const askUserResumeSchema = z.record(
  z.string().min(1).max(MAX_QUESTION_CHARS),
  z.union([
    z.string().max(MAX_ANSWER_CHARS),
    z.array(z.string().min(1).max(MAX_LABEL_CHARS)).min(1).max(MAX_LEGACY_OPTIONS),
  ]),
);

type AskUserOption = { label: string; description?: string };

function readOptions(value: unknown): AskUserOption[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_LEGACY_OPTIONS) return null;
  const options: AskUserOption[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const option = item as Record<string, unknown>;
    if (typeof option.label !== 'string') return null;
    const label = option.label.trim();
    if (!label || label.length > MAX_LABEL_CHARS) return null;
    if (
      option.description !== undefined &&
      (typeof option.description !== 'string' || option.description.length > MAX_DESCRIPTION_CHARS)
    )
      return null;
    options.push({
      label,
      ...(typeof option.description === 'string' && option.description
        ? { description: option.description }
        : {}),
    });
  }
  return options;
}

function readSelectionMode(value: unknown): 'single_select' | 'multi_select' | null {
  if (value === undefined) return 'single_select';
  return value === 'single_select' || value === 'multi_select' ? value : null;
}

function readQuestion(
  value: unknown,
  index: number,
): AssistantRuntimeAskUserQuestion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const question = typeof record.question === 'string' ? record.question.trim() : '';
  if (!question || question.length > MAX_QUESTION_CHARS) return null;
  const header =
    typeof record.header === 'string' && record.header.trim()
      ? record.header.trim().slice(0, MAX_HEADER_CHARS)
      : `Question ${index + 1}`;
  const options = readOptions(record.options);
  const selectionMode = readSelectionMode(record.selectionMode);
  if (!options || !selectionMode) return null;
  return {
    header,
    question,
    ...(options.length ? { options } : {}),
    selectionMode,
  };
}

/**
 * Read the questions a session suspended with. Accepts the current `questions`
 * shape and the legacy single-question shape, returning null for anything that
 * cannot be projected safely.
 */
export function readAskUserQuestions(payload: unknown): AssistantRuntimeAskUserQuestion[] | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.questions)) {
    if (record.questions.length === 0 || record.questions.length > MAX_QUESTIONS) return null;
    const questions: AssistantRuntimeAskUserQuestion[] = [];
    for (const [index, value] of record.questions.entries()) {
      const question = readQuestion(value, index);
      if (!question) return null;
      questions.push(question);
    }
    return questions;
  }
  const legacy = readQuestion(record, 0);
  return legacy ? [legacy] : null;
}

function answerValueMatches(
  question: AssistantRuntimeAskUserQuestion,
  value: string | string[],
): boolean {
  if (Array.isArray(value)) {
    if (question.selectionMode !== 'multi_select') return false;
    if (value.length === 0 || new Set(value).size !== value.length) return false;
    const labels = new Set((question.options ?? []).map((option) => option.label));
    return value.every((label) => labels.has(label));
  }
  const text = value.trim();
  return text.length > 0 && text.length <= MAX_ANSWER_CHARS;
}

/**
 * Validate the user's answer and key it by question text, matching Claude's
 * AskUserQuestion answers. A single legacy `answer` stays valid for a
 * one-question suspension.
 */
export function buildAskUserAnswers(
  questions: readonly AssistantRuntimeAskUserQuestion[],
  command: Pick<AssistantRuntimeToolAnswerCommand, 'answer' | 'answers'>,
): AssistantRuntimeAskUserAnswers | null {
  if (!questions.length) return null;
  const answers: AssistantRuntimeAskUserAnswers = {};
  if (command.answers !== undefined) {
    const expected = new Set(questions.map((question) => question.question));
    const received = Object.keys(command.answers);
    if (received.length !== expected.size || received.some((key) => !expected.has(key))) return null;
    for (const question of questions) {
      const value = command.answers[question.question];
      if (value === undefined || !answerValueMatches(question, value)) return null;
      answers[question.question] = value;
    }
    return answers;
  }
  if (command.answer === undefined || questions.length !== 1) return null;
  const [question] = questions;
  if (!answerValueMatches(question, command.answer)) return null;
  answers[question.question] = command.answer;
  return answers;
}

export function formatAskUserAnswersForModel(
  answers: AssistantRuntimeAskUserAnswers,
  questions: readonly AssistantRuntimeAskUserQuestion[],
): string {
  const ordered = questions
    .map((question) => question.question)
    .filter((question) => answers[question] !== undefined);
  const extra = Object.keys(answers).filter((question) => !ordered.includes(question));
  const lines = [...ordered, ...extra].map((question) => {
    const value = answers[question];
    return `${question}: ${Array.isArray(value) ? value.join(', ') : value}`;
  });
  return ['User answered:', ...lines].join('\n');
}

/**
 * MemoFlow's ask_user: the same suspension primitive as Mastra's built-in tool,
 * widened to Claude's multi-question shape. The host answers once with every
 * question, and the tool returns the answers to the model.
 */
export const memoFlowAskUserTool = createTool({
  id: 'ask_user',
  description: ASK_USER_TOOL_DESCRIPTION,
  inputSchema: askUserInputSchema,
  suspendSchema: askUserSuspendSchema,
  resumeSchema: askUserResumeSchema,
  execute: async ({ questions }, context) => {
    const normalized: AssistantRuntimeAskUserQuestion[] = questions.map((question) => ({
      header: question.header,
      question: question.question,
      ...(question.options?.length ? { options: question.options } : {}),
      selectionMode: question.selectionMode ?? 'single_select',
    }));
    const resumeData = context?.agent?.resumeData;
    if (resumeData !== undefined) {
      const answers = askUserResumeSchema.safeParse(resumeData);
      return {
        content: answers.success
          ? formatAskUserAnswersForModel(answers.data, normalized)
          : 'The user answered the questions.',
        isError: false,
      };
    }
    const suspend = context?.agent?.suspend;
    if (suspend) {
      // The runtime normalizes a missing selectionMode to single_select.
      await suspend({ questions });
      return;
    }
    return {
      content: [
        '[Questions for the user — the host cannot display them in this context]',
        ...normalized.map((question, index) => `${index + 1}. ${question.question}`),
      ].join('\n'),
      isError: false,
    };
  },
});
