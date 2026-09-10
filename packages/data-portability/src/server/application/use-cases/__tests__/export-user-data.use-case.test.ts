import { describe, expect, it, vi } from 'vitest';
import type { DataPortabilityDependencies } from '../../data-portability.dependencies';
import { ExportUserDataUseCase } from '../export-user-data.use-case';

describe('ExportUserDataUseCase canonical settings projection', () => {
  it('keeps an explicitly requested settings module for a new identity with no persisted preference rows', async () => {
    const list = vi.fn(async () => []);
    const useCase = new ExportUserDataUseCase({
      userPreferenceRepository: { list },
    } as unknown as DataPortabilityDependencies);

    const result = await useCase.execute('identity-new', ['settings']);
    const envelope = JSON.parse(result.content) as {
      data: { settings?: { preferences?: { presentation?: unknown; regional?: unknown } } };
    };

    expect(list).toHaveBeenCalledWith('identity-new');
    expect(envelope.data.settings?.preferences?.presentation).toBeDefined();
    expect(envelope.data.settings?.preferences?.regional).toBeDefined();
    expect(result.summary.entityCounts.settings).toBe(1);
  });
});
