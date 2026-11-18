export type SessionDeviceClient =
  | 'desktop'
  | 'chrome'
  | 'edge'
  | 'firefox'
  | 'safari'
  | 'opera'
  | 'unknown';

export type SessionDeviceOs = 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';

export interface SessionDevice {
  client: SessionDeviceClient;
  os: SessionDeviceOs;
}

const DESKTOP_PREFIX = /^memoflow desktop\//i;
// The desktop main process used to send Node's bare `node` User-Agent.
const LEGACY_DESKTOP = /^node\b/i;

/**
 * Turns a stored session User-Agent into display tokens.
 *
 * The session API keeps the raw User-Agent so the value stays diagnostic; the
 * device list must not print it verbatim (a desktop session is literally
 * `node`, a browser session is a hundred characters of engine details).
 */
export function parseSessionUserAgent(userAgent: string | null | undefined): SessionDevice {
  const ua = userAgent?.trim() ?? '';
  if (!ua) return { client: 'unknown', os: 'unknown' };
  return { client: detectClient(ua), os: detectOs(ua) };
}

function detectClient(ua: string): SessionDeviceClient {
  if (DESKTOP_PREFIX.test(ua) || LEGACY_DESKTOP.test(ua)) return 'desktop';
  // Edge and Opera also advertise Chrome/ and Safari/.
  if (/\bEdg(?:[AE]|iOS)?\//.test(ua)) return 'edge';
  if (/\bOPR\/|\bOpera\//.test(ua)) return 'opera';
  if (/\bFirefox\/|\bFxiOS\//.test(ua)) return 'firefox';
  if (/\bChrome\/|\bCriOS\//.test(ua)) return 'chrome';
  if (/\bSafari\//.test(ua)) return 'safari';
  return 'unknown';
}

function detectOs(ua: string): SessionDeviceOs {
  // Android UAs also contain "Linux"; iPhone UAs contain "like Mac OS X".
  if (/Windows NT|\bWindows\b/.test(ua)) return 'windows';
  if (/Android/.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Mac OS X|Macintosh|macOS/.test(ua)) return 'macos';
  if (/CrOS|Linux|X11/.test(ua)) return 'linux';
  return 'unknown';
}
