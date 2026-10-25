import { getI18nGlobal } from '../../plugins/i18n';

export { translateResultErrorMessage as translateResultError } from '@memoflow/http-client';

/**
 * Safe vue-i18n `t` resolver for non-component translation helpers. Returns an
 * identity function when the i18n plugin is not installed (unit tests or
 * pre-bootstrap), so translateResultError never throws outside a host app.
 */
export function getGlobalResultErrorT(): (key: string, params?: Record<string, unknown>) => string {
  try {
    return getI18nGlobal().t;
  } catch {
    return (key: string) => key;
  }
}
