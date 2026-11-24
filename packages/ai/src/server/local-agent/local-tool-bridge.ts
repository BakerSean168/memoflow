import {
  LocalMcpClientCreateSchema,
  PermissionCommandSchema,
  type LocalGatewayAuditRecord,
  type LocalMcpClient,
  type LocalMcpClientCreate,
  type LocalMcpClientCredential,
  type LocalMcpEndpoint,
  type PermissionCommand,
  type PermissionSnapshot,
  type PermissionPreset,
  type PermissionRule,
  type PermissionSettings,
} from '@memoflow/ai-contracts';
import { writeToolDescriptors } from '@memoflow/agent-gateway';
import { getPermissionOperation } from '../permissions/operation-catalog';
import { PERMISSION_PRESETS } from '../permissions/permission-policy';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { MEMOFLOW_WORKFLOW_INSTRUCTIONS } from '@memoflow/agent-gateway';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import type { IElectronDatabaseTransaction } from '@memoflow/desktop-contracts';
import type { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';
import type {
  LocalMcpClientRepository,
  McpClientCredentialRef,
} from '../infrastructure/adapters/powersync/local-mcp-client.repository';
import type { LocalAgentToolBridgePort, LocalAgentToolGrant } from './local-agent-runtime';
import type { LocalGatewayAuditRepository } from '../infrastructure/adapters/powersync/local-gateway-audit.repository';
import { LocalAgentError } from '../../shared/local-agent-error';
import type { PermissionRepository } from '../permissions/permission.repository';
import { executeAuthorized, PermissionDeniedError } from '../permissions/authorize';
import { migrateLegacyPermissions } from '../permissions/permission-migration';
import { withAllowedBusinessAccess } from '../permissions/permission-grants';

const LocalMcpBindingSchema = z
  .object({
    version: z.literal(1),
    port: z.number().int().min(1).max(65535),
  })
  .strict();

async function writePrivateJson(target: string, value: unknown): Promise<void> {
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    await chmod(temp, 0o600);
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true }).catch(() => undefined);
  }
}

