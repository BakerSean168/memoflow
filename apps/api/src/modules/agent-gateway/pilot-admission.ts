import { createHash } from 'node:crypto';
import type Redis from 'ioredis';

/** Fixed private-pilot budgets; Lua makes each bucket atomic across API instances. */
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
 * Creates host-owned shared admission for the Goal PAT pilot (120 requests per minute).
 * @param redis - Dedicated configured Redis connection, owned by this module.
 * @returns The bounded IP/owner admission port and its explicit lifecycle.
 */
export function createPilotAdmission(redis: Redis): PilotAdmission {
  const key = (kind: string, value: string) =>
    `eag:read-pilot:${kind}:${createHash('sha256').update(value).digest('hex')}`;
  const consume = async (kind: string, value: string) =>
    (await redis.eval(CONSUME, 1, key(kind, value), 120)) === 1;
  return {
    async start() {
      if (redis.status === 'wait') await redis.connect();
    },
    consumeIp: (ip) => consume('ip', ip),
    consumeOwner: (identityId) => consume('owner', identityId),
    async destroy() {
      try {
        await redis.quit();
      } finally {
        redis.disconnect();
      }
    },
  };
}
