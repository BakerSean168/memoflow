import { describe, expect, it } from 'vitest';
import { shouldUsePresetAsDefault } from './ai-provider-default-policy';

describe('shouldUsePresetAsDefault', () => {
  it('never marks an unconfigured provider template as default', () => {
    expect(
      shouldUsePresetAsDefault({
        configuredProvider: null,
        selectedForInitialDefault: false,
      }),
    ).toBe(false);
  });

  it('uses an explicit selection only when the template is configured', () => {
    expect(
      shouldUsePresetAsDefault({
        configuredProvider: { isDefault: false },
        selectedForInitialDefault: true,
      }),
    ).toBe(true);
  });

  it('keeps the authoritative configured default selected', () => {
    expect(
      shouldUsePresetAsDefault({
        configuredProvider: { isDefault: true },
        selectedForInitialDefault: false,
      }),
    ).toBe(true);
  });
});