type GrantInput = Parameters<LocalAgentToolBridgePort['open']>[0];
function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
/** Business write scope that covers an operation; undefined for reads and owners we do not expose. */
function writeScopeForOperation(
  operationId: string,
): 'goals:write' | 'tasks:write' | 'routines:write' | 'notifications:write' | undefined {
  const operation = getPermissionOperation(operationId);
  if (!operation || operation.action === 'read') return undefined;
  if (operation.object === 'goal' || operation.object === 'key_result') return 'goals:write';
  if (operation.object === 'task') return 'tasks:write';
  if (operation.object === 'routine') return 'routines:write';
  if (operation.object === 'notification') return 'notifications:write';
  return undefined;
}
/** Tools that mutate business state or the visible Goal panel; everything else is a read. */
const LOCAL_WRITE_TOOLS: ReadonlySet<string> = new Set([
  ...Object.keys(writeToolDescriptors),
  'goal_plan_apply',
  'goal_panel_present',
  'goal_panel_open',
  'goal_panel_patch',
  'goal_panel_add_key_result',
  'goal_panel_remove_key_result',
  'goal_panel_focus',
  'goal_panel_submit',
  'goal_panel_release',
]);
function outcomeOf(result: unknown): string {
  if (typeof result !== 'object' || result === null || !('isError' in result)) return 'ok';
  if (!result.isError) return 'ok';
  const content = 'content' in result ? result.content : undefined;
  if (Array.isArray(content)) {
    const text = content.find(
      (entry): entry is { type: 'text'; text: string } =>
        typeof entry === 'object' &&
        entry !== null &&
        'type' in entry &&
        entry.type === 'text' &&
        'text' in entry &&
        typeof entry.text === 'string',
    )?.text;
    if (text) return text.slice(0, 120);
  }
  return 'ERROR';
}
function outcomeOfError(error: unknown): string {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string')
    return error.code.slice(0, 120);
  return 'ERROR';
}
function scopeDenied(outcome: string): boolean {
  return /(?:PERMISSION_DENIED|FORBIDDEN|INSUFFICIENT_SCOPE)/u.test(outcome);
}
export interface LocalToolContext extends ExecutionContext {
  readonly connectionId: string;
  readonly conversationId: string;
  readonly runId: string;
  /** `run` for built-in Agent runs, `client` for persistent external MCP clients. */
  readonly origin: 'run' | 'client';
  /** The user message that opened this run; Goal commits re-check it for unresolved ambiguity. */
  readonly goalIntent?: string;
  readonly signal: AbortSignal;
  /** Stable for the grant; request signal above is recreated for every HTTP call. */
  readonly grantSignal: AbortSignal;
  readonly deadlineAt: number;
  readonly writeScopes: readonly string[];
  executeAuthorized<T>(operationId: string, toolName: string, work: () => Promise<T>): Promise<T>;
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
  permissions: PermissionRepository;
  isActive: () => boolean;
  registerTools(server: McpServer, context: LocalToolContext): void | Promise<void>;
  approvalTimeoutMs?: number;
  onRevokeGrant?(input: GrantInput): void;
  /** Persistent external MCP clients. Absent means the external surface is unavailable. */
  clients?: LocalMcpClientRepository;
  /** Append-only local audit sink; absent means tool calls are not audited. */
  audit?: LocalGatewayAuditRepository;
  /** Live discovery file; a sibling host.json preserves this Profile's local port. */
  discoveryPath?: string;
  /** Loopback by default; the reachability decision (WSL/cross-host) is separate. */
  bindHost?: string;
}
/** A loopback transport for native session tools, owned by the existing Profile lifecycle. */
export class LocalAgentToolBridge implements LocalAgentToolBridgePort {
  private readonly conversations = new Map<
    string,
    { preset?: PermissionPreset; rules: PermissionRule[] }
  >();
  private conversation(owner: string, id: string) {
    const key = JSON.stringify([owner, id]);
    let state = this.conversations.get(key);
    if (!state) {
      state = { rules: [] };
      this.conversations.set(key, state);
    }
    return state;
  }
  private async saveBusinessSettings(owner: string, settings: PermissionSettings): Promise<void> {
    const repository = this.options.permissions;
    const previous = await repository.getSettings(owner);
    // Matrix denials are explicit user rules, so a raised session preset
    // cannot bypass them. Other matrix cells remain preset defaults.
    if (settings.preset === 'custom' && settings.customMatrix) {
      for (const [object, cells] of Object.entries(settings.customMatrix)) {
        if (object === 'ai_permission') continue;
        for (const [action, effect] of Object.entries(cells)) {
          const id = `matrix:${object}:${action}`;
          if (effect === 'deny')
            await repository.saveRule(owner, {
              id,
              agentId: null,
              object: object as PermissionRule['object'],
              action: action as PermissionRule['action'],
              effect: 'deny',
              source: 'user',
              createdAt: Date.now(),
            });
          else await repository.removeRule(owner, id);
        }
      }
    }
    if (settings.preset !== 'custom') {
      // A preset replaces the previous per-object matrix, including its persisted deny rules.
      for (const rule of await repository.listRules(owner)) {
        if (rule.id.startsWith('matrix:')) await repository.removeRule(owner, rule.id);
      }
    }
    await repository.saveSettings(owner, {
      ...settings,
      revision: (previous?.revision ?? 0) + 1,
    });
  }
  async permissions(owner: string, raw: PermissionCommand): Promise<PermissionSnapshot> {
    const command = PermissionCommandSchema.parse(raw);
    if (!this.options.isActive() || this.stopped)
      throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
    await this.migratePermissions(owner);
    const repository = this.options.permissions;
    if (command.action === 'settings') await this.saveBusinessSettings(owner, command.settings);
    if (command.action === 'revoke') {
      const rule = (await repository.listRules(owner)).find((rule) => rule.id === command.ruleId);
      await repository.removeRule(owner, command.ruleId);
      const settings = await repository.getSettings(owner);
      const objectOverrides = rule ? settings?.customMatrix?.[rule.object] : undefined;
      if (
        settings &&
        rule &&
        rule.id === `matrix:${rule.object}:${rule.action}` &&
        objectOverrides
      ) {
        objectOverrides[rule.action] = PERMISSION_PRESETS.confirm_each[rule.action];
        await repository.saveSettings(owner, { ...settings, revision: settings.revision + 1 });
      }
    }
    if (command.action === 'settings' || command.action === 'revoke') {
      // Old transport scopes have already been imported as business rules.
      // Explicit settings/revocation must also make formerly hidden tools
      // available; their execution still passes the unified checkpoint.
      for (const connection of await this.options.store.listConnections(owner)) {
        if (
          connection.writeScopes.includes('goals:write') &&
          connection.writeScopes.includes('tasks:write')
        )
          continue;
        await this.options.store.updateConnection(owner, connection.id, connection.revision, {
          driver: connection.driver,
          name: connection.name,
          executablePath: connection.executablePath,
          homePath: connection.homePath,
          enabled: connection.enabled,
          instanceSlug: connection.instanceSlug,
          accentColor: connection.accentColor,
          nativePermissionMode: connection.nativePermissionMode,
          writeScopes: ['goals:write', 'tasks:write'],
        });
      }
    }
    if (command.action === 'conversation') {
      if (command.preset === null)
        this.conversations.delete(JSON.stringify([owner, command.conversationId]));
      else this.conversation(owner, command.conversationId).preset = command.preset;
    }
    return {
      settings: (await repository.getSettings(owner)) ?? {
        preset: 'confirm_each',
        agentPresets: {},
        revision: 1,
      },
      rules: await repository.listRules(owner),
      audit: await repository.listAudit(owner, 100),
    };
  }
  private readonly grants = new Map<string, Grant>();
  private readonly clientTokens = new Map<string, McpClientCredentialRef>();
  private server?: Server;
  private endpointUrl?: string;
  private startup?: Promise<void>;
  private disposal?: Promise<void>;
  private ready = false;
  private discoveryPublished = false;
  private stopped = false;
  private pending = 0;
  private readonly inFlight = new Set<Promise<unknown>>();
  private readonly permissionMigrations = new Map<string, Promise<void>>();
  private readonly startedAt = Date.now();
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
  private migratePermissions(owner: string): Promise<void> {
    let migration = this.permissionMigrations.get(owner);
    if (!migration) {
      migration = (async () => {
        const connections = await this.options.store.listConnections(owner);
        const legacyConnections = connections.filter(
          (connection) => connection.createdAt < this.startedAt,
        );
        await migrateLegacyPermissions(
          this.options.permissions,
          owner,
          legacyConnections.map((connection) => ({
            agentId: connection.id,
            writeScopes: connection.writeScopes,
          })),
        );
      })().catch((error: unknown) => {
        this.permissionMigrations.delete(owner);
        throw error;
      });
      this.permissionMigrations.set(owner, migration);
    }
    return migration;
  }
  private get bindingPath(): string | undefined {
    return this.options.discoveryPath
      ? join(dirname(this.options.discoveryPath), 'host.json')
      : undefined;
  }
  private async readBindingPort(): Promise<number> {
    if (!this.bindingPath) return 0;
    try {
      return LocalMcpBindingSchema.parse(JSON.parse(await readFile(this.bindingPath, 'utf8'))).port;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 0;
      throw new LocalAgentError('LOCAL_MCP_BINDING_INVALID');
    }
  }
  private listen(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer(
        {
          maxHeaderSize: 8192,
          requestTimeout: 30_000,
          headersTimeout: 5000,
          keepAliveTimeout: 1000,
        },
        (req, res) => {
          void this.handle(req, res).catch(() => {
            if (!res.headersSent) res.writeHead(500, { 'cache-control': 'no-store' });
            res.end();
          });
        },
      );
      this.server = server;
      server.maxConnections = 16;
      server.once('error', (error: NodeJS.ErrnoException) => {
        reject(error.code === 'EADDRINUSE' ? new LocalAgentError('LOCAL_MCP_PORT_IN_USE') : error);
      });
      server.listen(port, this.options.bindHost ?? '127.0.0.1', () => {
        const address = server.address();
        if (this.stopped || !address || typeof address === 'string') {
          server.close();
          reject(new LocalAgentError('LOCAL_AGENT_UNAVAILABLE'));
          return;
        }
        const url = `http://${this.options.bindHost ?? '127.0.0.1'}:${address.port}/mcp`;
        this.endpointUrl = url;
        resolve(url);
      });
    });
  }
  /**
   * Start the bridge with the Profile instead of the first Agent run. The
   * endpoint is published for configured clients; failures are surfaced to the
   * caller so Profile activation can decide, never silently half-start.
   */
  async start(): Promise<void> {
    if (this.stopped) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    this.startup ??= this.startHost().catch(async (error: unknown) => {
      this.ready = false;
      await this.closeListener();
      await this.removeDiscovery();
      this.clientTokens.clear();
      this.startup = undefined;
      throw error;
    });
    await this.startup;
  }
  private async startHost(): Promise<void> {
    const port = await this.readBindingPort();
    if (this.stopped) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    const url = await this.listen(port);
    // Persist only after binding, without a probe/close/rebind race. An existing
    // address is never silently changed when another process occupies its port.
    if (this.bindingPath && port === 0) {
      await writePrivateJson(this.bindingPath, { version: 1, port: Number(new URL(url).port) });
    }
    await this.indexClients();
    if (this.stopped) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    await this.publishDiscovery();
    if (this.stopped) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    this.ready = true;
  }
  private async indexClients(): Promise<void> {
    const clients = this.options.clients;
    if (!clients) return;
    for (const credential of await clients.listCredentials()) {
      if (!this.stopped) this.clientTokens.set(credential.tokenHash, credential);
    }
  }
  private async publishDiscovery(): Promise<void> {
    const target = this.options.discoveryPath;
    const url = this.endpointUrl;
    if (!target || !url) return;
    const hint =
      'Add this server to your MCP client: {"mcpServers":{"memoflow":{"type":"http",' +
      `"url":"${url}","headers":{"Authorization":"Bearer <token from Settings>"}}}}`;
    await writePrivateJson(target, {
      version: 1,
      url,
      hint,
      pid: process.pid,
      updatedAt: new Date().toISOString(),
    });
    this.discoveryPublished = true;
  }
  private async removeDiscovery(): Promise<void> {
    // Failed starts and repeated disposal must not erase another instance's record.
    if (!this.discoveryPublished || !this.options.discoveryPath) return;
    this.discoveryPublished = false;
    await rm(this.options.discoveryPath, { force: true }).catch(() => undefined);
  }
  private async closeListener(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.endpointUrl = undefined;
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  /**
   * Wraps every registered tool so built-in runs and external clients share one
   * audit path. Only the tool name, connection/origin and a bounded outcome are
   * recorded; arguments and results never reach the sink.
   */
  private instrumentServer(server: McpServer, context: LocalToolContext): void {
    if (!this.options.audit) return;
    type ToolHandler = (...args: unknown[]) => unknown;
    type RegisterTool = (name: string, config: unknown, handler: ToolHandler) => unknown;
    const original = server.registerTool.bind(server) as unknown as RegisterTool;
    (server as unknown as { registerTool: RegisterTool }).registerTool = (name, config, handler) =>
      original(name, config, async (...args) =>
        this.auditCall(context, name, () => handler(...args)),
      );
  }
  private async auditCall(
    context: LocalToolContext,
    tool: string,
    work: () => unknown,
  ): Promise<unknown> {
    const startedAt = Date.now();
    try {
      const result = await work();
      await this.recordAudit(context, tool, startedAt, outcomeOf(result));
      return result;
    } catch (error) {
      await this.recordAudit(context, tool, startedAt, outcomeOfError(error));
      throw error;
    }
  }
  private async recordAudit(
    context: LocalToolContext,
    tool: string,
    startedAt: number,
    outcome: string,
  ): Promise<void> {
    const audit = this.options.audit;
    if (!audit) return;
    try {
      await audit.record(context.identityId, {
        version: '1',
        at: Date.now(),
        connectionId: context.connectionId,
        origin: context.origin,
        tool,
        effect: LOCAL_WRITE_TOOLS.has(tool) ? 'write' : 'read',
        scopeDecision: scopeDenied(outcome) ? 'denied' : 'allowed',
        outcome,
        durationMs: Math.max(0, Date.now() - startedAt),
        requestId: context.requestId,
        traceId: context.traceId,
      });
    } catch {
      // Audit must never change a tool's business result.
    }
  }
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const rejectRequest = (status: number) => {
      res.writeHead(status, { 'cache-control': 'no-store' });
      res.end();
    };
    const address = this.server?.address();
    const bindHost = this.options.bindHost ?? '127.0.0.1';
    if (
      !address ||
      typeof address === 'string' ||
      req.headers.host !== `${bindHost}:${address.port}` ||
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
    const clientRef = token && !grant ? this.clientTokens.get(tokenDigest(token)) : undefined;
    if (
      !this.ready ||
      !token ||
      (grant ? !this.live(token, grant) : !clientRef || this.stopped || !this.options.isActive())
    ) {
      rejectRequest(401);
      return;
    }
    // External clients resolve their write scopes per request. A revoked or
    // re-scoped record must be rejected before any tool is registered.
    let external: LocalMcpClient | undefined;
    const clients = this.options.clients;
    if (clientRef) {
      if (!clients) {
        rejectRequest(401);
        return;
      }
      try {
        external = await this.track(() => clients.get(clientRef.identityId, clientRef.id));
      } catch {
        rejectRequest(401);
        return;
      }
      if (external.revokedAt || this.stopped || !this.options.isActive()) {
        rejectRequest(401);
        return;
      }
    }
    if (this.pending >= 8) {
      rejectRequest(429);
      return;
    }
    this.pending++;
    const requestController = new AbortController();
    const signal = grant
      ? AbortSignal.any([grant.controller.signal, requestController.signal])
      : requestController.signal;
    const deadlineAt = Date.now() + 30_000;
    const timer = setTimeout(() => {
      requestController.abort();
      res.destroy();
    }, 30_000);
    const onClose = () => requestController.abort();
    res.once('close', onClose);
    const authorize = async (scope: string, tx?: IElectronDatabaseTransaction) => {
      if (signal.aborted || this.stopped || !this.options.isActive())
        throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
      if (grant) {
        if (!this.live(token!, grant)) throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
        const current = await this.track(() =>
          this.options.store.getConnection(grant.input.identityId, grant.input.connectionId, tx),
        );
        if (
          !this.live(token!, grant) ||
          signal.aborted ||
          !current.enabled ||
          current.revision !== grant.revision ||
          (scope.endsWith(':write') && !current.writeScopes.some((value) => value === scope))
        )
          throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
        return;
      }
      const current = await this.track(() =>
        clients!.get(clientRef!.identityId, clientRef!.id, tx),
      );
      if (
        this.stopped ||
        !this.options.isActive() ||
        signal.aborted ||
        current.revokedAt !== null ||
        (scope.endsWith(':write') && !current.writeScopes.some((value) => value === scope))
      )
        throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
    };
    const requestId = randomUUID();
    const context: LocalToolContext = grant
      ? {
          ...grant.input,
          writeScopes: grant.writeScopes,
          origin: 'run',
          requestId,
          traceId: requestId,
          source: 'http',
          startedAt: Date.now(),
          deadlineAt,
          signal,
          grantSignal: grant.controller.signal,
          authorize,
          executeAuthorized: <T>(operationId: string, toolName: string, work: () => Promise<T>) =>
            executeAuthorized(
              this.options.permissions,
              {
                owner: grant.input.identityId,
                agentId: grant.input.connectionId,
                conversationId: grant.input.conversationId,
                conversationPreset: this.conversation(
                  grant.input.identityId,
                  grant.input.conversationId,
                ).preset,
                conversationRules: this.conversation(
                  grant.input.identityId,
                  grant.input.conversationId,
                ).rules.filter((rule) => rule.agentId === grant.input.connectionId),
                operationId,
                ask: async () => {
                  if (!grant.input.requestApproval) return 'timeout';
                  const settingsAtRequest = await this.options.permissions.getSettings(
                    grant.input.identityId,
                  );
                  const timeout = AbortSignal.timeout(this.options.approvalTimeoutMs ?? 25_000);
                  const approvalSignal = AbortSignal.any([signal, timeout]);
                  return new Promise<'allow' | 'deny' | 'timeout'>((resolve) => {
                    const onAbort = () => resolve(timeout.aborted ? 'timeout' : 'deny');
                    if (approvalSignal.aborted) {
                      onAbort();
                      return;
                    }
                    approvalSignal.addEventListener('abort', onAbort, {
                      once: true,
                    });
                    Promise.resolve(
                      grant.input.requestApproval!(
                        toolName,
                        approvalSignal,
                        (() => {
                          const operation = getPermissionOperation(operationId)!;
                          return {
                            agentId: grant.input.connectionId,
                            object: operation.object,
                            action: operation.action,
                            expiresAt: Date.now() + (this.options.approvalTimeoutMs ?? 25_000),
                          };
                        })(),
                      ),
                    )
                      .then(async (approved) => {
                        if (approvalSignal.aborted || approved === false || approved === 'decline')
                          return resolve('deny');
                        // Reject a stale approval if the user changed the policy
                        // while the Agent was awaiting an answer.
                        const settingsNow = await this.options.permissions.getSettings(
                          grant.input.identityId,
                        );
                        if (!settingsNow || settingsNow.revision !== settingsAtRequest?.revision)
                          return resolve('deny');
                        const operation = getPermissionOperation(operationId)!;
                        const rule: PermissionRule = {
                          id: randomUUID(),
                          agentId: grant.input.connectionId,
                          object: operation.object,
                          action: operation.action,
                          effect: 'allow',
                          source: 'user',
                          createdAt: Date.now(),
                        };
                        if (approved === 'approve_always') {
                          // Persist the visible setting without reconciling native
                          // connection scopes mid-call; doing so would revoke this MCP grant.
                          await this.saveBusinessSettings(
                            grant.input.identityId,
                            withAllowedBusinessAccess(
                              settingsNow,
                              operation.object,
                              operation.action,
                            ),
                          );
                        }
                        if (approved === 'approve_conversation')
                          this.conversation(
                            grant.input.identityId,
                            grant.input.conversationId,
                          ).rules.push(rule);
                        resolve(approvalSignal.aborted ? 'deny' : 'allow');
                      })
                      .catch(() => resolve('deny'))
                      .finally(() => approvalSignal.removeEventListener('abort', onAbort));
                  });
                },
              },
              async () => {
                if (!this.live(token!, grant) || signal.aborted)
                  throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
                return work();
              },
            ).catch((error: unknown) => {
              if (error instanceof PermissionDeniedError)
                throw Object.assign(new Error('PERMISSION_DENIED'), {
                  code: 'PERMISSION_DENIED',
                });
              throw error;
            }),
          track: <T>(work: () => Promise<T>) => this.track(work),
        }
      : {
          identityId: clientRef!.identityId,
          connectionId: clientRef!.id,
          conversationId: '',
          runId: '',
          origin: 'client',
          writeScopes: external!.writeScopes,
          requestId,
          traceId: requestId,
          source: 'http',
          startedAt: Date.now(),
          deadlineAt,
          signal,
          grantSignal: signal,
          authorize,
          executeAuthorized: <T>(operationId: string, _toolName: string, work: () => Promise<T>) =>
            this.executeClientAuthorized(
              operationId,
              clientRef!.identityId,
              () => clients!.get(clientRef!.identityId, clientRef!.id),
              () => this.track(work),
              signal,
            ),
          track: <T>(work: () => Promise<T>) => this.track(work),
        };
    const handler = createMcpHandler(
      async () => {
        const mcp = new McpServer(
          {
            name: 'memoflow-local',
            version: '1',
          },
          { instructions: MEMOFLOW_WORKFLOW_INSTRUCTIONS },
        );
        this.instrumentServer(mcp, context);
        await this.options.registerTools(mcp, context);
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
  }
  /** External clients carry no run/conversation policy; the token's scopes are the grant. */
  private executeClientAuthorized<T>(
    operationId: string,
    owner: string,
    loadClient: () => Promise<LocalMcpClient>,
    run: () => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    return (async () => {
      const current = await loadClient().catch(() => null);
      if (!current || current.revokedAt !== null || this.stopped || !this.options.isActive())
        throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
      const scope = writeScopeForOperation(operationId);
      return executeAuthorized(
        this.options.permissions,
        {
          owner,
          agentId: current.id,
          operationId,
          // Issuing the scope is the user's pre-authorization; explicit denies
          // and the read-only preset still win inside the policy check.
          preAuthorizedWrite: Boolean(scope && current.writeScopes.includes(scope)),
        },
        async () => {
          if (this.stopped || !this.options.isActive() || signal.aborted)
            throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
          return run();
        },
      );
    })().catch((error: unknown) => {
      if (error instanceof PermissionDeniedError)
        throw Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' });
      throw error;
    });
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
    await this.migratePermissions(input.identityId);
    await this.start();
    const url = this.endpointUrl!;
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
        this.options.onRevokeGrant?.(input);
      },
    };
  }
  /** Loopback endpoint for the current Profile, published through the discovery file. */
  async endpoint(): Promise<LocalMcpEndpoint> {
    await this.start();
    if (this.stopped || !this.endpointUrl) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    return { url: this.endpointUrl, discoveryPath: this.options.discoveryPath ?? null };
  }
  async listMcpClients(owner: string): Promise<LocalMcpClient[]> {
    const clients = this.options.clients;
    if (!clients) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    if (this.stopped) throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
    return clients.list(owner);
  }
  /** Most recent tool-call audit rows for this Profile, newest first. */
  async listGatewayAudit(owner: string, limit = 20): Promise<LocalGatewayAuditRecord[]> {
    const audit = this.options.audit;
    if (!audit) return [];
    if (this.stopped) throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
    return audit.list(owner, limit);
  }
  /**
   * Mint a persistent external client. The plaintext token exists only in this
   * return value; the Profile record keeps its hash. Scope changes are not
   * supported — rotate by creating a new client and revoking the old one.
   */
  async createMcpClient(
    owner: string,
    raw: LocalMcpClientCreate,
  ): Promise<LocalMcpClientCredential> {
    const clients = this.options.clients;
    if (!clients) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    if (this.stopped || !this.options.isActive())
      throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
    const input = LocalMcpClientCreateSchema.parse(raw);
    await this.start();
    if (this.stopped || !this.options.isActive())
      throw new LocalAgentError('LOCAL_AGENT_PERMISSION_DENIED');
    const token = randomBytes(32).toString('base64url');
    const tokenHash = tokenDigest(token);
    const client = await clients.create(owner, {
      ...input,
      tokenHash,
      tokenPrefix: token.slice(0, 8),
    });
    this.clientTokens.set(tokenHash, { identityId: owner, id: client.id, tokenHash });
    return { client, token, endpoint: await this.endpoint() };
  }
  /** Revocation is immediate: the token index entry is dropped and every call re-reads the record. */
  async revokeMcpClient(owner: string, id: string): Promise<LocalMcpClient> {
    const clients = this.options.clients;
    if (!clients) throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
    const client = await clients.revoke(owner, id);
    for (const [hash, ref] of this.clientTokens) {
      if (ref.identityId === owner && ref.id === id) this.clientTokens.delete(hash);
    }
    return client;
  }
  dispose(): Promise<void> {
    this.disposal ??= this.disposeHost();
    return this.disposal;
  }
  private async disposeHost(): Promise<void> {
    this.conversations.clear();
    this.stopped = true;
    this.ready = false;
    for (const grant of this.grants.values()) {
      grant.controller.abort();
      this.options.onRevokeGrant?.(grant.input);
    }
    this.grants.clear();
    this.clientTokens.clear();
    // Include indexing and atomic publication, not only listen(), before final
    // cleanup; a late startup continuation must never republish a dead endpoint.
    await this.startup?.catch(() => undefined);
    await this.closeListener();
    await this.removeDiscovery();
    await Promise.allSettled([...this.inFlight]);
  }
}

