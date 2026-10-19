import { app } from 'electron';
import { LoggerFactory, createLogger } from '@memoflow/utils/logger';
import { WinstonLogger } from '@memoflow/utils/winston';
import { resolveDesktopStorageRoots, createSharedPathResolver } from './paths';
import { configureDesktopStorage } from './storage-bootstrap';
import type { SharedPathResolver } from './paths';

if (process.platform !== 'win32' && process.platform !== 'linux' && process.platform !== 'darwin') {
  throw new Error('Unsupported desktop storage platform');
}
export const desktopStorageRoots = resolveDesktopStorageRoots({
  platform: process.platform,
  channel:
    process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
      ? 'test'
      : app.isPackaged
        ? 'production'
        : 'development',
  home: app.getPath('home'),
  env: process.env,
  knownFolder: (folder) => (folder === 'roamingAppData' ? app.getPath('appData') : undefined),
  // Electron's getPath typings have no localAppData key. Resolve Local independently
  // from LOCALAPPDATA through the provider's env fallback; never derive it from Roaming.
});
configureDesktopStorage(app, desktopStorageRoots);
const sharedResolver = createSharedPathResolver(desktopStorageRoots);

// Configure logging to the new logs directory
process.env.LOG_DIR = sharedResolver.logsDir;

LoggerFactory.registerProvider((context) => new WinstonLogger(context));
LoggerFactory.configure({ enableInProduction: true, level: 'info' });

const logger = createLogger('DesktopRuntime');

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in Electron main process', error);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection in Electron main process', reason);
});

app.on('render-process-gone', (_event, _webContents, details) => {
  logger.error('Renderer process exited unexpectedly', details);
});

export function getSharedPathResolver(): SharedPathResolver {
  return sharedResolver;
}
