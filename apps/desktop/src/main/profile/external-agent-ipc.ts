import { ipcMain } from 'electron';
import {
  CreateScopedPatSchema,
  externalAgentFailure,
  type ExternalAgentClientPort,
  type ExternalAgentFailureCode,
  type ExternalAgentResult,
} from '@memoflow/agent-gateway';
import { createExternalAgentBearerClient } from '@memoflow/cloud-auth';
import { ExternalAgentChannels } from '@memoflow/desktop-contracts';
import { fail, ok, type Result, type ResultError } from '@memoflow/transport-contracts/result';
import { z } from 'zod';
import { getApiBaseUrl, getWebAppUrl } from '../utils/api-config';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import type { CloudSessionStore } from './cloud-session-store';

export interface ExternalAgentIpcDeps {
  runtime: Pick<DesktopProfileRuntimeManager, 'getActiveProfileDescriptorSync'>;
  sessions: Pick<CloudSessionStore, 'getValidToken'>;
  /** Cloud API origin; defaults to the configured API base. */
  apiOrigin?: string;
  /** Trusted first-party Web origin sent on mutations; defaults to the Web app URL. */
  webOrigin?: string;
}

/**
 * External Agent connection management for the desktop renderer (Issue #1030).
 *
 * The Web surface authenticates with the Better Auth cookie session. Desktop
 * keeps that session token in the main process, so these channels forward the
 * same `/api/v1/agent-connections` operations with a bearer credential. The
 * renderer receives only the domain payload or a typed public failure — never
 * the token.
 */
export function registerExternalAgentIpc(deps: ExternalAgentIpcDeps): void {
  const apiOrigin = deps.apiOrigin ?? new URL(getApiBaseUrl()).origin;
  const webOrigin = deps.webOrigin ?? getWebAppUrl();

  const failure = (code: ExternalAgentFailureCode) =>
    fail<ResultError>({ code, message: code, failure: externalAgentFailure(code) });

  const toIpc = <T>(result: ExternalAgentResult<T>): Result<T> =>
    result.ok ? ok(result.data) : failure(result.error.code);

  /**
   * `unavailable` is what a Profile without a cloud account reports. The shared
   * settings section hides itself on EAG_SERVICE_DISABLED, which is exactly what
   * a local-only Profile should do on the Web too.
   */
  async function withSession<T>(
    unavailable: ExternalAgentFailureCode,
    run: (client: ExternalAgentClientPort) => Promise<ExternalAgentResult<T>>,
  ): Promise<Result<T>> {
    const profile = deps.runtime.getActiveProfileDescriptorSync();
    if (!profile || profile.profileKind !== 'registered') return failure(unavailable);
    try {
      const token = await deps.sessions.getValidToken(profile.profileId);
      if (!token) return failure('EAG_UNAUTHORIZED');
      return toIpc(
        await run(createExternalAgentBearerClient({ origin: apiOrigin, webOrigin, token })),
      );
    } catch {
      return failure('EAG_SERVICE_UNAVAILABLE');
    }
  }

  ipcMain.handle(ExternalAgentChannels.CAPABILITIES, () =>
    withSession('EAG_SERVICE_DISABLED', (client) => client.capabilities()),
  );

  ipcMain.handle(ExternalAgentChannels.LIST_PATS, () =>
    withSession('EAG_UNAUTHORIZED', (client) => client.listPats()),
  );

  ipcMain.handle(ExternalAgentChannels.CREATE_PAT, async (_event, input: unknown) => {
    const parsed = CreateScopedPatSchema.safeParse(input);
    if (!parsed.success) return failure('EAG_VALIDATION_ERROR');
    return withSession('EAG_UNAUTHORIZED', (client) => client.createPat(parsed.data));
  });

  ipcMain.handle(ExternalAgentChannels.REVOKE_PAT, async (_event, input: unknown) => {
    const id = z.uuid().safeParse(input);
    if (!id.success) return failure('EAG_VALIDATION_ERROR');
    return withSession('EAG_UNAUTHORIZED', (client) => client.revokePat(id.data));
  });

  ipcMain.handle(ExternalAgentChannels.LIST_CONNECTIONS, () =>
    withSession('EAG_UNAUTHORIZED', (client) => client.listConnections()),
  );

  ipcMain.handle(ExternalAgentChannels.REVOKE_CONNECTION, async (_event, input: unknown) => {
    const id = z.uuid().safeParse(input);
    if (!id.success) return failure('EAG_VALIDATION_ERROR');
    return withSession('EAG_UNAUTHORIZED', (client) => client.revokeConnection(id.data));
  });
}
