import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  LocalAgentConnection,
  LocalAgentRequest,
  LocalAgentRequestResponse,
  LocalAgentStatus,
  LocalAgentModel,
  LocalAgentModelOptions,
  LocalAgentAccountSummary,
} from '@memoflow/ai-contracts';
import {
  LocalAgentModelOptionValueSchema,
  LocalAgentAccountSummarySchema,
} from '@memoflow/ai-contracts';
import {
  NativeRpcTransport,
  type NativeProcessOptions,
  type NativeServerRequest,
} from './native-rpc-transport';
import { LocalAgentError } from '../../shared/local-agent-error';
import { nativeIdentity, nativeModelVisibilityContext } from './native-identity';
import { nativeFailure } from './native-failure';

export type NativeAgentEvent =
  | { type: 'session'; nativeSessionId: string; accountFingerprint: string }
  | { type: 'delta'; content: string }
  | {
      type: 'activity';
      toolCallId: string;
      label: string;
      state: 'running' | 'completed' | 'failed' | 'denied';
    }
  | { type: 'request'; request: LocalAgentRequest }
  | { type: 'request_resolved'; requestId: string; resolution: 'answered' | 'cancelled' }
  | { type: 'completed' }
  | { type: 'cancelled' };
export interface NativeAgentRunInput {
  nativeSessionId?: string | null;
  accountFingerprint?: string | null;
  modelId: string;
  modelOptions?: LocalAgentModelOptions;
  content: string;
  mcp?: { url: string; token: string; toolNames?: readonly string[] };
  signal?: AbortSignal;
}
type NativeResponse = LocalAgentRequestResponse['response'];
const accountSchema = z.object({
  account: z
    .object({ type: z.string(), email: z.string().nullish(), planType: z.string().nullish() })
    .nullable(),
  requiresOpenaiAuth: z.boolean(),
});
/** Handshake metadata is untrusted; expose only a recognized Codex CLI version. */
function codexVersion(handshake: unknown): string | undefined {
  const parsed = z.object({ userAgent: z.string().max(240).optional() }).safeParse(handshake);
  if (!parsed.success) return undefined;
  return parsed.data.userAgent?.match(
    /\bcodex(?:[-_](?:cli|app[-_]?server))?[\/ ]v?(\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?)/iu,
  )?.[1];
}
const optionValue = LocalAgentModelOptionValueSchema;
const catalogSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        model: z.string(),
        displayName: z.string(),
        supportedReasoningEfforts: z
          .array(z.object({ reasoningEffort: z.string() }))
          .max(20)
          .optional(),
        defaultReasoningEffort: z.string().optional(),
        serviceTiers: z
          .array(z.object({ id: z.string(), name: z.string() }))
          .max(20)
          .optional(),
        additionalSpeedTiers: z.array(z.string()).max(20).optional(),
        defaultServiceTier: z.string().nullable().optional(),
      }),
    )
    .max(200),
  nextCursor: z.string().nullable().optional(),
});
function validOption(value: string): boolean {
  return optionValue.safeParse(value).success;
}
const threadSchema = z.object({ thread: z.object({ id: z.string().min(1) }) });
const turnSchema = z.object({ turn: z.object({ id: z.string().min(1) }) });
const scopedSchema = z.object({ threadId: z.string(), turnId: z.string() });

/** Native Codex execution only. MemoFlow does not reconstruct or rerun native tool calls. */
const TOOL_IDENTIFIER = /^[a-z][a-z0-9]*(?:[_.:-][a-z0-9]+)*$/u;

function safeToolIdentifier(name: string | undefined): string | undefined {
  return name && name.length <= 64 && TOOL_IDENTIFIER.test(name) ? name : undefined;
}

export class CodexDriver {
  private transport?: NativeRpcTransport;
  private version?: string;
  private account?: LocalAgentAccountSummary;
  private threadId?: string;
  private turnId?: string;
  private cancelled = false;
  private cancelTimer?: ReturnType<typeof setTimeout>;
  private readonly requests = new Map<
    string,
    { wireId: string | number; request: LocalAgentRequest; answered?: boolean }
  >();

  constructor(
    private readonly connection: LocalAgentConnection,
    private readonly cwd: string,
    private readonly makeTransport = (options: NativeProcessOptions) =>
      new NativeRpcTransport(options),
  ) {}

