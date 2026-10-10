import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createLogger } from '@memoflow/utils/logger';
import type { Options, PermissionResult, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type {
  LocalAgentConnection,
  LocalAgentRequest,
  LocalAgentRequestResponse,
  LocalAgentStatus,
} from '@memoflow/contracts/ai';
import type { NativeAgentEvent, NativeAgentRunInput } from './codex-driver';
import { LocalAgentError } from '../../shared/local-agent-error';
import { NativeEventQueue } from './native-event-queue';
import { resolveNativeExecutable } from './native-executable';
import { nativeFailure } from './native-failure';
import { nativeIdentity } from './native-identity';
const logger = createLogger('ClaudeLocalDriver');

// Each MemoFlow MCP call is classified here rather than relying on Claude's
// allowedTools wildcard: that wildcard auto-approves tools before canUseTool.
const memoFlowReadTools = new Set([
  'goal_get',
  'goal_search',
  'task_plan_get',
  'task_plan_search',
  'task_occurrence_get',
  'task_occurrence_list',
  'knowledge_get',
  'knowledge_search',
]);
const memoFlowWriteTools = new Set([
  'goal_create',
  'goal_update',
  'task_plan_create',
  'task_plan_update',
  'task_occurrence_complete',
]);
const memoFlowToolPrefix = 'mcp__memoflow__';

interface ClaudeQuery extends AsyncIterable<unknown> {
  initializationResult(): Promise<unknown>;
  interrupt(): Promise<unknown>;
  close(): void;
}
export type ClaudeQueryFactory = (args: {
  prompt: AsyncIterable<SDKUserMessage>;
  options: Options;
}) => ClaudeQuery | Promise<ClaudeQuery>;
const initialization = z.object({
  account: z.object({
    email: z.string().optional(),
    organization: z.string().optional(),
    tokenSource: z.string().optional(),
    apiKeySource: z.string().optional(),
    apiProvider: z.string().optional(),
  }),
  models: z
    .array(z.object({ value: z.string().min(1).max(512), displayName: z.string().max(240) }))
    .max(2000),
});
const frameSchema = z
  .object({
    type: z.string(),
    session_id: z.string().optional(),
    parent_tool_use_id: z.string().nullable().optional(),
  })
  .passthrough();
const questionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(1).max(4000),
        options: z
          .array(z.object({ label: z.string().max(1000) }))
          .max(20)
          .optional(),
      }),
    )
    .min(1)
    .max(10),
});

/** Claude's SDK owns tools, history and inference; this adapter only translates its protocol. */
export class ClaudeDriver {
  private query?: ClaudeQuery;
  private readonly abort = new AbortController();
  private readonly queue = new NativeEventQueue();
  private readonly requests = new Map<
    string,
    {
      request: LocalAgentRequest;
      answer: (response: LocalAgentRequestResponse['response'] | null) => void;
    }
  >();
  private releasePrompt?: () => void;
  private cancelled = false;
  private sessionId?: string;
  constructor(
    private readonly connection: LocalAgentConnection,
    private readonly cwd: string,
    private readonly factory: ClaudeQueryFactory = async (args) =>
      (await import('@anthropic-ai/claude-agent-sdk')).query(args),
  ) {}

