import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';
import type { LocalAgentToolBridgePort, LocalAgentToolGrant } from './local-agent-runtime';
import { LocalAgentError } from '../../shared/local-agent-error';

type GrantInput = Parameters<LocalAgentToolBridgePort['open']>[0];
export interface LocalToolContext extends ExecutionContext {
  readonly connectionId: string;
  readonly conversationId: string;
  readonly runId: string;
  readonly signal: AbortSignal;
  readonly deadlineAt: number;
  readonly writeScopes: readonly string[];
  authorize(scope: string, tx?: IElectronDatabaseTransaction): Promise<void>;
  track<T>(work: () => Promise<T>): Promise<T>;
}
interface Grant {
  input: GrantInput;
  revision: number;
  writeScopes: readonly string[];
  expiresAt: number;
  controller: AbortController;
}
interface Options {
  store: LocalAgentRepository;
  isActive: () => boolean;
  registerTools(server: McpServer, context: LocalToolContext): void;
}
/** A loopback transport for native session tools, owned by the existing Profile lifecycle. */
export class LocalAgentToolBridge implements LocalAgentToolBridgePort {
  private readonly grants = new Map<string, Grant>();
  private server?: Server;
  private listening?: Promise<string>;
  private stopped = false;
  private pending = 0;
  private readonly inFlight = new Set<Promise<unknown>>();
  constructor(private readonly options: Options) {}
  private track<T>(work: () => Promise<T>): Promise<T> {
    if (this.stopped) return Promise.reject(new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED'));
    const task = work();
    this.inFlight.add(task);
    return task.finally(() => this.inFlight.delete(task));
  }
  private live(token: string, grant: Grant) {
    return (
      !this.stopped &&
      this.options.isActive() &&
      this.grants.get(token) === grant &&
      !grant.controller.signal.aborted &&
      Date.now() < grant.expiresAt
    );
  }
  private listen(): Promise<string> {
    this.listening ??= new Promise((resolve, reject) => {
      const server = createServer(
        {
          maxHeaderSize: 8192,
          requestTimeout: 30_000,
          headersTimeout: 5000,
          keepAliveTimeout: 1000,
        },
        (req, res) => {
          const rejectRequest = (status: number) => {
            res.writeHead(status, { 'cache-control': 'no-store' });
            res.end();
          };
          const address = server.address();
          if (
            !address ||
            typeof address === 'string' ||
            req.headers.host !== `127.0.0.1:${address.port}` ||
            req.headers.origin
          ) {
            rejectRequest(403);
            return;
          }
          if (req.url !== '/mcp' || req.method !== 'POST') {
            rejectRequest(405);
            return;
          }
          const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
          const grant = token ? this.grants.get(token) : undefined;
          if (!token || !grant || !this.live(token, grant)) {
            rejectRequest(401);
            return;
          }
          if (this.pending >= 8) {
            rejectRequest(429);
            return;
          }
          this.pending++;
          const requestController = new AbortController();
          const signal = AbortSignal.any([grant.controller.signal, requestController.signal]);
          const deadlineAt = Date.now() + 30_000;
          const timer = setTimeout(() => {
            requestController.abort();
            res.destroy();
          }, 30_000);
          const onClose = () => requestController.abort();
          res.once('close', onClose);
          const authorize = async (scope: string, tx?: IElectronDatabaseTransaction) => {
            if (!this.live(token, grant) || signal.aborted)
              throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
            const current = await this.track(() => this.options.store.getConnection(
              grant.input.identityId,
              grant.input.connectionId,
              tx,
            ));
            if (
              !this.live(token, grant) ||
              signal.aborted ||
              !current.enabled ||
              current.revision !== grant.revision ||
              (scope.endsWith(':write') && !current.writeScopes.some((value) => value === scope))
            )
              throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
          };
          const handler = createMcpHandler(
            () => {
              const mcp = new McpServer({ name: 'memoflow-local', version: '1' });
              const requestId = randomUUID();
              this.options.registerTools(mcp, {
                ...grant.input,
                writeScopes: grant.writeScopes,
                requestId,
                traceId: requestId,
                source: 'http',
                startedAt: Date.now(),
                deadlineAt,
                signal,
                authorize,
                track: <T>(work: () => Promise<T>) => this.track(work),
              });
              return mcp;
            },
            { legacy: 'stateless' },
          );
          const nodeHandler = toNodeHandler(
            {
              async fetch(request) {
                try {
                  await authorize('read');
                } catch {
                  return new Response('Forbidden', { status: 403 });
                }
                return handler.fetch(new Request(request, { signal }));
              },
            },
            { maxRequestBodySize: 256 * 1024 },
          );
          const handling = nodeHandler(req, res)
            .catch(() => {
              if (!res.headersSent) rejectRequest(500);
              else res.destroy();
            })
            .finally(() => {
              clearTimeout(timer);
              res.off('close', onClose);
              this.pending--;
              this.inFlight.delete(handling);
            });
          this.inFlight.add(handling);
        },
      );
      this.server = server;
      server.maxConnections = 16;
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (this.stopped || !address || typeof address === 'string') {
          server.close();
          reject(new LocalAgentError('LOCAL_AGENT_UNAVAILABLE'));
          return;
        }
        resolve(`http://127.0.0.1:${address.port}/mcp`);
      });
    });
    return this.listening;
  }
  async open(input: GrantInput): Promise<LocalAgentToolGrant> {
    if (this.stopped || !this.options.isActive())
      throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
    if (this.grants.size >= 4) throw new LocalAgentError('CONFLICT');
    const lookup = this.options.store.getConnection(input.identityId, input.connectionId);
    this.inFlight.add(lookup);
    const connection = await lookup.finally(() => this.inFlight.delete(lookup));
    if (this.stopped || !this.options.isActive())
      throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
    if (!connection.enabled) throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
    const url = await this.listen();
    if (this.stopped || !this.options.isActive())
      throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
    // Awaiting startup/connection lookup admits concurrent contenders. Enforce
    // capacity again at the synchronous grant insertion boundary.
    if (this.grants.size >= 4) throw new LocalAgentError('CONFLICT');
    const token = randomBytes(32).toString('base64url');
    const grant: Grant = {
      input,
      revision: connection.revision,
      writeScopes: [...connection.writeScopes],
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
      controller: new AbortController(),
    };
    this.grants.set(token, grant);
    return {
      url,
      token,
      revoke: () => {
        grant.controller.abort();
        this.grants.delete(token);
      },
    };
  }
  async dispose(): Promise<void> {
    this.stopped = true;
    for (const grant of this.grants.values()) grant.controller.abort();
    this.grants.clear();
    await this.listening?.catch(() => undefined);
    if (this.server) {
      this.server.closeAllConnections();
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    }
    await Promise.allSettled([...this.inFlight]);
  }
}