  private async connect() {
    const transport = this.makeTransport({
      executable: this.connection.executablePath,
      args: ['app-server', '--listen', 'stdio://'],
      cwd: this.cwd,
      env: {
        ...process.env,
        ...(this.connection.homePath ? { CODEX_HOME: this.connection.homePath } : {}),
      },
    });
    this.transport = transport;
    this.account = undefined;
    this.version = codexVersion(
      await transport.request('initialize', {
        clientInfo: { name: 'memoflow', title: 'MemoFlow', version: '1' },
        capabilities: { experimentalApi: true },
      }),
    );
    transport.notify('initialized');
    const account = accountSchema.parse(
      await transport.request('account/read', { refreshToken: false }),
    );
    if (account.requiresOpenaiAuth && !account.account)
      throw new LocalAgentError('LOCAL_AGENT_LOGIN_REQUIRED');
    if (account.account) {
      const { type, email, planType } = account.account;
      const safeType: LocalAgentAccountSummary['type'] =
        type === 'chatgpt' ? 'chatgpt' : type === 'apiKey' ? 'api_key' : 'other';
      const summary: LocalAgentAccountSummary = { type: safeType };
      const verifiedEmail = LocalAgentAccountSummarySchema.shape.email.safeParse(email);
      if (verifiedEmail.success && verifiedEmail.data) summary.email = verifiedEmail.data;
      const verifiedPlan = LocalAgentAccountSummarySchema.shape.planType.safeParse(
        planType?.toLowerCase(),
      );
      if (safeType === 'chatgpt' && verifiedPlan.success && verifiedPlan.data)
        summary.planType = verifiedPlan.data;
      this.account = summary;
    }
    // Display-only plan metadata must not change an existing session identity fingerprint.
    return nativeIdentity(
      'codex',
      this.connection.homePath,
      account.account
        ? {
            type: account.account.type,
            ...(account.account.email ? { email: account.account.email } : {}),
          }
        : null,
    );
  }

