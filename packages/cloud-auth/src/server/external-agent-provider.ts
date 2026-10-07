import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp } from '@better-auth/mcp';
import { jwt } from 'better-auth/plugins';
import type { OAuthOptions, Scope } from '@better-auth/oauth-provider';

export interface ExternalAgentOAuthOptions {
  readonly resource: string;
  readonly webOrigin: string;
  readonly allowedClientIds: readonly string[];
  readonly accountIsActive: (identityId: string) => Promise<boolean>;
}

export const EXTERNAL_AGENT_SCOPES = ['goals:read', 'tasks:read'] as const;
export const EXTERNAL_AGENT_OAUTH_SCOPES = [...EXTERNAL_AGENT_SCOPES, 'offline_access'];
export const CONNECTION_CLAIM = 'urn:memoflow:connection_id';
export const CONNECTION_LIFETIME_MS = 90 * 86400_000;

/** Single locked provider composition shared by runtime and schema generation. */
export function createExternalAgentProvider(
  options: ExternalAgentOAuthOptions,
  lifecycle: Pick<OAuthOptions<Scope[]>, 'postLogin' | 'customAccessTokenClaims'> = {},
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
      fetchClientMetadataResource,
      metadataProfile: 'mcp-2026-07-28',
      isMetadataDocumentUrlAllowed: (url) => options.allowedClientIds.includes(url),
    }),
  ];
}
