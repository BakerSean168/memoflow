import { computed } from 'vue';
import { settingUiHost } from '../setting-ui-host';

/**
 * Resolve the active server-state identity scope defensively so components
 * remain testable under minimal desktop host fixtures that omit platform hooks.
 */
export function useSettingIdentityScope() {
  const resolveScope = settingUiHost?.useServerStateIdentityScope?.();
  return computed(() => resolveScope?.() ?? '');
}
