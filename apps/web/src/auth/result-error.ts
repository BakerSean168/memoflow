import type { ResultError } from '@memoflow/transport-contracts/result';
import {
  translateResultErrorMessage,
  type ResultErrorTranslateFn,
  type TranslateResultErrorOptions,
} from '@memoflow/http-client';

/**
 * Prefer domainCode (e.g. EMAIL_VERIFICATION_REQUIRED, INVALID_OR_EXPIRED_CODE)
 * when the API surfaces it under error.context, then fall back to Result code.
 */
export function translateAuthResultError(
  error: unknown,
  t: ResultErrorTranslateFn,
  options: TranslateResultErrorOptions = {},
): string {
  const domainCode =
    error &&
    typeof error === 'object' &&
    'context' in error &&
    error.context &&
    typeof error.context === 'object' &&
    'domainCode' in (error.context as Record<string, unknown>) &&
    typeof (error.context as Record<string, unknown>).domainCode === 'string'
      ? ((error.context as Record<string, unknown>).domainCode as string)
      : null;

  if (domainCode) {
    const scopedKey = options.scope ? `${options.scope}.errors.${domainCode}` : null;
    const globalKey = `errors.${domainCode}`;
    for (const key of [scopedKey, globalKey]) {
      if (!key) continue;
      const translated = t(key, (error as ResultError).context);
      if (translated !== key) {
        return translated;
      }
    }
  }

  return translateResultErrorMessage(error, t, options);
}