  async probe(): Promise<LocalAgentStatus> {
    try {
      const fingerprint = await this.connect();
      const models: LocalAgentModel[] = [];
      let cursor: string | undefined;
      const cursors = new Set<string>();
      do {
        const result = catalogSchema.parse(
          await this.transport!.request('model/list', {
            limit: 100,
            includeHidden: false,
            ...(cursor ? { cursor } : {}),
          }),
        );
        models.push(
          ...result.data.map((model) => {
            const reasoningEfforts = [
              ...new Set(
                (model.supportedReasoningEfforts ?? [])
                  .map((option) => option.reasoningEffort)
                  .filter(validOption),
              ),
            ];
            const serviceTiers = (
              model.serviceTiers ??
              (model.additionalSpeedTiers ?? []).map((id) => ({ id, name: id }))
            ).filter((tier) => validOption(tier.id) && tier.name.length <= 100);
            return {
              id: model.model,
              name: model.displayName,
              ...(reasoningEfforts.length ? { reasoningEfforts } : {}),
              ...(model.defaultReasoningEffort &&
              reasoningEfforts.includes(model.defaultReasoningEffort)
                ? { defaultReasoningEffort: model.defaultReasoningEffort }
                : {}),
              ...(serviceTiers.length ? { serviceTiers } : {}),
              ...(model.defaultServiceTier &&
              serviceTiers.some((tier) => tier.id === model.defaultServiceTier)
                ? { defaultServiceTier: model.defaultServiceTier }
                : {}),
            };
          }),
        );
        cursor = result.nextCursor ?? undefined;
        if (models.length > 2000 || (cursor && cursors.has(cursor)))
          throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return {
        status: 'ready',
        models,
        ...(this.account?.type === 'chatgpt' && this.account.email
          ? { modelVisibilityContext: nativeModelVisibilityContext(this.connection, fingerprint) }
          : {}),
        ...(this.version ? { version: this.version } : {}),
        ...(this.account ? { account: this.account } : {}),
      };
    } catch (error) {
      const code = error instanceof LocalAgentError ? error.code : 'LOCAL_AGENT_PROTOCOL_ERROR';
      return {
        status:
          code === 'LOCAL_AGENT_NOT_INSTALLED'
            ? 'not_installed'
            : code === 'LOCAL_AGENT_LOGIN_REQUIRED'
              ? 'login_required'
              : 'unavailable',
        message: new LocalAgentError(code).message,
      };
    } finally {
      await this.close();
    }
  }

  async *run(input: NativeAgentRunInput): AsyncGenerator<NativeAgentEvent> {
    const events: NativeAgentEvent[] = [];
    let wake: (() => void) | undefined;
    let failure: LocalAgentError | undefined;
    let terminal = false;
    const fail = (error: LocalAgentError) => {
      failure ??= error;
      wake?.();
    };
    const emit = (event: NativeAgentEvent) => {
      if (terminal || failure) return;
      if (events.length >= 256) {
        fail(new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR'));
        return;
      }
      if (event.type === 'completed' || event.type === 'cancelled') terminal = true;
      events.push(event);
      wake?.();
    };
    const abort = () => this.cancel();
    input.signal?.addEventListener('abort', abort, { once: true });
    try {
      if (input.signal?.aborted) {
        yield { type: 'cancelled' };
        return;
      }
      const accountFingerprint = await this.connect();
      if (input.accountFingerprint && input.accountFingerprint !== accountFingerprint)
        throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
      const transport = this.transport!;
      transport.onFailure = fail;
      const config = input.mcp
        ? {
            mcp_servers: {
              memoflow: {
                url: input.mcp.url,
                http_headers: { Authorization: `Bearer ${input.mcp.token}` },
              },
            },
          }
        : {};
      const response = threadSchema.parse(
        await transport.request(input.nativeSessionId ? 'thread/resume' : 'thread/start', {
          ...(input.nativeSessionId ? { threadId: input.nativeSessionId } : {}),
          model: input.modelId,
          cwd: this.cwd,
          config,
        }),
      );
      if (input.nativeSessionId && input.nativeSessionId !== response.thread.id)
        throw new LocalAgentError('LOCAL_AGENT_SESSION_UNAVAILABLE');
      this.threadId = response.thread.id;
      yield { type: 'session', nativeSessionId: this.threadId, accountFingerprint };
      if (this.cancelled) {
        yield { type: 'cancelled' };
        return;
      }
      transport.onRequest = (request) => this.handleRequest(request, emit);
      transport.onNotification = (method, params) => {
        try {
          this.notification(method, params, emit);
        } catch (error) {
          fail(
            error instanceof LocalAgentError
              ? error
              : new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR'),
          );
        }
      };
      const turn = turnSchema.parse(
        await transport.request('turn/start', {
          threadId: this.threadId,
          model: input.modelId,
          ...(input.modelOptions?.reasoningEffort
            ? { effort: input.modelOptions.reasoningEffort }
            : {}),
          ...(input.modelOptions?.serviceTier
            ? { serviceTierForTurn: input.modelOptions.serviceTier }
            : {}),
          input: [{ type: 'text', text: input.content }],
        }),
      );
      if (this.turnId && turn.turn.id !== this.turnId)
        throw new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
      this.turnId = turn.turn.id;
      while (true) {
        if (failure) throw failure;
        const event = events.shift();
        if (event) {
          yield event;
          if (event.type === 'completed' || event.type === 'cancelled') return;
        } else
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
      }
    } catch (error) {
      if (this.cancelled || input.signal?.aborted) yield { type: 'cancelled' };
      else
        throw error instanceof LocalAgentError
          ? error
          : new LocalAgentError('LOCAL_AGENT_PROTOCOL_ERROR');
    } finally {
      input.signal?.removeEventListener('abort', abort);
      this.requests.clear();
      if (this.transport) {
        this.transport.onFailure = undefined;
        this.transport.onNotification = undefined;
        this.transport.onRequest = undefined;
      }
      await this.close();
    }
  }

  private notification(method: string, params: unknown, emit: (event: NativeAgentEvent) => void) {
    if (method === 'turn/started' || method === 'turn/completed') {
      const value = z
        .object({
          threadId: z.string(),
          turn: z.object({
            id: z.string(),
            status: z.string().optional(),
            error: z.object({ message: z.string() }).nullable().optional(),
          }),
        })
        .parse(params);
      if (value.threadId !== this.threadId) return;
      if (method === 'turn/started') {
        if (this.turnId && this.turnId !== value.turn.id) return;
        this.turnId = value.turn.id;
        return;
      }
      if (this.turnId && this.turnId !== value.turn.id) return;
      if (value.turn.status === 'completed') emit({ type: 'completed' });
      else if (value.turn.status === 'interrupted') emit({ type: 'cancelled' });
      else if (value.turn.status === 'failed' && value.turn.error?.message)
        throw nativeFailure(value.turn.error.message);
      else throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    } else if (method === 'item/agentMessage/delta') {
      const value = scopedSchema.extend({ delta: z.string().max(200_000) }).parse(params);
      if (value.threadId === this.threadId && (!this.turnId || value.turnId === this.turnId))
        emit({ type: 'delta', content: value.delta });
    } else if (method === 'item/started' || method === 'item/completed') {
      const value = scopedSchema
        .extend({
          item: z.object({
            id: z.string(),
            type: z.string(),
            status: z.string().optional(),
            tool: z.string().optional(),
          }),
        })
        .parse(params);
      if (value.threadId !== this.threadId || (this.turnId && value.turnId !== this.turnId)) return;
      if (['agentMessage', 'userMessage', 'reasoning'].includes(value.item.type)) return;
      emit({
        type: 'activity',
        toolCallId: value.item.id,
        // MCP and dynamic tool items carry a bare tool name; show it instead of the item kind.
        label: safeToolIdentifier(value.item.tool) ?? value.item.type,
        state:
          method === 'item/started'
            ? 'running'
            : value.item.status === 'failed'
              ? 'failed'
              : value.item.status === 'declined'
                ? 'denied'
                : 'completed',
      });
    } else if (method === 'serverRequest/resolved') {
      const value = z
        .object({ threadId: z.string(), requestId: z.union([z.string(), z.number()]) })
        .parse(params);
      if (value.threadId !== this.threadId) return;
      for (const [id, pending] of this.requests)
        if (pending.wireId === value.requestId) {
          this.requests.delete(id);
          emit({
            type: 'request_resolved',
            requestId: id,
            resolution: pending.answered ? 'answered' : 'cancelled',
          });
        }
    }
  }

  private handleRequest(wire: NativeServerRequest, emit: (event: NativeAgentEvent) => void) {
    const scope = scopedSchema.safeParse(wire.params);
    if (
      !scope.success ||
      scope.data.threadId !== this.threadId ||
      scope.data.turnId !== this.turnId ||
      this.requests.size >= 16 ||
      this.cancelled
    ) {
      this.transport?.rejectRequest(wire.id);
      return;
    }
    const requestId = randomUUID();
    let request: LocalAgentRequest;
    if (
      wire.method === 'item/commandExecution/requestApproval' ||
      wire.method === 'item/fileChange/requestApproval'
    ) {
      const value = z
        .object({
          command: z.string().max(500).nullish(),
          reason: z.string().max(500).nullish(),
          grantRoot: z.string().max(500).nullish(),
        })
        .safeParse(wire.params);
      if (!value.success) {
        this.transport?.rejectRequest(wire.id);
        return;
      }
      request = {
        type: 'permission',
        requestId,
        title:
          value.data.command ??
          value.data.reason ??
          value.data.grantRoot ??
          'Allow this native Agent operation once?',
        ...(value.data.command && value.data.reason ? { reason: value.data.reason } : {}),
        ...(value.data.grantRoot ? { scope: value.data.grantRoot } : {}),
      };
    } else if (wire.method === 'item/tool/requestUserInput') {
      const value = z
        .object({
          questions: z
            .array(
              z.object({
                id: z.string(),
                question: z.string().max(4000),
                options: z
                  .array(z.object({ label: z.string().max(1000) }))
                  .nullable()
                  .optional(),
              }),
            )
            .min(1)
            .max(10),
        })
        .safeParse(wire.params);
      if (!value.success) {
        this.transport?.rejectRequest(wire.id);
        return;
      }
      request = {
        type: 'user_input',
        requestId,
        questions: value.data.questions.map((question) => ({
          id: question.id,
          prompt: question.question,
          options: question.options?.map((option) => option.label) ?? [],
        })),
      };
    } else {
      this.transport?.rejectRequest(wire.id);
      return;
    }
    this.requests.set(requestId, { wireId: wire.id, request });
    emit({ type: 'request', request });
  }

  respond(requestId: string, response: NativeResponse): boolean {
    const pending = this.requests.get(requestId);
    if (!pending || pending.answered || pending.request.type !== response.type || this.cancelled)
      return false;
    if (response.type === 'permission')
      this.transport?.respond(pending.wireId, {
        decision: response.decision === 'approve_once' ? 'accept' : 'decline',
      });
    else {
      if (
        pending.request.type !== 'user_input' ||
        response.answers.length !== pending.request.questions.length ||
        new Set(response.answers.map((answer) => answer.questionId)).size !==
          response.answers.length ||
        response.answers.some(
          (answer) =>
            pending.request.type !== 'user_input' ||
            !pending.request.questions.some((question) => question.id === answer.questionId),
        )
      )
        return false;
      this.transport?.respond(pending.wireId, {
        answers: Object.fromEntries(
          response.answers.map((answer) => [answer.questionId, { answers: answer.values }]),
        ),
      });
    }
    pending.answered = true;
    return true;
  }
  cancel(): void {
    this.cancelled = true;
    if (this.threadId && this.turnId) {
      void this.transport
        ?.request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId })
        .catch(() => undefined);
      this.cancelTimer ??= setTimeout(() => {
        void this.close();
      }, 1000);
    } else void this.close();
  }
  async close(): Promise<void> {
    if (this.cancelTimer) clearTimeout(this.cancelTimer);
    await this.transport?.close();
  }
}
