import { z } from 'zod';

/** Shared business guidance; execution policy belongs to each host. */
export const GOAL_PLANNING_GUIDANCE = `## Plan the outcome
When asked to create or develop a goal, normally propose a useful Goal description, measurable Key Results, and a first set of actionable, linked Tasks. Do not stop at a title unless the user explicitly requests only that. Keep the plan proportionate.

Use facts supplied by the user and available owner data. When enhancing an existing Goal, preserve its identity, KRs, and human changes; do not create a replacement. Research changing external facts when they materially affect the plan. Distinguish evidence, assumptions, and unresolved decisions.

KRs describe outcomes with a meaningful baseline, target, unit, and measurement method. Tasks describe actions that contribute to those outcomes. Completing an application task does not prove income was earned; completing a release checklist does not prove a release is live. Use a Task progress rule only when the measurement is justified.

Ask only for missing information that materially changes the plan or authorization. Use the host's native Ask User facility when available; otherwise ask concise questions in the current conversation. An internal structured planner returns its clarification decision instead. Do not require a special question tool.

Use canonical Goal timeframe and Task schedule schemas. Preserve coarse date precision; do not invent a deadline, exact time, or recurring schedule. If a Task schedule cannot be grounded, ask for it or leave that Task as an explicitly unsaved proposal.

Respect a narrower request to create only a Goal, add one KR, or change one Task. A Skill guides planning; business schemas and authorization determine what may actually be committed.`;

export const GOAL_PLANNING_SKILL = `---
name: goal-planning
description: Create or enrich MemoFlow Goals with measurable Key Results and linked Tasks. Use when a user asks to create, plan, break down, or complete a goal.
---
# MemoFlow goal planning

${GOAL_PLANNING_GUIDANCE}

## Execute with the current Agent
You are the planner. Use your own reasoning, research, and available tools. No MemoFlow Conversation ID, Agent Run ID, second planning model, or workflow resume handle is needed.

Discover the tools available on this connection; tools/list schemas are authoritative. Use goal_search/goal_get and task_plan_search when authorized to avoid duplicates. If reads are unavailable, use exact IDs supplied by the user or explain the missing capability; do not guess IDs.

Build a create target or an existing target (goalId and expectedVersion), stable kr:<slug> and task:<slug> refs, and canonical owner fields. New KRs live in keyResults. For an existing Goal, existingKeyResults maps a ref to an already verified KR ID. Tasks name their keyResultRef when appropriate.

Use goal_plan_validate before saving. Missing KRs or Tasks are planning warnings, not a prohibition on intentionally simple requests. Validation is deterministic and creates nothing.

When authorized to save through business tools, call goal_plan_apply with a stable idempotencyKey and the reviewed plan. It composes the same Goal/KR/Task owner operations as the primitive tools, with each operation's permission checks. It calls no model. Use primitive tools for individual edits or another useful composition.

## Choose the visible surface
In an internal native Agent session, follow the host's native-form policy: create and save Goal/KRs with goal_panel_* when provided, then use the saved Goal ID and verified KR IDs (from receipts or authorized reads) to add linked Tasks with an existing-target plan or task_plan_create. Do not bypass a required form with goal_plan_apply.

On an external local connection, goal_panel_present can fill a Goal/KR draft and hand the form to the user, or open a saved Goal for refinement. A presented draft is NOT saved and does not create linked Tasks. For a complete saved plan, apply it first, then present the returned Goal ID. If the user requests review before saving, present the draft and wait for the user's save before attaching Tasks. Hosted connections may have no local panel; continue in conversation.

An internal structured planner only returns its structured decision; its host owns review and mutation. Do not invoke writes from a planning-only role.

## Report and recover from facts
Only say objects were created after successful owner receipts. Return the Goal, KR, and Task IDs actually saved; explain partial success and outstanding items.

A plan is a sequence of owner-local operations, not one cross-domain transaction. Retries replay durable per-item receipts. Keep the same idempotencyKey, original plan, stable refs, and expectedVersion when retrying. Reordering items is safe. Changing a committed item's content under the same key is a conflict. Never put a content hash into a new retry key to evade a conflict.

Idempotency is per item and the host's existing credential/owner boundary, not a frozen whole-plan manifest. Do not append new refs under an interrupted operation. After a conflict, read current state and plan only remaining work under a new key, reusing returned IDs. Do not recreate successful items or automatically refresh expectedVersion to overwrite human edits.

Stop on permission denial or persistent validation/conflict errors. Retry an unchanged transient failure at most twice, then report completed and outstanding items. A new local MCP connection may have a different idempotency boundary; read existing objects before replaying across credential rotation.
`;

export const GOAL_PLANNING_SKILL_URI = 'skill://goal-planning/SKILL.md';

export const workflowGuideToolDescriptor = {
  // Static protocol documentation contains no owner data.
  requiredScope: undefined,
  definition: {
    description:
      'Read MemoFlow business guidance before creating or enriching a Goal: plan measurable Key Results and linked Tasks, ask useful questions, and use available tools. No writes or model calls.',
    inputSchema: z.object({ guide: z.literal('goal-planning').default('goal-planning') }).strict(),
    outputSchema: z.object({
      guide: z.literal('goal-planning'),
      uri: z.literal(GOAL_PLANNING_SKILL_URI),
      markdown: z.string(),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
} as const;

export const MEMOFLOW_WORKFLOW_INSTRUCTIONS =
  "For Goal creation or planning, read the goal-planning Skill (skill://goal-planning/SKILL.md) or call workflow_guide_get. Normally plan Goal + measurable Key Results + linked Tasks. Respect the user's narrower request and the host's native-form policy; only claim saved objects from actual receipts.";
