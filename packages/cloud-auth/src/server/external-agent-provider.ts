import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp } from '@better-auth/mcp';
import { jwt } from 'better-auth/plugins';
import type { ClientMetadataResourceFetch, OAuthOptions, Scope } from '@better-auth/oauth-provider';

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
}

/**
 * OAuth is read-only by design, not because write support is missing. Write
 * scopes are PAT-only until the consent, audit and revocation conditions in
 * docs/internals/external-agent-oauth-write-consent.md are met (#1033).
 */
export const EXTERNAL_AGENT_SCOPES = ['goals:read', 'tasks:read'] as const;
export const EXTERNAL_AGENT_OAUTH_SCOPES = [...EXTERNAL_AGENT_SCOPES, 'offline_access'];
export const CONNECTION_CLAIM = 'urn:memoflow:connection_id';
export const CONNECTION_LIFETIME_MS = 90 * 86400_000;

/** Single locked provider composition shared by runtime and schema generation. */
export function createExternalAgentProvider(
  options: ExternalAgentOAuthOptions,
  lifecycle: Pick<OAuthOptions<Scope[]>, 'postLogin' | 'customAccessTokenClaims'> = {},
  cimdFetch?: CimdFetchTransport,
) {
  return [
    jwt(),
    mcp({
      resource: options.resource,
      resources: [
        {
          identifier: options.resource,
          name: 'MemoFlow',
          allowedScopes: EXTERNAL_AGENT_OAUTH_SCOPES,
        },
      ],
      loginPage: new URL('/auth/external-agent', options.webOrigin).href,
      consentPage: new URL('/auth/external-agent', options.webOrigin).href,
      scopes: EXTERNAL_AGENT_OAUTH_SCOPES,
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
