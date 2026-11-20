/**
 * Operator entry point for the External Agent Gateway OAuth client registry.
 *
 * CIMD clients are created just-in-time by the authorization server, so this
 * command is the fallback for clients that cannot publish a metadata document
 * and the only way to suspend an existing registration. It writes only the
 * OAuth provider rows; it never grants product consent or widens scopes.
 *
 * Every mutating run prints one JSON audit record (actor, time, client_id,
 * result) on stdout; route that line to the same operator log sink used for
 * deployment changes.
 */
import { hostname, userInfo } from 'node:os';
import { pathToFileURL } from 'node:url';
import { EXTERNAL_AGENT_OAUTH_SCOPES } from '@memoflow/cloud-auth/server';
import type { PrismaClient } from '@memoflow/database';
import { isUniqueConstraintError } from '@memoflow/utils/errors';

/** Scopes an operator may pre-provision. OAuth stays read-only (#1033 owns writes). */
export const CLIENT_ADMIN_SCOPES = EXTERNAL_AGENT_OAUTH_SCOPES;

const DEFAULT_RESOURCE_NAME = 'MemoFlow';

export interface SeedOAuthClientInput {
  readonly clientId: string;
  readonly name: string;
  readonly redirectUris: readonly string[];
  readonly resource: string;
  readonly scopes?: readonly string[];
}

export interface OAuthClientSummary {
  readonly clientId: string;
  readonly name: string | null;
  readonly disabled: boolean;
  readonly createdAt: string | null;
  readonly redirectUris: readonly string[];
  readonly scopes: readonly string[];
  readonly discovery: 'cimd' | 'managed';
}

export type SeedStatus = 'created' | 'exists';
export type DisableStatus = 'disabled' | 'unchanged' | 'missing';
export type EnableStatus = 'enabled' | 'unchanged' | 'missing';

export interface AuditRecord {
  readonly kind: 'eag.oauth_client.audit';
  readonly at: string;
  readonly actor: string;
  readonly action: 'seed' | 'disable' | 'enable';
  readonly clientId: string;
  readonly result: SeedStatus | DisableStatus | EnableStatus;
  readonly resource?: string;
  readonly redirectUris?: readonly string[];
  readonly scopes?: readonly string[];
}

function fail(message: string): never {
  throw new Error(message);
}

/** The client_id namespace is the CIMD URL form; it must never carry credentials or a fragment. */
export function normalizeClientId(clientId: string): string {
  const value = clientId.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail(`client id must be an absolute https URL: ${clientId}`);
  }
  if (url.protocol !== 'https:') fail(`client id must use https: ${value}`);
  if (url.username || url.password) fail(`client id must not contain credentials: ${value}`);
  if (url.hash) fail(`client id must not contain a fragment: ${value}`);
  return value;
}

