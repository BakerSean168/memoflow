import type { Result } from '@memoflow/transport-contracts/result';

import { type DesktopAuthApi, recoverDesktopAuthIfNeeded } from './desktop-auth-recovery';
import { translateResultError } from './translate-result-error';

type TranslateFn = (key: string) => string;

type ResultErrorLike =
  | {
      code?: string;
      message?: string;
    }
  | null
  | undefined;

export interface ExecuteDesktopAuthenticatedResultOptions<T> {
  operation: () => Promise<Result<T>>;
  logScope: string;
  t?: TranslateFn;
  fallbackKey?: string;
  /** Desktop auth API for automatic recovery. Omit in web runtime. */
  desktopApi?: DesktopAuthApi;
  onStart?: () => void | Promise<void>;
  onSuccess?: (data: T) => void | Promise<void>;
  onError?: (error: ResultErrorLike, translatedMessage: string) => void | Promise<void>;
  onFinally?: () => void | Promise<void>;
}

function getTranslatedErrorMessage(
  error: ResultErrorLike,
  t?: TranslateFn,
  fallbackKey?: string,
): string {
  if (t && fallbackKey) {
    return translateResultError(error, t, { fallbackKey });
  }

  return error?.message ?? (fallbackKey && t ? t(fallbackKey) : 'Operation failed');
}

export async function executeDesktopAuthenticatedResult<T>({
  operation,
  logScope,
  t,
  fallbackKey,
  desktopApi,
  onStart,
  onSuccess,
  onError,
  onFinally,
}: ExecuteDesktopAuthenticatedResultOptions<T>): Promise<Result<T>> {
  await onStart?.();

  try {
    let result = await operation();

    if (!result.ok && result.error && desktopApi) {
      const recovered = await recoverDesktopAuthIfNeeded(result.error, desktopApi, logScope);

      if (recovered) {
        result = await operation();
      }
    }

    if (result.ok) {
      await onSuccess?.(result.data);
    } else {
      await onError?.(result.error, getTranslatedErrorMessage(result.error, t, fallbackKey));
    }

    return result;
  } finally {
    await onFinally?.();
  }
}
