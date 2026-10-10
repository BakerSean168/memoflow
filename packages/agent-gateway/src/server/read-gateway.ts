import { registerReadTools } from './register-read-tools';
import { readToolDescriptors, type GatewayReadToolName } from '../read-tool-descriptors';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
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
  readonly resourceMetadataUrl?: string;
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
class ControlledError extends GatewayReadError {}
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
              ...(options.resourceMetadataUrl && (status === 401 || code === 'INSUFFICIENT_SCOPE')
                ? {
                    'WWW-Authenticate': `Bearer resource_metadata="${options.resourceMetadataUrl}"${code === 'INSUFFICIENT_SCOPE' ? ', error="insufficient_scope", scope="' + (tool !== 'transport' && isReadToolName(tool) ? readToolDescriptors[tool].requiredScope : 'goals:read tasks:read') + '"' : ''}`,
                  }
                : {}),
              ...(status === 429 ? { 'Retry-After': '60' } : {}),
            },
          },
        );
      };
      function diagnose(cause: unknown) {
        try {
          options.diagnose?.({
            requestId: requestContext.requestId,
            traceId: requestContext.traceId,
            cause,
          });
        } catch {
          /* Observer failure does not alter a safe public response. */
        }
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
            () =>
              options.credentials.consumeReadQuota(
                principal.credentialId,
                principal.credentialType,
              ),
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
            registerReadTools(server, options, context, budget, principal.scopes, call);

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
