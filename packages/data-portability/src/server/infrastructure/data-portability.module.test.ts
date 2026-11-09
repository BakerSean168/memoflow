import { describe, expect, it } from 'vitest';
import { createDataPortabilityModule } from './data-portability.module';

const content = JSON.stringify({
  format: 'memoflow.user-data-export',
  schemaVersion: 3,
  exportedAt: '2026-11-09T00:00:00.000Z',
  productVersion: 'test',
  capabilities: [
    {
      key: 'ai-conversation-messages',
      schemaVersion: 1,
      payload: {
        archive: { digest: 'a'.repeat(64), threads: 0, messages: 0 },
        threads: [],
      },
    },
  ],
});

describe('generic V3 archive rejection', () => {
  it('refuses to dry-run messages without a sidecar archive', async () => {
    const module = createDataPortabilityModule({});
    await expect(
      module.api.dryRunPortableDataV3('account-1', { content }),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_REQUIRED' });
  });

  it('refuses to apply messages without a sidecar archive', async () => {
    const module = createDataPortabilityModule({});
    await expect(
      module.api.applyPortableDataV3('account-1', { content }),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_REQUIRED' });
  });
});
