import type { AIWorkflowRunView } from '@memoflow/ai-contracts';
import type { ChatItem } from './types';
import { getAIWorkflowTerminalFailureMessage } from './error';

/** Goal-specific timeline projection; no owner editing or persistence authority. */
export function goalWorkflowTimelineItem(
  run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>,
  t: Parameters<typeof getAIWorkflowTerminalFailureMessage>[1],
): ChatItem | null {
  if (run.status === 'failed') return null; // The existing runtime item owns the interruption.
  const suspension = run.suspension;
  if (suspension?.type === 'clarification_required') {
    const content = suspension.questions
      .map((question, index) =>
        suspension.questions.length === 1 ? question : `${index + 1}. ${question}`,
      )
      .join('\n');
    return {
      id: `goal-clarification-${run.runId}-${suspension.round ?? 1}`,
      role: 'assistant',
      content,
      status: 'success',
    };
  }
  if (suspension?.type === 'goal_draft_review') {
    const content = [
      ...suspension.draft.tasks.map((item) => `- ${item.title}`),
      ...suspension.draft.knowledge.map((item) => `- ${item.title}`),
    ].join('\n');
    return content
      ? {
          id: `goal-supporting-proposals-${run.runId}-${suspension.draft.revision}`,
          role: 'assistant',
          content,
          status: 'success',
        }
      : null;
  }
  return null;
}
