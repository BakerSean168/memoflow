import { describe, expect, it } from 'vitest';
import type { AgentInstance } from '@memoflow/ai-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { AgentInstanceReadService } from './agent-instance-read.service';

function context(identityId: string): ExecutionContext {
  return {
    identityId,
    requestId: `request-${identityId}`,
    traceId: `trace-${identityId}`,
    startedAt: 1,
    source: 'system',
  };
}

function instance(overrides: Partial<AgentInstance> = {}): AgentInstance {
  return {
    instanceId: 'mastra-anyrouter',
    driver: 'mastra',
    name: 'AnyRouter',
    accentColor: '#6469da',
    enabled: true,
    revision: 3,
    createdAt: 1_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

function service(
  archives: Record<string, AgentInstance[]>,
  seenOwners: string[] = [],
): AgentInstanceReadService {
  return new AgentInstanceReadService({
    list: async (owner) => {
      seenOwners.push(owner);
      return { instances: archives[owner] ?? [], bindings: [] };
    },
  });
}

describe('AgentInstanceReadService', () => {
  it('lists an empty archive without inventing host defaults', async () => {
    const seenOwners: string[] = [];
    const port = service({}, seenOwners);

    await expect(port.list(context('owner-a'))).resolves.toEqual([]);
    expect(seenOwners).toEqual(['owner-a']);
  });

  it('lists only the calling owner archive entries', async () => {
    const seenOwners: string[] = [];
    const port = service(
      {
        'owner-a': [instance(), instance({ instanceId: 'codex-work', driver: 'codex' })],
        'owner-b': [instance({ instanceId: 'owner-b-only', name: 'Other' })],
      },
      seenOwners,
    );

    const ownerA = await port.list(context('owner-a'));
    expect(ownerA.map((entry) => entry.instanceId)).toEqual(['mastra-anyrouter', 'codex-work']);
    expect(seenOwners).toEqual(['owner-a']);
  });

  it('projects only identity, driver, name, status and timestamps', async () => {
    const port = service({
      'owner-a': [
        instance({
          instanceId: 'codex-work',
          driver: 'codex',
          name: 'Codex work',
          nativeConfig: {
            executablePath: '/usr/local/bin/codex',
            homePath: '/home/agent',
            writeScopes: ['goals:write'],
            nativePermissionMode: 'workspace-write',
          },
          legacyConnectionId: 'connection-internal',
        }),
      ],
    });

    const [projection] = await port.list(context('owner-a'));
    expect(Object.keys(projection).sort()).toEqual([
      'createdAt',
      'driver',
      'enabled',
      'instanceId',
      'name',
      'updatedAt',
    ]);
    expect(projection).toEqual({
      instanceId: 'codex-work',
      driver: 'codex',
      name: 'Codex work',
      enabled: true,
      createdAt: 1_000,
      updatedAt: 2_000,
    });
  });

  it('reads one owned instance by id', async () => {
    const port = service({
      'owner-a': [
        instance(),
        instance({ instanceId: 'codex-work', driver: 'codex', name: 'Codex work' }),
      ],
    });

    await expect(port.get('codex-work', context('owner-a'))).resolves.toEqual({
      instanceId: 'codex-work',
      driver: 'codex',
      name: 'Codex work',
      enabled: true,
      createdAt: 1_000,
      updatedAt: 2_000,
    });
  });

  it('fails another owner instance with the same not-found outcome as a missing id', async () => {
    const port = service({ 'owner-a': [instance()] });

    const crossOwner = await port
      .get('mastra-anyrouter', context('owner-b'))
      .catch((error) => error);
    const missing = await port.get('does-not-exist', context('owner-b')).catch((error) => error);

    expect(crossOwner).toMatchObject({ code: 'NOT_FOUND' });
    expect(missing).toMatchObject({ code: 'NOT_FOUND' });
    expect(crossOwner.message).toBe(missing.message);
  });
});
