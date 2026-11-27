/**
 * Desktop renderer entry dispatcher.
 *
 * Keep startup tiny so `#/profile-access` can boot without paying for the entire
 * authenticated renderer shell.
 */
import { applyDocumentIcons, logo128, logoIco } from '@memoflow/assets';
// Residual 943: escapeHtml dual retired — @memoflow/utils/shared sole helper.
import { escapeHtml } from '@memoflow/utils/shared';

import './styles/index.css';
// Residual 941: host bridge via ensureElectronBridgeAvailable sole helper.
import { ensureElectronBridgeAvailable } from './platform/electron-bridge';
import { isNonFatalResizeObserverNotification } from './startup-error-classification';

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

function renderStartupError(error: unknown): void {
  console.error('[DesktopRenderer] Unhandled renderer error', error);

  const mountTarget = document.querySelector('#app');
  if (!mountTarget) {
    return;
  }

  mountTarget.innerHTML = `
    <style>
      .startup-error {
        box-sizing: border-box;
        display: flex;
        height: 100%;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: #111827;
        color: #f9fafb;
        font-family: system-ui, sans-serif;
      }
      .startup-error__body {
        max-width: 720px;
      }
      .startup-error__title {
        margin: 0 0 12px;
        font-size: 20px;
      }
      .startup-error__stack {
        overflow: auto;
        padding: 12px;
        border-radius: 8px;
        background: #1f2937;
        white-space: pre-wrap;
        word-break: break-word;
      }
    </style>
    <div class="startup-error">
      <div class="startup-error__body">
        <h1 class="startup-error__title">Desktop renderer failed</h1>
        <pre class="startup-error__stack">${escapeHtml(formatError(error))}</pre>
      </div>
    </div>
  `;
}

function getHashPath(): string {
  const hash = window.location.hash;
  const rawPath = hash.startsWith('#') ? hash.slice(1) : hash;
  const [path = '/'] = rawPath.split(/[?#]/, 1);
  return path || '/';
}

function isProfileAccessHashRoute(path: string): boolean {
  return path === '/profile-access' || path.startsWith('/profile-access/');
}

function isInterventionWindowHashRoute(path: string): boolean {
  return path === '/intervention-window' || path.startsWith('/intervention-window/');
}

function isFocusWindowHashRoute(path: string): boolean {
  return path === '/focus-window' || path.startsWith('/focus-window/');
}

async function loadBootstrap<T>(load: () => Promise<T>): Promise<T> {
  if (!import.meta.env.DEV) {
    return load();
  }

  const reloadKey = 'memoflow:renderer-bootstrap-reloads';
  const retryDelays = [300, 800, 1500, 3000];
  for (let attempt = 1; ; attempt += 1) {
    try {
      const bootstrap = await load();
      try {
        window.sessionStorage.removeItem(reloadKey);
      } catch {
        // Storage can be unavailable; a successful import can still boot.
      }
      return bootstrap;
    } catch (error) {
      console.warn(`[DesktopRenderer] Bootstrap import attempt ${attempt}/5 failed`, error);
      const delay = retryDelays[attempt - 1];
      if (delay === undefined) {
        let reloadCount: number;
        try {
          const storedCount = Number(window.sessionStorage.getItem(reloadKey) ?? 0);
          reloadCount = Number.isInteger(storedCount) && storedCount >= 0 ? storedCount : 0;
          if (reloadCount < 3) {
            window.sessionStorage.setItem(reloadKey, String(reloadCount + 1));
          }
        } catch {
          // Without persistent accounting, reloading could loop indefinitely.
          throw error;
        }

        if (reloadCount >= 3) {
          throw new Error(`${formatError(error)}\nBootstrap page reloads: ${reloadCount}`);
        }

        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        window.location.reload();
        // The next document owns startup; keep this one out of the error page.
        return new Promise<T>(() => {});
      }
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function startRenderer() {
  applyDocumentIcons({
    faviconHref: logoIco,
    appleTouchIconHref: logo128,
  });

  window.addEventListener('error', (event) => {
    if (isNonFatalResizeObserverNotification(event)) {
      event.preventDefault();
      console.warn('[DesktopRenderer] Non-fatal ResizeObserver notification', event.message);
      return;
    }

    renderStartupError(event.error ?? event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    renderStartupError(event.reason);
  });

  ensureElectronBridgeAvailable();

  // Vite library mode emits component styles separately from app-vue's JS.
  // Development aliases load Vue source styles; packaged builds need this asset
  // before mounting any shared surface (including Profile/access windows).
  if (import.meta.env.PROD) {
    await import('./styles/components.css');
  }

  const hashPath = getHashPath();
  if (hashPath === '/custom-notification' || hashPath.startsWith('/custom-notification/')) {
    const { bootstrapCustomNotification } = await loadBootstrap(
      () => import('./bootstrap/custom-notification'),
    );
    await bootstrapCustomNotification();
    return;
  }
  if (isInterventionWindowHashRoute(hashPath)) {
    const { bootstrapInterventionWindow } = await loadBootstrap(
      () => import('./bootstrap/intervention-window'),
    );
    await bootstrapInterventionWindow();
    return;
  }

  if (isFocusWindowHashRoute(hashPath)) {
    const { bootstrapFocusWindow } = await loadBootstrap(() => import('./bootstrap/focus-window'));
    await bootstrapFocusWindow();
    return;
  }

  if (isProfileAccessHashRoute(hashPath)) {
    const { bootstrapAuthApp } = await loadBootstrap(() => import('./bootstrap/auth'));
    await bootstrapAuthApp();
    return;
  }

  const { bootstrapMainApp } = await loadBootstrap(() => import('./bootstrap/app'));
  await bootstrapMainApp();
}

startRenderer().catch((error) => {
  renderStartupError(error);
});
