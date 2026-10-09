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
    <div style="height:100%;display:flex;align-items:center;justify-content:center;padding:24px;background:#111827;color:#f9fafb;font-family:system-ui,sans-serif;">
      <div style="max-width:720px;">
        <h1 style="margin:0 0 12px;font-size:20px;">Desktop renderer failed</h1>
        <pre style="white-space:pre-wrap;word-break:break-word;background:#1f2937;padding:12px;border-radius:8px;overflow:auto;">${escapeHtml(
          formatError(error),
        )}</pre>
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
    const { bootstrapCustomNotification } = await import('./bootstrap/custom-notification');
    await bootstrapCustomNotification();
    return;
  }
  if (isInterventionWindowHashRoute(hashPath)) {
    const { bootstrapInterventionWindow } = await import('./bootstrap/intervention-window');
    await bootstrapInterventionWindow();
    return;
  }

  if (isFocusWindowHashRoute(hashPath)) {
    const { bootstrapFocusWindow } = await import('./bootstrap/focus-window');
    await bootstrapFocusWindow();
    return;
  }

  if (isProfileAccessHashRoute(hashPath)) {
    const { bootstrapAuthApp } = await import('./bootstrap/auth');
    await bootstrapAuthApp();
    return;
  }

  const { bootstrapMainApp } = await import('./bootstrap/app');
  await bootstrapMainApp();
}

startRenderer().catch((error) => {
  renderStartupError(error);
});
