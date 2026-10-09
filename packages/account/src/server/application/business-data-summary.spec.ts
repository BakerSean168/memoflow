import { describe, expect, it } from 'vitest';
import { createBusinessDataSummaryReader } from './business-data-summary';

const emptyOwners = {
  goal: async () => false,
  task: async () => false,
  label: async () => false,
  schedule: async () => false,
  routine: async () => false,
  repository: async () => false,
  ai: async () => false,
  notification: async () => false,
  relation: async () => false,
};

describe('account business data summary', () => {
  it('requires every owner to confirm empty, independently of Account and default preferences', async () => {
    const read = createBusinessDataSummaryReader(emptyOwners);
    expect((await read('identity-a')).state).toBe('empty');
    const { repository: _repository, ...incomplete } = emptyOwners;
    expect((await createBusinessDataSummaryReader(incomplete)('identity-a')).state).toBe('unknown');
  });

  it('counts non-portable Knowledge content as non-empty and scopes every read to the principal', async () => {
    const identities: string[] = [];
    const read = createBusinessDataSummaryReader({
      ...emptyOwners,
      repository: async (identityId) => {
        identities.push(identityId);
        return true;
      },
      ai: async () => {
        throw new Error('unavailable');
      },
    });
    const result = await read('identity-a');
    expect(result.state).toBe('non_empty');
    expect(result.owners.find((owner) => owner.owner === 'ai')?.state).toBe('unknown');
    expect(identities).toEqual(['identity-a']);
  });

  it('never converts an owner failure or timeout to an empty account', async () => {
    const read = createBusinessDataSummaryReader(
      {
        ...emptyOwners,
        task: async () => {
          throw new Error('database offline');
        },
        repository: () => new Promise<boolean>(() => {}),
      },
      { timeoutMs: 10 },
    );
    expect((await read('identity-a')).state).toBe('unknown');
  });
});