  private async connect(input?: NativeAgentRunInput) {
    const launch = resolveNativeExecutable(this.connection.executablePath, 'claude');
    let release!: () => void;
    const start = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.releasePrompt = release;
    const signal = this.abort.signal;
    signal.addEventListener('abort', release, { once: true });
    const prompt = (async function* (): AsyncGenerator<SDKUserMessage> {
      await start;
      if (!signal.aborted && input)
        yield {
          type: 'user',
          message: { role: 'user', content: input.content },
          parent_tool_use_id: null,
          session_id: input.nativeSessionId ?? '',
        };
      // The SDK waits for run completion before closing bidirectional input.
    })();
    this.query = await this.factory({
      prompt,
      options: {
        cwd: this.cwd,
        pathToClaudeCodeExecutable: launch.sdkPath,
        abortController: this.abort,
        settingSources: ['user'],
        env: {
          ...process.env,
          ...launch.env,
          ...(this.connection.homePath ? { CLAUDE_CONFIG_DIR: this.connection.homePath } : {}),
          ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
          CLAUDE_CODE_AUTO_CONNECT_IDE: '0',
          // Claude Agent SDK serializes MCP server declarations into a child
          // process argument. Resolve the bearer at execution time instead of
          // putting the session credential into that process argument.
          ...(input?.mcp ? { MEMOFLOW_MCP_AUTHORIZATION: `Bearer ${input.mcp.token}` } : {}),
        },
        strictMcpConfig: true,
        mcpServers: input?.mcp
          ? {
              memoflow: {
                type: 'http',
                url: input.mcp.url,
                headers: { Authorization: '${MEMOFLOW_MCP_AUTHORIZATION}' },
              },
            }
          : {},
        // The SDK treats bare allowedTools rules as unconditional grants and
        // skips canUseTool. Gate our MCP tools before native allow rules instead.
        allowedTools: [],
        hooks: input?.mcp
          ? {
              PreToolUse: [
                {
                  hooks: [
                    async (event, _toolUseId, { signal: permissionSignal }) => {
                      if (
                        event.hook_event_name !== 'PreToolUse' ||
                        !event.tool_name.startsWith(memoFlowToolPrefix)
                      )
                        return {};
                      const name = event.tool_name.slice(memoFlowToolPrefix.length);
                      if (memoFlowReadTools.has(name))
                        return {
                          hookSpecificOutput: {
                            hookEventName: 'PreToolUse',
                            permissionDecision: 'allow',
                          },
                        };
                      if (!memoFlowWriteTools.has(name))
                        return {
                          hookSpecificOutput: {
                            hookEventName: 'PreToolUse',
                            permissionDecision: 'deny',
                            permissionDecisionReason: 'Unrecognized MemoFlow tool',
                          },
                        };
                      const args =
                        event.tool_input &&
                        typeof event.tool_input === 'object' &&
                        !Array.isArray(event.tool_input)
                          ? (event.tool_input as Record<string, unknown>)
                          : {};
                      const decision = await this.permission(
                        event.tool_name,
                        args,
                        permissionSignal,
                      );
                      return {
                        hookSpecificOutput: {
                          hookEventName: 'PreToolUse',
                          permissionDecision: decision.behavior === 'allow' ? 'allow' : 'deny',
                          permissionDecisionReason:
                            decision.behavior === 'allow'
                              ? 'MemoFlow approved this operation'
                              : 'MemoFlow did not approve this operation',
                        },
                      };
                    },
                  ],
                },
              ],
            }
          : {},
        permissionMode: 'default',
        persistSession: Boolean(input),
        includePartialMessages: true,
        ...(input
          ? {
              model: input.modelId,
              ...(input.nativeSessionId ? { resume: input.nativeSessionId } : {}),
            }
          : { settings: { disableAllHooks: true } }),
        canUseTool: (name, args, options) => this.permission(name, args, options.signal),
        stderr: () => {},
      },
    });
    if (signal.aborted) {
      this.query.close();
      throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const init = initialization.parse(
        await Promise.race([
          this.query.initializationResult(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              this.abort.abort();
              reject(new LocalAgentError('LOCAL_AGENT_UNAVAILABLE'));
            }, 25_000);
          }),
        ]),
      );
      const account = init.account;
      if (
        (!account.apiProvider || account.apiProvider === 'firstParty') &&
        !account.email &&
        (!account.tokenSource || account.tokenSource === 'none') &&
        (!account.apiKeySource || account.apiKeySource === 'none')
      )
        throw new LocalAgentError('LOCAL_AGENT_LOGIN_REQUIRED');
      return {
        models: init.models.map((model) => ({ id: model.value, name: model.displayName })),
        fingerprint: await nativeIdentity('claude', this.connection.homePath, account),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async probe(): Promise<LocalAgentStatus> {
    try {
      const init = await this.connect();
      return {
        status: 'ready',
        models: init.models,
        version: 'SDK 0.3.295 / native initialization catalog',
      };
    } catch (error) {
      const failure =
        error instanceof LocalAgentError
          ? error
          : nativeFailure(error instanceof Error ? error.message : undefined);
      return {
        status:
          failure.code === 'LOCAL_AGENT_LOGIN_REQUIRED'
            ? 'login_required'
            : failure.code === 'LOCAL_AGENT_NOT_INSTALLED'
              ? 'not_installed'
              : 'unavailable',
        message: failure.message,
      };
    } finally {
      await this.close();
    }
  }
  async *run(input: NativeAgentRunInput): AsyncGenerator<NativeAgentEvent> {
    const cancel = () => this.cancel();
    input.signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (input.signal?.aborted || this.cancelled) {
        yield { type: 'cancelled' };
        return;
      }
      if (input.nativeSessionId && input.accountFingerprint) {
        // SDK query options already initiate resume. Inspect identity in a
        // separate, prompt-free query before giving any process the old ID.
        const probe = new ClaudeDriver(this.connection, this.cwd, this.factory);
        const cancelProbe = () => probe.cancel();
        input.signal?.addEventListener('abort', cancelProbe, { once: true });
        try {
          const identity = await probe.connect();
          if (identity.fingerprint !== input.accountFingerprint)
            throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
        } finally {
          input.signal?.removeEventListener('abort', cancelProbe);
          await probe.close();
        }
        if (this.cancelled) {
          yield { type: 'cancelled' };
          return;
        }
      }
      const init = await this.connect(input);
      if (input.accountFingerprint && input.accountFingerprint !== init.fingerprint)
        throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
      if (!init.models.some((model) => model.id === input.modelId))
        throw new LocalAgentError('LOCAL_AGENT_MODEL_UNSUPPORTED');
      if (this.cancelled) {
        yield { type: 'cancelled' };
        return;
      }
      this.releasePrompt?.();
      void this.consume(input, init.fingerprint).catch((error) => {
        if (error instanceof z.ZodError)
          logger.warn('Native protocol shape rejected', {
            issues: error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
          });
        this.queue.fail(
          error instanceof LocalAgentError
            ? error
            : new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR'),
        );
      });
      yield* this.queue;
    } catch (error) {
      if (this.cancelled || input.signal?.aborted) yield { type: 'cancelled' };
      else
        throw error instanceof LocalAgentError
          ? error
          : nativeFailure(error instanceof Error ? error.message : undefined);
    } finally {
      input.signal?.removeEventListener('abort', cancel);
      await this.close();
    }
  }
  private async consume(input: NativeAgentRunInput, fingerprint: string) {
    let streamed = false;
    for await (const raw of this.query!) {
      if (this.cancelled) return;
      const frame = frameSchema.parse(raw);
      if (frame.session_id) {
        if (
          (input.nativeSessionId && frame.session_id !== input.nativeSessionId) ||
          (this.sessionId && this.sessionId !== frame.session_id)
        )
          throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
        if (!this.sessionId) {
          this.sessionId = frame.session_id;
          this.queue.push({
            type: 'session',
            nativeSessionId: frame.session_id,
            accountFingerprint: fingerprint,
          });
        }
      }
      if (frame.parent_tool_use_id) continue;
      if (frame.type === 'stream_event') {
        const kind = z.object({ type: z.string() }).parse(frame.event).type;
        // message_delta carries stop/usage fields, not a content-block delta.
        if (kind !== 'content_block_delta' && kind !== 'content_block_start') continue;
        const event = z
          .object({
            type: z.string(),
            delta: z
              .object({ type: z.string(), text: z.string().max(200_000).optional() })
              .optional(),
            content_block: z
              .object({
                type: z.string(),
                id: z.string().optional(),
                name: z.string().max(500).optional(),
              })
              .optional(),
          })
          .parse(frame.event);
        if (
          event.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta' &&
          event.delta.text
        ) {
          streamed = true;
          this.queue.push({ type: 'delta', content: event.delta.text });
        }
        if (
          event.type === 'content_block_start' &&
          event.content_block?.type === 'tool_use' &&
          event.content_block.id
        )
          this.queue.push({
            type: 'activity',
            toolCallId: event.content_block.id,
            label: event.content_block.name ?? 'Claude tool',
            state: 'running',
          });
      } else if (frame.type === 'assistant') {
        if (typeof frame.error === 'string') throw nativeFailure(frame.error);
        const message = z
          .object({
            content: z.array(
              z.object({ type: z.string(), text: z.string().max(200_000).optional() }),
            ),
          })
          .parse(frame.message);
        if (!streamed)
          for (const block of message.content)
            if (block.type === 'text' && block.text)
              this.queue.push({ type: 'delta', content: block.text });
        streamed = false;
      } else if (frame.type === 'user') {
        const message = z.object({ content: z.unknown() }).parse(frame.message);
        const blocks = z
          .array(
            z.object({
              type: z.string(),
              tool_use_id: z.string().optional(),
              is_error: z.boolean().optional(),
            }),
          )
          .safeParse(message.content);
        if (blocks.success)
          for (const block of blocks.data)
            if (block.type === 'tool_result' && block.tool_use_id)
              this.queue.push({
                type: 'activity',
                toolCallId: block.tool_use_id,
                label: 'Claude tool',
                state: block.is_error ? 'failed' : 'completed',
              });
      } else if (frame.type === 'result') {
        if (frame.subtype !== 'success' || frame.is_error === true)
          throw nativeFailure(
            Array.isArray(frame.errors)
              ? frame.errors.filter((value) => typeof value === 'string').join('\n')
              : frame.subtype,
          );
        if (!this.sessionId) throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
        this.queue.push({ type: 'completed' });
        return;
      }
    }
    if (!this.cancelled) throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
  }
  private async permission(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<PermissionResult> {
    if (this.cancelled || signal.aborted || this.requests.size >= 16)
      return { behavior: 'deny', message: 'Request unavailable' };
    const requestId = randomUUID();
    let request: LocalAgentRequest;
    if (name === 'AskUserQuestion') {
      const parsed = questionsSchema.safeParse(args);
      if (!parsed.success) return { behavior: 'deny', message: 'Unsupported question' };
      request = {
        type: 'user_input',
        requestId,
        questions: parsed.data.questions.map((question, index) => ({
          id: String(index),
          prompt: question.question,
          options: question.options?.map((option) => option.label) ?? [],
        })),
      };
    } else
      request = {
        type: 'permission',
        requestId,
        title: `${name}: ${JSON.stringify(args)}`.slice(0, 500),
      };
    let listener!: () => void;
    const response = await new Promise<LocalAgentRequestResponse['response'] | null>((resolve) => {
      listener = () => resolve(null);
      signal.addEventListener('abort', listener, { once: true });
      this.requests.set(requestId, { request, answer: resolve });
      this.queue.push({ type: 'request', request });
    });
    signal.removeEventListener('abort', listener);
    this.requests.delete(requestId);
    this.queue.push({
      type: 'request_resolved',
      requestId,
      resolution: response && !this.cancelled ? 'answered' : 'cancelled',
    });
    if (!response || this.cancelled) return { behavior: 'deny', message: 'Request cancelled' };
    if (response.type === 'permission')
      return response.decision === 'approve_once'
        ? { behavior: 'allow', updatedInput: args }
        : { behavior: 'deny', message: 'User declined' };
    if (request.type !== 'user_input') return { behavior: 'deny', message: 'Invalid response' };
    return {
      behavior: 'allow',
      updatedInput: {
        ...args,
        answers: Object.fromEntries(
          request.questions.map((question) => [
            question.prompt,
            response.answers
              .find((answer) => answer.questionId === question.id)
              ?.values.join(', ') ?? '',
          ]),
        ),
      },
    };
  }
  respond(id: string, response: LocalAgentRequestResponse['response']): boolean {
    const pending = this.requests.get(id);
    if (!pending || this.cancelled || pending.request.type !== response.type) return false;
    if (
      response.type === 'user_input' &&
      pending.request.type === 'user_input' &&
      (response.answers.length !== pending.request.questions.length ||
        new Set(response.answers.map((answer) => answer.questionId)).size !==
          response.answers.length ||
        response.answers.some(
          (answer) =>
            pending.request.type !== 'user_input' ||
            !pending.request.questions.some((question) => question.id === answer.questionId),
        ))
    )
      return false;
    this.requests.delete(id);
    pending.answer(response);
    return true;
  }
  cancel() {
    this.cancelled = true;
    for (const pending of this.requests.values()) pending.answer(null);
    this.requests.clear();
    this.queue.push({ type: 'cancelled' });
    void this.query?.interrupt().catch(() => undefined);
    this.abort.abort();
    this.query?.close();
  }
  async close() {
    for (const pending of this.requests.values()) pending.answer(null);
    this.requests.clear();
    this.abort.abort();
    this.releasePrompt?.();
    this.query?.close();
  }
}
