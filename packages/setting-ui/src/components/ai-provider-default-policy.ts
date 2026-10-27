export interface PresetProviderDefaultState {
  configuredProvider: { isDefault?: boolean } | null;
  selectedForInitialDefault: boolean;
}

/**
 * Only a persisted provider can be default. An empty provider list is not a
 * default-selection signal: each template is evaluated independently.
 */
export function shouldUsePresetAsDefault({
  configuredProvider,
  selectedForInitialDefault,
}: PresetProviderDefaultState): boolean {
  if (!configuredProvider) {
    return false;
  }

  return Boolean(configuredProvider.isDefault || selectedForInitialDefault);
}
