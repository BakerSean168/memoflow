import { readToolDescriptors, type GatewayReadToolName } from '../read-tool-descriptors';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  ExternalGoalSchema,
  TaskPlanGetOutputSchema,
  TaskPlanSearchOutputSchema,
  TaskOccurrenceGetOutputSchema,
  TaskOccurrenceListOutputSchema,
  GoalGetOutputSchema,
  GoalSearchOutputSchema,
  type GatewayFailureCode,
} from '@memoflow/contracts/agent-gateway';
import { GoalPagePositionSchema, type GoalClientDTO } from '@memoflow/contracts/goal';
import { TaskPlanPositionSchema, TaskOccurrencePositionSchema } from '@memoflow/contracts/task';
import type { ExecutionContext, RequestContext } from '@memoflow/contracts/shared';
import {
  GatewayReadError,
  type GatewayAuditEvent,
  type GatewayDiagnostic,
  type GatewayCredentialPort,
  type GoalReadPort,
  type TaskReadPort,
} from '../ports';

interface Options {
  readonly enabled: boolean;
  readonly audience: string;
  readonly trustedOrigins: readonly string[];
  readonly cursorSecret: string;
  readonly credentials: GatewayCredentialPort;
  readonly goals: GoalReadPort;
  readonly tasks?: TaskReadPort;
  readonly audit: (event: GatewayAuditEvent) => void;
  readonly timeoutMs?: number;
  readonly diagnose?: (event: GatewayDiagnostic) => void;
  readonly consumeOwnerQuota: (identityId: string) => Promise<boolean>;
}
const MAX_BYTES = 256 * 1024;
function isReadToolName(name: string): name is GatewayReadToolName {
  return Object.prototype.hasOwnProperty.call(readToolDescriptors, name);
}
const CursorSchema = z.strictObject({
  identityId: z.string(),
  query: z.string().max(200),
  limit: z.number().int().min(1).max(100),
  order: z.literal('createdAt-desc/id-desc'),
  expiresAt: z.number().int(),
  after: GoalPagePositionSchema,
});
const TaskCursorSchema = z.strictObject({
  identityId: z.string(),
  tool: z.enum(['task_plan_search', 'task_occurrence_list']),
  binding: z.string().max(1000),
  expiresAt: z.number().int(),
  after: z.union([TaskPlanPositionSchema, TaskOccurrencePositionSchema]),
  timeZone: z.string().max(100).optional(),
  asOf: z.number().int().nonnegative().optional(),
});
function fitPage<T>(values: readonly T[]) {
  const items = [...values];
  let truncated = false;
  while (items.length > 1 && Buffer.byteLength(JSON.stringify(items)) > MAX_BYTES - 4096) {
    items.pop();
    truncated = true;
  }
  return { items, truncated };
}

class ControlledError extends GatewayReadError {
  constructor(code: GatewayFailureCode) {
    super(code);
  }
}
function projectGoal(goal: GoalClientDTO) {
  if ((goal.keyResults?.length ?? 0) > 100) throw new ControlledError('RESPONSE_TOO_LARGE');
  return ExternalGoalSchema.parse({
    id: goal.id,
    name: goal.name,
    summary: goal.summary,
    status: goal.status,
    version: goal.version,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
    overallProgress: goal.overallProgress,
    keyResults: (goal.keyResults ?? []).map((kr) => ({
      id: kr.id,
      title: kr.title,
      progress: kr.progress,
      progressPercentage: kr.progressPercentage,
      isCompleted: kr.isCompleted,
    })),
  });
}
async function boundedBody(
  body: ReadableStream<Uint8Array> | null,
  signal: AbortSignal,
  code: 'REQUEST_TOO_LARGE' | 'RESPONSE_TOO_LARGE' = 'REQUEST_TOO_LARGE',
): Promise<string> {
  const reader = body?.getReader();
  if (!reader) return '';
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new ControlledError(code);
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function within<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new ControlledError('TIMEOUT');
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        cancel = () => reject(new ControlledError('TIMEOUT'));
        signal.addEventListener('abort', cancel, { once: true });
      }),
    ]);
  } finally {
    if (cancel) signal.removeEventListener('abort', cancel);
  }
}

/**
 * Creates the concrete Goal/Task hosted read MCP adapter. Credentials are checked on
 * every HTTP attempt and again immediately before each owner invocation.
 * @param options - Host bindings, durable authority and bounded read configuration.
 * @returns A fetch adapter accepting the host's canonical RequestContext.
 */
