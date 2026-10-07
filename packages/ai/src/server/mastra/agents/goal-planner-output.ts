import type { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { z } from 'zod';
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapTaskYmdWireValue(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const keys = Object.keys(value);
  if (
    keys.length === 2 &&
    keys.includes('kind') &&
    keys.includes('date') &&
    value.kind === 'day' &&
    typeof value.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.date)
  ) {
    return value.date;
  }
  return value;
}

/**
 * Normalize only the lossless date-wrapper confusion between GoalTimeframe.day
 * and TaskPlanSchedule YMD fields. No semantic plan values are inferred here.
 */
function normalizePlannerWireShape(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.candidateDraft)) return value;
  const { dueToClarification: _legacyClarificationHint, ...candidateDraft } = value.candidateDraft;
  const tasks = candidateDraft.tasks;
  const normalizedTasks = Array.isArray(tasks)
    ? tasks.map((task) => {
        if (!isRecord(task) || !isRecord(task.schedule)) return task;
        const schedule = task.schedule;

        if (schedule.kind === 'OneTime') {
          return {
            ...task,
            schedule: {
              ...schedule,
              date: unwrapTaskYmdWireValue(schedule.date),
            },
          };
        }

        if (schedule.kind === 'Recurring') {
          const recurrence = isRecord(schedule.recurrence) ? schedule.recurrence : undefined;
          const recurrenceEnd = recurrence && isRecord(recurrence.end) ? recurrence.end : undefined;
          return {
            ...task,
            schedule: {
              ...schedule,
              startDate: unwrapTaskYmdWireValue(schedule.startDate),
              ...(recurrence
                ? {
                    recurrence: {
                      ...recurrence,
                      ...(recurrenceEnd?.kind === 'Until'
                        ? {
                            end: {
                              ...recurrenceEnd,
                              date: unwrapTaskYmdWireValue(recurrenceEnd.date),
                            },
                          }
                        : {}),
                    },
                  }
                : {}),
            },
          };
        }

        return task;
      })
    : tasks;

  return {
    ...value,
    candidateDraft: {
      ...candidateDraft,
      ...(Array.isArray(tasks) ? { tasks: normalizedTasks } : {}),
    },
  };
}

function exactJsonText(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

/**
 * Some OpenAI-compatible relays return valid JSON text while the AI SDK/Mastra
 * structured-output object is unavailable after provider-side validation.
 * Recover only an exact JSON document (or one whole fenced JSON block); never
 * scrape prose or infer missing domain values.
 */
function structuredOutputCandidate(output: unknown): unknown {
  if (!isRecord(output)) return undefined;
  if (output.object !== undefined) return output.object;
  const text =
    typeof output.text === 'string'
      ? output.text
      : typeof output.outputText === 'string'
        ? output.outputText
        : undefined;
  if (!text?.trim()) return undefined;
  try {
    return JSON.parse(exactJsonText(text));
  } catch {
    return undefined;
  }
}

function summarizeValidationIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 12)
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('\n');
}

