import { createHash } from 'node:crypto';
import {
  DEFAULT_EXTERNAL_AGENT_RATE_LIMITS,
  type ExternalAgentRateLimits,
} from '@memoflow/agent-gateway';
import type Redis from 'ioredis';

/** Host admission budgets; Lua makes each fixed one-minute bucket atomic across API instances. */
const CONSUME = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], 60000) end
return n <= tonumber(ARGV[1]) and 1 or 0
`;
export interface PilotAdmission {
  start(): Promise<void>;
  consumeIp(ip: string): Promise<boolean>;
  consumeOwner(identityId: string): Promise<boolean>;
  destroy(): Promise<void>;
}
/**
 * Creates host-owned shared admission for the external agent gateway.
 * @param redis - Dedicated configured Redis connection, owned by this module.
 * @param limits - Fixed-window per-minute budgets; unlimited hosts use the calibrated defaults.
 * @returns The bounded IP/owner admission port and its explicit lifecycle.
 */
export function createPilotAdmission(
  redis: Redis,
  limits: Pick<
    ExternalAgentRateLimits,
    'ipPerMinute' | 'ownerPerMinute'
  > = DEFAULT_EXTERNAL_AGENT_RATE_LIMITS,
): PilotAdmission {
  const key = (kind: string, value: string) =>
    `eag:read-pilot:${kind}:${createHash('sha256').update(value).digest('hex')}`;
  const consume = async (kind: string, value: string, perMinute: number) =>
    (await redis.eval(CONSUME, 1, key(kind, value), perMinute)) === 1;
  return {
    async start() {
      if (redis.status === 'wait') await redis.connect();
    },
    consumeIp: (ip) => consume('ip', ip, limits.ipPerMinute),
    consumeOwner: (identityId) => consume('owner', identityId, limits.ownerPerMinute),
    async destroy() {
      try {
        await redis.quit();
      } finally {
        redis.disconnect();
      }
    },
  };
}