export function createReadGateway(options: Options) {
  if (options.enabled && Buffer.byteLength(options.cursorSecret) < 32)
    throw new Error('Cursor secret must be at least 32 bytes');
  const sign = (payload: string) =>
    createHmac('sha256', options.cursorSecret).update(payload).digest('base64url');
  function decodeCursor(cursor: string, identityId: string, query: string, limit: number) {
    try {
      const [payload, signature, extra] = cursor.split('.');
      if (!payload || !signature || extra) throw new Error('shape');
      const expected = Buffer.from(sign(payload));
      const actual = Buffer.from(signature);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new Error('signature');
      const parsed = CursorSchema.parse(
        JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
      );
      if (
        parsed.identityId !== identityId ||
        parsed.query !== query ||
        parsed.limit !== limit ||
        parsed.expiresAt <= Date.now()
      )
        throw new Error('binding');
      return parsed.after;
    } catch {
      throw new ControlledError('INVALID_CURSOR');
    }
  }
  function encodeTaskCursor(input: z.infer<typeof TaskCursorSchema>) {
    const payload = Buffer.from(JSON.stringify(TaskCursorSchema.parse(input))).toString(
      'base64url',
    );
    return `${payload}.${sign(payload)}`;
  }
  function decodeTaskCursor(
    cursor: string,
    identityId: string,
    tool: z.infer<typeof TaskCursorSchema>['tool'],
    binding: string,
  ) {
    try {
      const [payload, signature, extra] = cursor.split('.');
      if (!payload || !signature || extra) throw new Error('shape');
      const expected = Buffer.from(sign(payload)),
        actual = Buffer.from(signature);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        throw new Error('signature');
      const parsed = TaskCursorSchema.parse(
        JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
      );
      if (
        parsed.identityId !== identityId ||
        parsed.tool !== tool ||
        parsed.binding !== binding ||
        parsed.expiresAt <= Date.now()
      )
        throw new Error('binding');
      return parsed;
    } catch {
      throw new ControlledError('INVALID_CURSOR');
    }
  }

  return {
    async fetch(request: Request, requestContext: RequestContext): Promise<Response> {
      const started = Date.now();
      const deadlineAt = requestContext.startedAt + (options.timeoutMs ?? 30000);
      const controller = new AbortController();
      const signal = AbortSignal.any([request.signal, controller.signal]);
      const timer = setTimeout(() => controller.abort(), Math.max(1, deadlineAt - Date.now()));
      const budget = { deadlineAt, signal };
      let tool: GatewayAuditEvent['tool'] = 'transport';
      let identityId: string | undefined;
      let credentialId: string | undefined;
      let outcome = 'TRANSPORT_PENDING';
      let scopeDecision: GatewayAuditEvent['scopeDecision'] = 'denied';
      const reject = (status: number, code: string) => {
        outcome = code;
        return Response.json(
          { error: code },
          {
            status,
            headers: {
              'Cache-Control': 'no-store',
              ...(status === 429 ? { 'Retry-After': '60' } : {}),
            },
          },
        );
      };
      function diagnose(cause: unknown) {
        try { options.diagnose?.({ requestId: requestContext.requestId, traceId: requestContext.traceId, cause }); }
        catch { /* Observer failure does not alter a safe public response. */ }
      }
      try {
        if (!options.enabled) return reject(404, 'DISABLED');
        const origin = request.headers.get('origin');
        if (origin && !options.trustedOrigins.includes(origin)) return reject(403, 'ORIGIN_DENIED');
        if (request.method !== 'POST') return reject(405, 'METHOD_NOT_ALLOWED');
        const auth = request.headers.get('authorization') ?? undefined;
        const principal = await within(
          () => options.credentials.authenticate(auth, requestContext),
          signal,
        );
        if (!principal) return reject(401, 'INVALID_CREDENTIAL');
        identityId = principal.identityId;
        credentialId = principal.credentialId;
        if (!principal.scopes.some((scope) => scope === 'goals:read' || scope === 'tasks:read'))
          return reject(403, 'INSUFFICIENT_SCOPE');
        scopeDecision = 'allowed';
        if (!(await within(() => options.consumeOwnerQuota(principal.identityId), signal)))
          return reject(429, 'RATE_LIMITED');
        if (
          !(await within(
            () => options.credentials.consumeReadQuota(principal.credentialId),
            signal,
          ))
        )
          return reject(429, 'RATE_LIMITED');
        const body = await within(() => boundedBody(request.body, signal), signal);
        let invocation = false;
        try {
          const probe = z
            .object({ method: z.literal('tools/call'), params: z.object({ name: z.string() }) })
            .safeParse(JSON.parse(body));
          if (probe.success) {
            invocation = true;
            const name = probe.data.params.name;
            if (isReadToolName(name)) {
              tool = name;
              if (!principal.scopes.includes(readToolDescriptors[name].requiredScope)) {
                scopeDecision = 'denied';
                return reject(403, 'INSUFFICIENT_SCOPE');
              }
              if (name.startsWith('task_') && !options.tasks) {
                scopeDecision = 'denied';
                return reject(404, 'DISABLED');
              }
            }
          }
        } catch {
          /* The SDK owns malformed protocol input. */
        }

        const context: ExecutionContext = { ...requestContext, identityId: principal.identityId };
        async function call<T>(
          name: GatewayReadToolName,
          requiredScope: 'goals:read' | 'tasks:read',
          operation: () => Promise<T>,
        ) {
          tool = name;
          try {
            const current = await within(
              () => options.credentials.authenticate(auth, requestContext),
              signal,
            );
            if (
              !current ||
              current.identityId !== context.identityId ||
              current.credentialId !== principal!.credentialId ||
              !current.scopes.includes(requiredScope)
            ) {
              scopeDecision = 'denied';
              throw new ControlledError('FORBIDDEN');
            }
            const result = await within(operation, signal);
            const serialized = JSON.stringify(result);
            if (Buffer.byteLength(serialized) > MAX_BYTES)
              throw new ControlledError('RESPONSE_TOO_LARGE');
            outcome = 'OK';
            return {
              content: [{ type: 'text' as const, text: 'Owned read completed.' }],
              structuredContent: result as Record<string, unknown>,
            };
          } catch (error) {
            outcome = error instanceof GatewayReadError ? error.code : 'INTERNAL_ERROR';
            if (!(error instanceof GatewayReadError)) diagnose(error);
            return { isError: true, content: [{ type: 'text' as const, text: outcome }] };
          }
        }
        const handler = createMcpHandler(
          () => {
            const server = new McpServer({ name: 'memoflow-agent-gateway', version: '0.1.0' });
            if (principal.scopes.includes('goals:read')) {
              server.registerTool('goal_get', readToolDescriptors.goal_get.definition, ({ id }) =>
                call('goal_get', 'goals:read', async () => {
                  const goal = await options.goals.getGoal(id, context, budget);
                  if (!goal) throw new ControlledError('NOT_FOUND');
                  return GoalGetOutputSchema.parse({ goal: projectGoal(goal) });
                }),
              );
              server.registerTool(
                'goal_search',
                readToolDescriptors.goal_search.definition,
                ({ query, limit, cursor }) =>
                  call('goal_search', 'goals:read', async () => {
                    const after = cursor
                      ? decodeCursor(cursor, context.identityId, query, limit)
                      : undefined;
                    const page = await options.goals.searchGoalPage(
                      { query, limit, ...(after ? { after } : {}) },
                      context,
                      budget,
                    );
                    const { items, truncated } = fitPage(page.items.map(projectGoal));
                    const hasMore = page.hasMore || truncated;
                    const last = page.items[items.length - 1];
                    let nextCursor: string | null = null;
                    if (hasMore && last) {
                      const payload = Buffer.from(
                        JSON.stringify(
                          CursorSchema.parse({
                            identityId: context.identityId,
                            query,
                            limit,
                            order: 'createdAt-desc/id-desc',
                            expiresAt: Date.now() + 86400000,
                            after: { createdAt: last.createdAt, id: last.id },
                          }),
                        ),
                      ).toString('base64url');
                      nextCursor = `${payload}.${sign(payload)}`;
                    }
                    return GoalSearchOutputSchema.parse({
                      items,
                      hasMore,
                      ...(truncated ? { truncated: 'response-budget' as const } : {}),
                      nextCursor,
                    });
                  }),
              );
            }
            if (options.tasks && principal.scopes.includes('tasks:read')) {
              const tasks = options.tasks;
              server.registerTool(
                'task_plan_get',
                readToolDescriptors.task_plan_get.definition,
                ({ id }) =>
                  call('task_plan_get', 'tasks:read', async () => {
                    const plan = await tasks.getTaskPlan(id, context, budget);
                    if (!plan) throw new ControlledError('NOT_FOUND');
                    return TaskPlanGetOutputSchema.parse({ plan });
                  }),
              );
              server.registerTool(
                'task_plan_search',
                readToolDescriptors.task_plan_search.definition,
                ({ query, limit, cursor }) =>
                  call('task_plan_search', 'tasks:read', async () => {
                    const binding = JSON.stringify({ query, limit });
                    const decoded = cursor
                      ? decodeTaskCursor(cursor, context.identityId, 'task_plan_search', binding)
                      : undefined;
                    const page = await tasks.searchTaskPlans(
                      {
                        query,
                        limit,
                        ...(decoded ? { after: TaskPlanPositionSchema.parse(decoded.after) } : {}),
                      },
                      context,
                      budget,
                    );
                    const { items, truncated } = fitPage(page.items);
                    const hasMore = page.hasMore || truncated;
                    const last = items[items.length - 1];
                    const nextCursor =
                      hasMore && last
                        ? encodeTaskCursor({
                            tool: 'task_plan_search',
                            binding,
                            identityId: context.identityId,
                            after: { createdAt: last.createdAt, id: last.id },
                            expiresAt: Date.now() + 86400000,
                          })
                        : null;
                    return TaskPlanSearchOutputSchema.parse({
                      items,
                      hasMore,
                      nextCursor,
                      ...(truncated ? { truncated: 'response-budget' } : {}),
                    });
                  }),
              );
              server.registerTool(
                'task_occurrence_get',
                readToolDescriptors.task_occurrence_get.definition,
                ({ id }) =>
                  call('task_occurrence_get', 'tasks:read', async () => {
                    const occurrence = await tasks.getTaskOccurrence(id, context, budget);
                    if (!occurrence) throw new ControlledError('NOT_FOUND');
                    return TaskOccurrenceGetOutputSchema.parse({ occurrence });
                  }),
              );
              server.registerTool(
                'task_occurrence_list',
                readToolDescriptors.task_occurrence_list.definition,
                ({ startDate, endDate, includeOverdueOpen, limit, cursor }) =>
                  call('task_occurrence_list', 'tasks:read', async () => {
                    const binding = JSON.stringify({
                      startDate,
                      endDate,
                      includeOverdueOpen,
                      limit,
                    });
                    const decoded = cursor
                      ? decodeTaskCursor(
                          cursor,
                          context.identityId,
                          'task_occurrence_list',
                          binding,
                        )
                      : undefined;
                    if (decoded && (!decoded.timeZone || decoded.asOf === undefined))
                      throw new ControlledError('INVALID_CURSOR');
                    const page = await tasks.listTaskOccurrences(
                      {
                        startDate,
                        endDate,
                        includeOverdueOpen,
                        limit,
                        ...(decoded
                          ? {
                              after: TaskOccurrencePositionSchema.parse(decoded.after),
                              timeZone: decoded.timeZone,
                              asOf: decoded.asOf,
                            }
                          : {}),
                      },
                      context,
                      budget,
                    );
                    const { items, truncated } = fitPage(page.items);
                    const hasMore = page.hasMore || truncated;
                    const last = items[items.length - 1];
                    const nextCursor =
                      hasMore && last
                        ? encodeTaskCursor({
                            tool: 'task_occurrence_list',
                            binding,
                            identityId: context.identityId,
                            after: { scheduleDate: last.scheduleSnapshot.date, id: last.id },
                            timeZone: page.timeZone,
                            asOf: page.asOf,
                            expiresAt: Date.now() + 86400000,
                          })
                        : null;
                    return TaskOccurrenceListOutputSchema.parse({
                      items,
                      hasMore,
                      nextCursor,
                      timeZone: page.timeZone,
                      asOf: page.asOf,
                      ...(truncated ? { truncated: 'response-budget' } : {}),
                    });
                  }),
              );
            }

            return server;
          },
          { legacy: 'stateless' },
        );
        const response = await within(
          () =>
            handler.fetch(
              new Request(options.audience, {
                method: 'POST',
                headers: request.headers,
                body,
                signal,
              }),
            ),
          signal,
        );
        const responseBody = await within(
          () => boundedBody(response.body, signal, 'RESPONSE_TOO_LARGE'),
          signal,
        );
        if (outcome === 'TRANSPORT_PENDING') {
          if (invocation) {
            outcome = tool === 'transport' ? 'UNKNOWN_TOOL' : 'INVALID_INPUT';
            scopeDecision = 'denied';
          } else outcome = response.ok ? 'PROTOCOL_OK' : 'PROTOCOL_REJECTED';
        }
        response.headers.set('Cache-Control', 'no-store');
        return new Response(responseBody || null, {
          status: response.status,
          headers: response.headers,
        });
      } catch (error) {
        if (error instanceof GatewayReadError && error.code === 'TIMEOUT')
          return reject(504, 'TIMEOUT');
        if (error instanceof ControlledError && error.code === 'REQUEST_TOO_LARGE')
          return reject(413, error.code);
        if (error instanceof ControlledError && error.code === 'RESPONSE_TOO_LARGE')
          return reject(502, error.code);
        diagnose(error);
        return reject(500, 'INTERNAL_ERROR');
      } finally {
        clearTimeout(timer);
        controller.abort();
        try {
          options.audit({
            version: '1',
            effect: 'read',
            scopeDecision,
            requestId: requestContext.requestId,
            traceId: requestContext.traceId,
            identityId,
            credentialId,
            tool,
            outcome,
            durationMs: Date.now() - started,
          });
        } catch {
          /* Audit collection cannot leak input or change response. */
        }
      }
    },
  };
}