function normalizeRedirectUris(uris: readonly string[]): string[] {
  if (uris.length === 0) fail('at least one --redirect-uri is required');
  return uris.map((raw) => {
    const value = raw.trim();
    if (value.includes('*')) fail(`redirect uri must not contain a wildcard: ${value}`);
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      fail(`redirect uri must be absolute: ${value}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      fail(`redirect uri must use http(s): ${value}`);
    if (url.hash) fail(`redirect uri must not contain a fragment: ${value}`);
    return value;
  });
}

function normalizeScopes(scopes: readonly string[] | undefined): string[] {
  const values = [...new Set((scopes ?? CLIENT_ADMIN_SCOPES).map((scope) => scope.trim()))].filter(
    Boolean,
  );
  if (values.length === 0) fail('at least one scope is required');
  for (const scope of values) {
    if (!(CLIENT_ADMIN_SCOPES as readonly string[]).includes(scope))
      fail(`scope is not available to OAuth clients: ${scope}`);
  }
  return values;
}

/**
 * Insert the shared MCP resource only when absent. Mirrors the values the
 * provider seeds from `createExternalAgentProvider`, so a pre-provisioned row
 * is indistinguishable from the startup seed.
 */
async function ensureResource(db: PrismaClient, identifier: string, now: Date): Promise<void> {
  const existing = await db.oauthResource.findUnique({ where: { identifier } });
  if (existing) return;
  try {
    await db.oauthResource.create({
      data: {
        identifier,
        name: DEFAULT_RESOURCE_NAME,
        allowedScopes: [...CLIENT_ADMIN_SCOPES],
        disabled: false,
        policyVersion: 1,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }
}

async function linkResource(
  db: PrismaClient,
  clientId: string,
  resourceId: string,
  now: Date,
): Promise<void> {
  await db.oauthClientResource.upsert({
    where: { clientId_resourceId: { clientId, resourceId } },
    update: {},
    create: { clientId, resourceId, createdAt: now },
  });
}

/**
 * Pre-provision one public OAuth client. Insert-only: a second run reports
 * `exists` and leaves operator-set policy untouched, so re-running a rollout
 * never resets a suspended client or rewrites redirect URIs.
 */
export async function seedOAuthClient(
  db: PrismaClient,
  input: SeedOAuthClientInput,
  now = new Date(),
): Promise<{ status: SeedStatus; clientId: string; resource: string; scopes: string[] }> {
  const clientId = normalizeClientId(input.clientId);
  const name = input.name.trim();
  if (!name) fail('--name is required');
  const redirectUris = normalizeRedirectUris(input.redirectUris);
  const resource = input.resource.trim();
  if (!resource) fail('--resource is required');
  const scopes = normalizeScopes(input.scopes);

  await ensureResource(db, resource, now);

  const existing = await db.oauthClient.findUnique({ where: { clientId } });
  if (existing) {
    await linkResource(db, clientId, resource, now);
    return { status: 'exists', clientId, resource, scopes };
  }

  let created = true;
  try {
    await db.oauthClient.create({
      data: {
        clientId,
        // Managed clients must not be re-fetched from a metadata document.
        clientDiscoveryId: null,
        name,
        redirectUris,
        scopes,
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        requirePKCE: true,
        tokenEndpointAuthMethod: 'none',
        disabled: false,
        skipConsent: false,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    created = false;
  }
  await linkResource(db, clientId, resource, now);
  return { status: created ? 'created' : 'exists', clientId, resource, scopes };
}

/** Suspend a client. Existing tokens and refresh families stop authenticating immediately. */
export async function disableOAuthClient(
  db: PrismaClient,
  clientIdInput: string,
  now = new Date(),
): Promise<{ status: DisableStatus; clientId: string }> {
  const clientId = normalizeClientId(clientIdInput);
  const existing = await db.oauthClient.findUnique({ where: { clientId } });
  if (!existing) return { status: 'missing', clientId };
  if (existing.disabled) return { status: 'unchanged', clientId };
  await db.oauthClient.update({
    where: { clientId },
    data: { disabled: true, updatedAt: now },
  });
  return { status: 'disabled', clientId };
}

/** Explicitly reverse a suspension; seeding never does this on its own. */
export async function enableOAuthClient(
  db: PrismaClient,
  clientIdInput: string,
  now = new Date(),
): Promise<{ status: EnableStatus; clientId: string }> {
  const clientId = normalizeClientId(clientIdInput);
  const existing = await db.oauthClient.findUnique({ where: { clientId } });
  if (!existing) return { status: 'missing', clientId };
  if (!existing.disabled) return { status: 'unchanged', clientId };
  await db.oauthClient.update({
    where: { clientId },
    data: { disabled: false, updatedAt: now },
  });
  return { status: 'enabled', clientId };
}

export async function listOAuthClients(db: PrismaClient): Promise<OAuthClientSummary[]> {
  const rows = await db.oauthClient.findMany({ orderBy: { clientId: 'asc' } });
  return rows.map((row) => ({
    clientId: row.clientId,
    name: row.name,
    disabled: row.disabled === true,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    redirectUris: row.redirectUris,
    scopes: row.scopes,
    discovery: row.clientDiscoveryId ? 'cimd' : 'managed',
  }));
}

const USAGE = `Usage: oauth-client-admin <command> [options]

  seed     --client-id <https-url> --name <name> --redirect-uri <uri> [--redirect-uri <uri>]...
           [--resource <audience>] [--scopes goals:read,tasks:read,offline_access] [--actor <id>]
  list
  disable  --client-id <https-url> [--actor <id>]
  enable   --client-id <https-url> [--actor <id>]

DATABASE_URL must point at the target MemoFlow database. --resource defaults to
EAG_AUDIENCE. Every mutating command prints one JSON audit record on stdout.`;

type Command = 'seed' | 'list' | 'disable' | 'enable';

interface ParsedCommand {
  readonly command: Command;
  readonly flags: ReadonlyMap<string, readonly string[]>;
}

export function parseCommand(argv: readonly string[]): ParsedCommand {
  const [command, ...rest] = argv;
  if (command !== 'seed' && command !== 'list' && command !== 'disable' && command !== 'enable')
    fail(command ? `unknown command: ${command}` : 'a command is required');
  const flags = new Map<string, string[]>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] ?? '';
    if (!token.startsWith('--')) fail(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!key) fail('empty flag');
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`missing value for --${key}`);
    index += 1;
    flags.set(key, [...(flags.get(key) ?? []), value]);
  }
  return { command, flags };
}

function single(flags: ReadonlyMap<string, readonly string[]>, key: string): string | undefined {
  const values = flags.get(key);
  if (!values) return undefined;
  if (values.length > 1) fail(`--${key} accepts one value`);
  return values[0];
}

function actorOf(flags: ReadonlyMap<string, readonly string[]>): string {
  const explicit = single(flags, 'actor') ?? process.env.EAG_OAUTH_ADMIN_ACTOR;
  if (explicit?.trim()) return explicit.trim();
  try {
    return `${userInfo().username}@${hostname()}`;
  } catch {
    return 'unknown-operator';
  }
}

function auditLine(record: AuditRecord): string {
  return JSON.stringify(record);
}

const KNOWN_FLAGS: Record<Command, ReadonlySet<string>> = {
  seed: new Set(['client-id', 'name', 'redirect-uri', 'resource', 'scopes', 'actor']),
  list: new Set<string>(),
  disable: new Set(['client-id', 'actor']),
  enable: new Set(['client-id', 'actor']),
};

/**
 * Execute one command. Returns the process exit code; output goes through the
 * injected writer so the CLI and tests share one code path.
 */
export async function runOAuthClientAdmin(
  argv: readonly string[],
  options: { db: PrismaClient; now?: Date; write?: (line: string) => void },
): Promise<number> {
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = options.now ?? new Date();
  const { command, flags } = parseCommand(argv);
  const unknown = [...flags.keys()].filter((key) => !KNOWN_FLAGS[command].has(key));
  if (unknown.length) fail(`unknown option for ${command}: --${unknown[0]}`);
  const actor = actorOf(flags);

  if (command === 'list') {
    write(JSON.stringify({ clients: await listOAuthClients(options.db) }));
    return 0;
  }

  const clientId = single(flags, 'client-id');
  if (!clientId) fail('--client-id is required');

  if (command === 'disable' || command === 'enable') {
    const result =
      command === 'disable'
        ? await disableOAuthClient(options.db, clientId, now)
        : await enableOAuthClient(options.db, clientId, now);
    write(
      auditLine({
        kind: 'eag.oauth_client.audit',
        at: now.toISOString(),
        actor,
        action: command,
        clientId: result.clientId,
        result: result.status,
      }),
    );
    return result.status === 'missing' ? 1 : 0;
  }

  const redirectUris = flags.get('redirect-uri') ?? [];
  const resource = single(flags, 'resource') ?? process.env.EAG_AUDIENCE;
  if (!resource) fail('--resource or EAG_AUDIENCE is required');
  const scopes = single(flags, 'scopes')
    ?.split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
  const result = await seedOAuthClient(
    options.db,
    {
      clientId,
      name: single(flags, 'name') ?? fail('--name is required'),
      redirectUris,
      resource,
      scopes,
    },
    now,
  );
  write(
    auditLine({
      kind: 'eag.oauth_client.audit',
      at: now.toISOString(),
      actor,
      action: 'seed',
      clientId: result.clientId,
      result: result.status,
      resource: result.resource,
      redirectUris,
      scopes: result.scopes,
    }),
  );
  return 0;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    process.stderr.write('DATABASE_URL is required\n');
    process.exitCode = 2;
    return;
  }
  const { prisma } = await import('@memoflow/database');
  try {
    process.exitCode = await runOAuthClientAdmin(process.argv.slice(2), { db: prisma });
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
    process.exitCode = 2;
  });
}
