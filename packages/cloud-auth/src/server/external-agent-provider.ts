import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp } from '@better-auth/mcp';
import { jwt } from 'better-auth/plugins';
import type { ClientMetadataResourceFetch, OAuthOptions, Scope } from '@better-auth/oauth-provider';
import type { GatewayAuditEvent } from '@memoflow/agent-gateway';

/**
 * CIMD metadata transport injection point. Production resolves and pins the
 * hostname at the runtime network boundary; tests swap only this transport.
 */
export type CimdFetchTransport = ClientMetadataResourceFetch;

export interface ExternalAgentOAuthOptions {
  readonly resource: string;
  readonly webOrigin: string;
  readonly allowedClientIds: readonly string[];
  readonly accountIsActive: (identityId: string) => Promise<boolean>;
  /**
   * Grants OAuth write scopes and enables OAuth write/assisted gateway calls.
   * Defaults to `false`; `EAG_OAUTH_WRITE_ENABLED=0` must also invalidate writes
   * that were already issued, so this flag is read on the call path too.
   */
  readonly writeEnabled?: boolean;
  /** Credential-level audit sink for consent and revocation facts. */
  readonly audit?: (event: GatewayAuditEvent) => void;
  /** Resolves the signed-in user for audit events that have no token subject. */
  readonly resolveIdentity?: (request: Request) => Promise<string | null>;
  /** Fixed-window read budget per connection; defaults to the calibrated gateway limit. */
  readonly readQuotaPerMinute?: number;
}

/**
 * OAuth reuses the same thirteen domain scopes as PAT (#1054). Read and write do
 * not imply each other, and write scopes are only reachable while the OAuth
 * write switch is on.
 */
export const EXTERNAL_AGENT_READ_SCOPES = [
  'goals:read',
  'tasks:read',
  'routines:read',
  'notifications:read',
  'schedules:read',
  'labels:read',
  'relations:read',
  'ai:read',
] as const;
export const EXTERNAL_AGENT_WRITE_SCOPES = [
  'goals:write',
  'tasks:write',
  'routines:write',
  'notifications:write',
  'schedules:write',
] as const;
export const EXTERNAL_AGENT_SCOPES = [
  ...EXTERNAL_AGENT_READ_SCOPES,
  ...EXTERNAL_AGENT_WRITE_SCOPES,
] as const;
export const EXTERNAL_AGENT_OAUTH_SCOPES = [...EXTERNAL_AGENT_SCOPES, 'offline_access'] as const;

/** Scopes the OAuth grant may actually contain for the current deployment. */
export function externalAgentScopes(writeEnabled: boolean): readonly string[] {
  return writeEnabled ? EXTERNAL_AGENT_SCOPES : EXTERNAL_AGENT_READ_SCOPES;
}

/** OAuth grant scopes, including the explicit offline continuation scope. */
export function externalAgentOAuthScopes(writeEnabled: boolean): readonly string[] {
  return writeEnabled
    ? EXTERNAL_AGENT_OAUTH_SCOPES
    : [...EXTERNAL_AGENT_READ_SCOPES, 'offline_access'];
}
export const CONNECTION_CLAIM = 'urn:memoflow:connection_id';
export const CONNECTION_LIFETIME_MS = 90 * 86400_000;

/** Single locked provider composition shared by runtime and schema generation. */
export function createExternalAgentProvider(
  options: ExternalAgentOAuthOptions,
  lifecycle: Pick<OAuthOptions<Scope[]>, 'postLogin' | 'customAccessTokenClaims'> = {},
  cimdFetch?: CimdFetchTransport,
) {
  const allowedScopes = [...externalAgentOAuthScopes(options.writeEnabled === true)];
  return [
    jwt(),
    mcp({
      resource: options.resource,
      resources: [
        {
          identifier: options.resource,
          name: 'MemoFlow',
          allowedScopes,
        },
      ],
      loginPage: new URL('/auth/external-agent', options.webOrigin).href,
      consentPage: new URL('/auth/external-agent', options.webOrigin).href,
      scopes: allowedScopes,
      grantTypes: ['authorization_code', 'refresh_token'],
      accessTokenExpiresIn: 600,
      refreshTokenExpiresIn: 30 * 86400,
      refreshTokenReuseInterval: 30,
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: false,
      ...lifecycle,
    }),
    cimd({
      fetchClientMetadataResource: cimdFetch ?? fetchClientMetadataResource,
      metadataProfile: 'mcp-2026-07-28',
      isMetadataDocumentUrlAllowed: (url) => options.allowedClientIds.includes(url),
    }),
  ];
}
