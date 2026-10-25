/**
 * PowerSync token issuance
 *
 * Signs short-lived RS256 JWTs that PowerSync Service verifies via JWKS.
 */

import jwt from 'jsonwebtoken';
import { createLogger } from '@memoflow/utils/logger';
import type { getPowerSyncConfig } from '../../shared/infrastructure/config/env.js';

const logger = createLogger('PowerSyncTokenIssuer');

type PowerSyncConfig = ReturnType<typeof getPowerSyncConfig>;

export interface PowerSyncTokenResult {
  token: string;
  endpoint: string | undefined;
  expiresIn: number;
}

/**
 * Issue a PowerSync-specific RS256 JWT for the given identity.
 * Returns null if the private key is not configured.
 */
export function issuePowerSyncToken(
  identityId: string,
  config: PowerSyncConfig,
): PowerSyncTokenResult | null {
  if (!config.privateKey) {
    logger.error('PowerSync private key not configured');
    return null;
  }

  const token = jwt.sign({ sub: identityId, aud: 'powersync-dev' }, config.privateKey, {
    algorithm: 'RS256',
    expiresIn: '5m',
    keyid: config.keyId,
  } as jwt.SignOptions);

  logger.info('Issued PowerSync token', {
    identityId,
    audience: 'powersync-dev',
    expiresInSec: 300,
  });

  return { token, endpoint: config.url, expiresIn: 300 };
}