export async function verifyLocalAgentMcpConnectivity(
  grant: LocalAgentToolGrant,
  options?: { requiredWriteScopes?: readonly string[] },
): Promise<{ ok: boolean; tools: string[]; error?: string }> {
  try {
    const res = await fetch(grant.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${grant.token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'connectivity-check',
        method: 'tools/list',
        params: {},
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ok: false, tools: [], error: `HTTP status ${res.status}` };
    }
    const raw = await res.text();
    const dataLine = raw.split('\n').find((l) => l.startsWith('data: '));
    const data = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(raw);
    if (data.error) {
      return {
        ok: false,
        tools: [],
        error: data.error.message || 'JSON-RPC error',
      };
    }
    const discoveredTools: unknown[] = Array.isArray(data?.result?.tools) ? data.result.tools : [];
    const tools = discoveredTools
      .map((entry) =>
        typeof entry === 'object' && entry !== null && 'name' in entry ? entry.name : undefined,
      )
      .filter((name): name is string => typeof name === 'string');
    if (options?.requiredWriteScopes?.includes('goals:write')) {
      const requiredGoalPanelTools = [
        'goal_panel_open',
        'goal_panel_snapshot',
        'goal_panel_patch',
        'goal_panel_submit',
      ];
      const missing = requiredGoalPanelTools.filter((name) => !tools.includes(name));
      if (missing.length) {
        return {
          ok: false,
          tools,
          error: `Business tools missing: ${missing.join(', ')} not discovered`,
        };
      }
    }
    return { ok: true, tools };
  } catch (err: unknown) {
    return {
      ok: false,
      tools: [],
      error: err instanceof Error ? err.message : 'Failed to reach local MCP endpoint',
    };
  }
}
