import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { DEFAULT_EXTERNAL_AGENT_RATE_LIMITS } from '@memoflow/agent-gateway';
import { createPilotAdmission } from './pilot-admission';

describe('private pilot shared Redis admission', () => {
  let url = process.env.EAG_TEST_REDIS_URL;
  let container: string | undefined;
  beforeAll(() => {
    if (url) return;
    container = execFileSync(
      'docker',
      ['run', '--detach', '--rm', '--publish', '127.0.0.1::6379', 'redis:8.10.2-alpine'],
      { encoding: 'utf8', timeout: 20000 },
    ).trim();
    if (!/^[a-f0-9]{64}$/.test(container)) throw new Error('Unexpected test container identity');
    const address = execFileSync('docker', ['port', container, '6379/tcp'], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error('Unexpected test listener');
    url = `redis://${address}`;
    execFileSync('docker', ['exec', container, 'redis-cli', 'ping'], {
      encoding: 'utf8',
      timeout: 5000,
    });
  });
  afterAll(() => {
    if (container) execFileSync('docker', ['stop', container], { stdio: 'ignore', timeout: 5000 });
  });
  it('shares IP and owner quotas atomically and at the calibrated budgets', async () => {
    if (!url) throw new Error('Missing isolated Redis test listener');
    const options = { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 };
    const left = createPilotAdmission(new Redis(url, options));
    const right = createPilotAdmission(new Redis(url, options));
    await left.start();
    await right.start();
    const fixture = randomUUID();
    const { ipPerMinute, ownerPerMinute } = DEFAULT_EXTERNAL_AGENT_RATE_LIMITS;
    try {
      const ips = await Promise.all(
        Array.from({ length: ipPerMinute + 10 }, (_, index) =>
          (index % 2 ? left : right).consumeIp(fixture),
        ),
      );
      expect(ips.filter(Boolean)).toHaveLength(ipPerMinute);
      const owners = await Promise.all(
        Array.from({ length: ownerPerMinute + 10 }, (_, index) =>
          (index % 2 ? left : right).consumeOwner(fixture),
        ),
      );
      expect(owners.filter(Boolean)).toHaveLength(ownerPerMinute);
      // Buckets never share authority merely because their raw input strings match.
      expect(await left.consumeOwner(`${fixture}-other`)).toBe(true);
    } finally {
      await left.destroy();
      await right.destroy();
    }
  });

  it('applies configured budgets instead of the calibrated defaults', async () => {
    if (!url) throw new Error('Missing isolated Redis test listener');
    const options = { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 };
    const admission = createPilotAdmission(new Redis(url, options), {
      ipPerMinute: 4,
      ownerPerMinute: 2,
    });
    await admission.start();
    const fixture = randomUUID();
    try {
      const ips = await Promise.all(Array.from({ length: 6 }, () => admission.consumeIp(fixture)));
      expect(ips.filter(Boolean)).toHaveLength(4);
      const owners = await Promise.all(
        Array.from({ length: 4 }, () => admission.consumeOwner(fixture)),
      );
      expect(owners.filter(Boolean)).toHaveLength(2);
    } finally {
      await admission.destroy();
    }
  });
});