function goalPlanningStructuredOutputInstructions(allowResearch: boolean): string {
  return [
    'Return exactly one JSON object and no markdown.',
    allowResearch
      ? 'status is exactly draft_ready, needs_clarification, or needs_research.'
      : 'status is exactly draft_ready or needs_clarification. Never emit needs_research.',
    'Every decision has reason (non-empty string). Never omit reason.',
    'needs_clarification has questions: 1-3 non-empty strings; candidateDraft is optional.',
    ...(allowResearch
      ? [
          'needs_research has requests: 1-3 objects { query, intent }, where intent is exactly requirements, timeline, or resources. It has no candidateDraft.',
          'If the user explicitly requires verification of current or official public facts, or a material plan branch/date depends on live or time-sensitive public facts not already grounded in canonical external evidence, status MUST be needs_research before any draft_ready response. Never substitute model memory for that verification. forceDraft suppresses clarification only and does not suppress required research.',
        ]
      : []),
    'draft_ready has candidateDraft with goal, keyResults, tasks, knowledge, rationale, warnings. candidateDraft contains only canonical fields; never emit dueToClarification or other helper metadata.',
    'candidateDraft.goal: { draftRef:"goal", name, optional summary/description/reminderConfig, status:"Planned"|"InProgress", optional start/target GoalTimeframe, labels:string[] }.',
    'GoalTimeframe is one of {kind:"day",date:"YYYY-MM-DD"}, {kind:"month",year,month}, {kind:"quarter",year,quarter}, {kind:"halfYear",year,half}, {kind:"year",year}.',
    'Each Key Result: { draftRef:"kr:<lowercase-ascii-slug>", title, optional description, aggregationMethod:"Sum"|"Average"|"Max"|"Min"|"Last", initialValue:number, optional currentValue:number, targetValue:number, optional target:GoalTimeframe|null, optional unit, weight:1..5 }. Use title, never name.',
    'Each Task: { draftRef:"task:<lowercase-ascii-slug>", title, optional description, importance:"Vital"|"Important"|"Moderate"|"Minor"|"Trivial", schedule, optional reminderConfig, labels:string[], goalRef:"goal", optional keyResultRef:"kr:<slug>"|null, optional contribution }. Omit reminderConfig/contribution unless materially useful.',
    'Task OneTime schedule is {kind:"OneTime",date:"YYYY-MM-DD",timing}. Task Recurring schedule is {kind:"Recurring",startDate:"YYYY-MM-DD",timing,recurrence:{frequency:"Daily"|"Weekly"|"Monthly"|"Yearly",interval:positive integer,byWeekday:number[],end}}. Weekly recurrence requires at least one byWeekday; non-weekly recurrence uses []. Task dates are bare strings, never GoalTimeframe objects.',
    'Task timing is {kind:"AllDay"}, {kind:"At",time:"HH:mm"}, or {kind:"Window",start:"HH:mm",end:"HH:mm"}. Recurrence end is {kind:"Never"}, {kind:"Until",date:"YYYY-MM-DD"}, or {kind:"Count",count:positive integer}.',
    'Task reminderConfig, when used, is {enabled:boolean,triggers:[{type:"Absolute"|"Relative",absoluteTime:number|null,relativeValue:number|null,relativeUnit:"Minutes"|"Hours"|"Days"|null}]}. contribution, when used, requires keyResultRef and is {value:non-zero number,trigger:"EachCompletion"|"PlanCompletion"}.',
    'Knowledge may be empty. create item: {draftRef:"note:<lowercase-ascii-slug>",mode:"create",title,markdown,targetSubpath:"vault/relative/path.md",sourceRefs:string[]}. linkExisting is allowed only when canonical context provides the exact knowledgeDocument ref.',
    'rationale is a string; warnings is an array of strings. Omit unsupported optional fields instead of inventing values.',
  ].join('\n');
}

export async function generateGoalPlanningDecision<TSchema extends z.ZodTypeAny>(
  agent: Agent<'goal-planner-worker'>,
  prompt: string,
  schema: TSchema,
  requestContext: RequestContext,
  outputs: unknown[],
  allowResearch: boolean,
): Promise<z.infer<TSchema>> {
  const firstOutput = await agent.generate(prompt, {
    requestContext,
    structuredOutput: {
      schema,
      // The canonical Goal draft uses transforms/custom refinements that are
      // not faithfully portable through provider-native JSON Schema. Keep the
      // application schema authoritative and send a compact provider wire contract.
      jsonPromptInjection: 'system',
      instructions: goalPlanningStructuredOutputInstructions(allowResearch),
      errorStrategy: 'warn',
    },
  });
  outputs.push(firstOutput);

  const firstCandidate = normalizePlannerWireShape(structuredOutputCandidate(firstOutput));
  const parsed = schema.safeParse(firstCandidate);
  if (parsed.success) return parsed.data;

  const repairPrompt = [
    prompt,
    'Your previous structured response failed MemoFlow canonical validation. Regenerate the complete decision once, correcting only contract-shape errors while preserving the intended plan.',
    'Critical canonical invariants: every decision includes non-empty reason; candidateDraft contains only canonical goal/keyResults/tasks/knowledge/rationale/warnings fields and never dueToClarification; Key Results use title (never name); draftRef is goal or kr:/task:/note: followed by a lowercase ASCII slug; aggregationMethod is exactly Sum, Average, Max, Min, or Last; Task OneTime schedule.date and Recurring schedule.startDate / Until end.date are bare YYYY-MM-DD strings, never GoalTimeframe objects; knowledge create targetSubpath is vault-relative and ends in .md; goalRef is exactly goal; every keyResultRef references a Key Result draftRef present in the same draft.',
    ...(firstCandidate === undefined
      ? []
      : ['Previous candidate JSON:', JSON.stringify(firstCandidate)]),
    'Validation issues from the previous attempt:',
    summarizeValidationIssues(parsed.error),
  ].join('\n\n');

  const repairOutput = await agent.generate(repairPrompt, {
    requestContext,
    structuredOutput: {
      schema,
      jsonPromptInjection: 'system',
      instructions: goalPlanningStructuredOutputInstructions(allowResearch),
      errorStrategy: 'warn',
    },
  });
  outputs.push(repairOutput);
  const repairCandidate = normalizePlannerWireShape(structuredOutputCandidate(repairOutput));
  return schema.parse(repairCandidate);
}
