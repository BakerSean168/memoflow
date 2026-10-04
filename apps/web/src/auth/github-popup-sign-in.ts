import type { CloudAuthWebClientPort } from '@memoflow/contracts';
import type { ResultError } from '@memoflow/contracts/result';

export type GithubPopupSignInResult =
  { kind: 'authenticated' } | { kind: 'cancelled' } | { kind: 'failed'; error: ResultError };

export interface GithubPopupSignInOptions {
  popupName?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

interface OAuthPopupCompleteMessage {
  type: 'memoflow:oauth-popup-complete';
  provider: 'github';
  requestId: string;
}

/**
 * Canonical GitHub OAuth popup flow for Web authentication surfaces.
 *
 * Provider authorization runs in a dedicated child window. The provider
 * callback returns to /auth/popup-complete on the MemoFlow origin; that tiny
 * completion surface verifies the shared session, notifies its opener using a
 * request-scoped same-origin postMessage, then closes itself. Parent-side
 * session polling remains as a compatibility fallback.
 */
export async function startGithubPopupSignIn(
  service: CloudAuthWebClientPort,
  options: GithubPopupSignInOptions = {},
): Promise<GithubPopupSignInResult> {
  const width = Math.min(760, Math.max(620, window.screen.availWidth - 180));
  const height = Math.min(760, Math.max(620, window.screen.availHeight - 160));
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
  const requestId = crypto.randomUUID();
  const callbackURL = new URL('/auth/popup-complete', window.location.origin);
  callbackURL.searchParams.set('provider', 'github');
  callbackURL.searchParams.set('requestId', requestId);

  const popup = window.open(
    'about:blank',
    options.popupName ?? 'memoflow-github-auth',
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
  );
  if (!popup) {
    return {
      kind: 'failed',
      error: {
        code: 'POPUP_BLOCKED',
        message: 'The browser blocked the GitHub sign-in window.',
      },
    };
  }

  const started = await service.beginGithubSignIn(callbackURL.toString());
  if (!started.ok) {
    popup.close();
    return { kind: 'failed', error: started.error };
  }

  const timeoutMs = options.timeoutMs ?? 10 * 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 750;
  const deadline = Date.now() + timeoutMs;
  let settle: ((result: GithubPopupSignInResult) => void) | undefined;

  const completion = new Promise<GithubPopupSignInResult>((resolve) => {
    let checking = false;
    let finished = false;
    // eslint-disable-next-line prefer-const
    let interval: number | undefined;

    const finish = (result: GithubPopupSignInResult) => {
      if (finished) return;
      finished = true;
      if (interval !== undefined) window.clearInterval(interval);
      window.removeEventListener('message', handleMessage);
      try {
        if (!popup.closed) popup.close();
      } catch {
        // Best-effort popup cleanup. Session state is canonical.
      }
      resolve(result);
    };
    settle = finish;

    const confirmAuthenticatedSession = async (): Promise<boolean> => {
      if (checking || finished) return false;
      checking = true;
      try {
        const session = await service.getSession();
        if (session.ok && session.data.session) {
          finish({ kind: 'authenticated' });
          return true;
        }
        return false;
      } finally {
        checking = false;
      }
    };

    function handleMessage(event: MessageEvent<unknown>) {
      if (event.origin !== window.location.origin || event.source !== popup) return;
      const data = event.data as Partial<OAuthPopupCompleteMessage> | null;
      if (
        data?.type !== 'memoflow:oauth-popup-complete' ||
        data.provider !== 'github' ||
        data.requestId !== requestId
      ) {
        return;
      }
      void confirmAuthenticatedSession();
    }

    // Register the trusted completion channel before provider navigation so a
    // pre-authorized GitHub account cannot race the listener on a fast return.
    window.addEventListener('message', handleMessage);

    interval = window.setInterval(async () => {
      if (finished) return;
      if (Date.now() >= deadline) {
        finish({ kind: 'cancelled' });
        return;
      }

      const authenticated = await confirmAuthenticatedSession();
      if (authenticated || finished) return;

      try {
        if (popup.closed) finish({ kind: 'cancelled' });
      } catch {
        // Cross-origin popup lifecycle checks are best-effort.
      }
    }, pollIntervalMs);
  });

  try {
    popup.location.replace(started.data.url);
  } catch (cause) {
    settle?.({
      kind: 'failed',
      error: {
        code: 'GITHUB_AUTH_WINDOW_FAILED',
        message: 'Unable to open the GitHub sign-in window.',
        cause,
      },
    });
  }

  return await completion;
}
