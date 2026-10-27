import { z } from 'zod';
import {
  GoalWorkflowLiveActionJournalSchema,
  GoalWorkflowLiveActionRecordSchema,
} from '@memoflow/ai-contracts';
import { AI_PUBLIC_FAILURE_CODES, toAIPublicFailure } from '../../../shared/ai-public-failure';
import { projectGoalWorkflowPublicState } from './workflow-run-projection';
import type { GoalWorkflowChange } from '../../application/ports/goal-workflow-events.port';

const storedState = z
  .object({
    runId: z.string().min(1),
    conversationId: z.string().min(1),
    status: z.string().min(1).max(32),
    createdAt: z.string(),
    updatedAt: z.string(),
    startRequestId: z.string().uuid().nullable(),
    suspension: z.unknown(),
    result: z.unknown(),
    receipt: z.unknown(),
    errorCode: z.enum(AI_PUBLIC_FAILURE_CODES).nullable(),
    limitKind: z.enum(['rate_limit', 'quota_exhausted', 'unknown']).nullable(),
    retryKind: z.enum(['after', 'transient', 'not_retryable']).nullable(),
    afterMs: z.number().int().nonnegative().max(86_400_000).nullable(),
  })
  .strict();
const integer = z.coerce.number().int().nonnegative();
const positive = z.coerce.number().int().positive();
const json = (value: unknown): unknown => (typeof value === 'string' ? JSON.parse(value) : value);

export function decodeGoalEventState(payload: unknown, version: unknown, actions: unknown = []) {
  const state = storedState.parse(json(payload));
  const publicFailure = state.errorCode
    ? toAIPublicFailure(
        {
          code: state.errorCode,
          message: 'Workflow request interrupted',
          ...(state.errorCode === 'RATE_LIMITED'
            ? {
                failure: {
                  code: 'RATE_LIMITED',
                  category: 'rate_limited',
                  ...(state.limitKind ? { details: { limitKind: state.limitKind } } : {}),
                  ...(state.retryKind && (state.retryKind !== 'after' || state.afterMs !== null)
                    ? {
                        retryHint: {
                          kind: state.retryKind,
                          ...(state.retryKind === 'after' ? { afterMs: state.afterMs } : {}),
                        },
                      }
                    : {}),
                },
              }
            : {}),
        },
        {
          fallbackCode: 'AI_RUNTIME_TRANSPORT_ERROR',
          fallbackMessage: 'AI runtime request failed',
        },
      )
    : undefined;
  return projectGoalWorkflowPublicState({
    runId: state.runId,
    conversationId: state.conversationId,
    startRequestId: state.startRequestId ?? undefined,
    status: state.status,
    suspension: state.suspension,
    result: state.result,
    receipt: state.receipt,
    liveActions: GoalWorkflowLiveActionJournalSchema.parse(json(actions)),
    failure: publicFailure
      ? {
          code: publicFailure.code,
          message: publicFailure.message,
          ...(publicFailure.details ? { details: publicFailure.details } : {}),
          ...(publicFailure.retryHint ? { retryHint: publicFailure.retryHint } : {}),
        }
      : undefined,
    resourceVersion: positive.parse(version),
    createdAt: new Date(state.createdAt).getTime(),
    updatedAt: new Date(state.updatedAt).getTime(),
  });
}

export function decodeGoalWorkflowChange(row: Record<string, unknown>): GoalWorkflowChange {
  return {
    eventId: z.string().min(1).parse(row.event_id),
    sequence: positive.parse(row.sequence),
    resourceVersion: positive.parse(row.resource_version),
    run: decodeGoalEventState(row.payload, row.resource_version),
    actions: z.array(GoalWorkflowLiveActionRecordSchema).max(64).parse(json(row.actions)),
    baseActionSequence: integer.parse(row.base_action_sequence),
    lastActionSequence: integer.parse(row.last_action_sequence),
  };
}
