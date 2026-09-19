import { describe, expect, it, vi } from 'vitest';
import type { PortableCapabilityExecutionContext } from '@memoflow/contracts/data-portability';
import type {
  PreferenceNamespace,
  PreferenceNamespaceResponse,
  UserPreferenceProfile,
} from '@memoflow/contracts/setting';
import {
  PreferencePortableCapability,
  PreferencePortableService,
} from './preference-portability';
import type { UserPreferenceService } from './user-preference-service';

const target: UserPreferenceProfile = {
  presentation: { theme: 'dark', language: 'en-US' },
  regional: {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'long',
    timeStyle: '12h',
    weekStartsOn: 0,
  },
};

function response(
  namespace: PreferenceNamespace,
  revision: number,
  preferences: Record<string, unknown>,
): PreferenceNamespaceResponse {
  return { namespace, revision, preferences } as PreferenceNamespaceResponse;
}

function context(identityId = 'target-user'): PortableCapabilityExecutionContext {
  return {
    identityId,
    references: {
      declareExportReference: () => { throw new Error('not used'); },
      resolveExportReference: () => { throw new Error('not used'); },
      bindImportedReference: () => { throw new Error('not used'); },
      resolveImportedReference: () => { throw new Error('not used'); },
    },
  };
}

describe('PreferencePortableService', () => {
  it('exports only the canonical presentation/regional profile', async () => {
    const preferenceService = {
      getPreferenceProfile: vi.fn().mockResolvedValue(target),
    } as unknown as UserPreferenceService;
    const service = new PreferencePortableService(preferenceService);
    await expect(service.export('target-user')).resolves.toEqual(target);
    expect(preferenceService.getPreferenceProfile).toHaveBeenCalledWith('target-user');
  });

  it('dry-run has no mutations and classifies missing/changed/unchanged namespaces', async () => {
    const preferenceService = {
      getPreferenceNamespace: vi
        .fn()
        .mockResolvedValueOnce(response('presentation', 0, { theme: 'auto', language: 'zh-CN' }))
        .mockResolvedValueOnce(response('regional', 4, target.regional)),
      patchPreferenceNamespace: vi.fn(),
    } as unknown as UserPreferenceService;
    const service = new PreferencePortableService(preferenceService);

    await expect(service.dryRun('target-user', target)).resolves.toEqual({
      created: 1,
      updated: 0,
      skipped: 1,
      warnings: [],
    });
    expect(preferenceService.patchPreferenceNamespace).not.toHaveBeenCalled();
  });

  it('applies both namespaces with host identity and exact current revisions', async () => {
    const preferenceService = {
      getPreferenceNamespace: vi
        .fn()
        .mockResolvedValueOnce(response('presentation', 2, { theme: 'auto', language: 'zh-CN' }))
        .mockResolvedValueOnce(response('regional', 0, {
          timeZone: 'UTC',
          dateStyle: 'medium',
          timeStyle: '24h',
          weekStartsOn: 1,
        })),
      patchPreferenceNamespace: vi
        .fn()
        .mockResolvedValueOnce({ namespace: 'presentation', revision: 3, changedKeys: ['theme', 'language'] })
        .mockResolvedValueOnce({ namespace: 'regional', revision: 1, changedKeys: ['timeZone'] }),
    } as unknown as UserPreferenceService;
    const service = new PreferencePortableService(preferenceService);

    await expect(service.apply('target-user', target)).resolves.toEqual({
      created: 1,
      updated: 1,
      skipped: 0,
      warnings: [],
    });
    expect(preferenceService.patchPreferenceNamespace).toHaveBeenNthCalledWith(
      1,
      'target-user',
      'presentation',
      target.presentation,
      2,
    );
    expect(preferenceService.patchPreferenceNamespace).toHaveBeenNthCalledWith(
      2,
      'target-user',
      'regional',
      target.regional,
      0,
    );
  });

  it('re-reads and retries CAS conflicts without trusting source identity', async () => {
    const preferenceService = {
      getPreferenceNamespace: vi
        .fn()
        .mockResolvedValueOnce(response('presentation', 1, { theme: 'auto', language: 'zh-CN' }))
        .mockResolvedValueOnce(response('presentation', 2, { theme: 'light', language: 'zh-CN' }))
        .mockResolvedValueOnce(response('regional', 5, target.regional)),
      patchPreferenceNamespace: vi
        .fn()
        .mockResolvedValueOnce({
          code: 'preference_revision_conflict',
          namespace: 'presentation',
          expectedRevision: 1,
          latest: response('presentation', 2, { theme: 'light', language: 'zh-CN' }),
        })
        .mockResolvedValueOnce({ namespace: 'presentation', revision: 3, changedKeys: ['theme', 'language'] }),
    } as unknown as UserPreferenceService;
    const service = new PreferencePortableService(preferenceService);

    await expect(service.apply('destination-user', target)).resolves.toMatchObject({ updated: 1, skipped: 1 });
    expect(preferenceService.patchPreferenceNamespace).toHaveBeenNthCalledWith(
      2,
      'destination-user',
      'presentation',
      target.presentation,
      2,
    );
  });
});

describe('PreferencePortableCapability', () => {
  it('is preferences@3 and delegates using host-owned identity', async () => {
    const service = {
      export: vi.fn().mockResolvedValue(target),
      dryRun: vi.fn().mockResolvedValue({ created: 0, updated: 1, skipped: 1, warnings: [] }),
      apply: vi.fn().mockResolvedValue({ created: 0, updated: 1, skipped: 1, warnings: [] }),
    } as unknown as PreferencePortableService;
    const capability = new PreferencePortableCapability(service);

    expect(capability.key).toBe('preferences');
    expect(capability.schemaVersion).toBe(3);
    expect(capability.payloadSchema.safeParse({ ...target, identityId: 'source-user' }).success).toBe(false);
    await capability.export(context('destination-user'));
    await capability.dryRun(target, context('destination-user'));
    await capability.apply(target, context('destination-user'));
    expect(service.export).toHaveBeenCalledWith('destination-user');
    expect(service.dryRun).toHaveBeenCalledWith('destination-user', target);
    expect(service.apply).toHaveBeenCalledWith('destination-user', target);
  });
});
