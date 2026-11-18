import { app } from 'electron';
import { buildDesktopUserAgent } from '@memoflow/cloud-auth-contracts';

const PLATFORM_LABELS: Partial<Record<NodeJS.Platform, string>> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
};

/**
 * User-Agent for cloud auth requests made by the desktop main process.
 *
 * Node's fetch sends a bare `node` User-Agent, which becomes the session title
 * in the account device list. Announce the app instead so new sessions are
 * readable without client-side guessing.
 */
export function desktopClientUserAgent(): string {
  return buildDesktopUserAgent(
    app.getVersion(),
    PLATFORM_LABELS[process.platform] ?? process.platform,
  );
}
