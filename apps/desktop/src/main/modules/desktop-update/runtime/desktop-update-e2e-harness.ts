import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { DesktopUpdateSnapshotDTO } from '@memoflow/contracts/electron';
import type { DesktopUpdateFeed } from '../application/desktop-update-engine';
import type { DesktopUpdateInstallReceiptStore } from '../application/desktop-update-install-receipt';

export interface DesktopUpdateE2EConfig {
  readonly expectedVersion: string;
  readonly statusPath: string;
  readonly feed: DesktopUpdateFeed;
  readonly readyTimeoutMs: number;
}

export interface DesktopUpdateE2EUpdatePort {
  getSnapshot(): DesktopUpdateSnapshotDTO;
  check(intent: 'explicit'): Promise<DesktopUpdateSnapshotDTO>;
  subscribe(listener: (snapshot: DesktopUpdateSnapshotDTO) => void): () => void;
}

export interface DesktopUpdateE2EInstallPort {
  requestRestartAndInstall(): Promise<DesktopUpdateSnapshotDTO>;
}

export interface DesktopUpdateE2EHarnessOptions {
  readonly config: DesktopUpdateE2EConfig;
  readonly currentVersion: string;
  readonly update: DesktopUpdateE2EUpdatePort;
  readonly install: DesktopUpdateE2EInstallPort;
  readonly receiptStore: DesktopUpdateInstallReceiptStore;
  readonly quitVerifiedCandidate: () => void;
  readonly failProcess: () => void;
  readonly now?: () => Date;
}

type DesktopUpdateE2EPhase =
  'candidate-verified' | 'checking' | 'ready' | 'install-requested' | 'failed';

interface DesktopUpdateE2EStatus {
  readonly phase: DesktopUpdateE2EPhase;
  readonly currentVersion: string;
  readonly expectedVersion: string;
  readonly updateState: DesktopUpdateSnapshotDTO['state']['type'];
  readonly recordedAt: string;
  readonly detail?: string;
}

const DEFAULT_READY_TIMEOUT_MS = 2 * 60 * 1000;

function nonEmpty(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

/**
 * Resolve the packaged-update E2E control plane.
 *
 * This path is deliberately impossible to enable for a normal production
 * launch: it requires Electron's packaged runtime, CI=true, and an explicit
 * opt-in flag. It never creates renderer IPC or a user-facing feed override.
 */
export function resolveDesktopUpdateE2EConfig(options: {
  readonly isPackaged: boolean;
  readonly env: Readonly<NodeJS.ProcessEnv>;
}): DesktopUpdateE2EConfig | null {
  if (
    !options.isPackaged ||
    options.env.CI !== 'true' ||
    options.env.MEMOFLOW_DESKTOP_UPDATE_E2E !== '1'
  ) {
    return null;
  }

  const expectedVersion = nonEmpty(options.env.MEMOFLOW_DESKTOP_UPDATE_E2E_EXPECTED_VERSION);
  const statusPath = nonEmpty(options.env.MEMOFLOW_DESKTOP_UPDATE_E2E_STATUS_PATH);
  const feedUrl = nonEmpty(options.env.MEMOFLOW_DESKTOP_UPDATE_E2E_FEED_URL);

  if (!expectedVersion || !statusPath || !feedUrl) {
    throw new Error('Desktop Update E2E requires expected version, status path, and feed URL');
  }

  const parsedFeedUrl = new URL(feedUrl);
  if (parsedFeedUrl.protocol !== 'http:' && parsedFeedUrl.protocol !== 'https:') {
    throw new Error('Desktop Update E2E feed must use http or https');
  }

  return Object.freeze({
    expectedVersion,
    statusPath: path.resolve(statusPath),
    feed: Object.freeze({
      provider: 'generic',
      url: parsedFeedUrl.toString().replace(/\/$/u, ''),
      channel: 'latest',
    }),
    readyTimeoutMs: DEFAULT_READY_TIMEOUT_MS,
  });
}

async function writeStatus(
  config: DesktopUpdateE2EConfig,
  status: DesktopUpdateE2EStatus,
): Promise<void> {
  await fs.mkdir(path.dirname(config.statusPath), { recursive: true });
  const temporaryPath = `${config.statusPath}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, config.statusPath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function waitForReady(
  update: DesktopUpdateE2EUpdatePort,
  timeoutMs: number,
): Promise<DesktopUpdateSnapshotDTO> {
  const current = update.getSnapshot();
  if (current.state.type === 'ready' || current.state.type === 'failed') return current;

  return await new Promise<DesktopUpdateSnapshotDTO>((resolve, reject) => {
    let settled = false;
    let unsubscribe = (): void => undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (snapshot: DesktopUpdateSnapshotDTO): void => {
      if (settled) return;
      if (snapshot.state.type !== 'ready' && snapshot.state.type !== 'failed') return;
      settled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      resolve(snapshot);
    };

    unsubscribe = update.subscribe(finish);
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      reject(new Error(`Desktop Update E2E did not reach ready within ${timeoutMs}ms`));
    }, timeoutMs);

    // Close the tiny race between the first read and subscription registration.
    finish(update.getSnapshot());
  });
}

/**
 * Drive a real packaged updater path without exposing a renderer test API.
 *
 * Base process:
 *   explicit check -> auto-download -> ready -> shared shutdown -> NSIS handoff
 *
 * Candidate process:
 *   startup receipt verification has already run; assert the durable receipt is
 *   cleared and write candidate-verified for the external Windows runner.
 */
export async function runDesktopUpdateE2EHarness(
  options: DesktopUpdateE2EHarnessOptions,
): Promise<void> {
  const now = options.now ?? (() => new Date());
  const makeStatus = (
    phase: DesktopUpdateE2EPhase,
    snapshot: DesktopUpdateSnapshotDTO,
    detail?: string,
  ): DesktopUpdateE2EStatus => ({
    phase,
    currentVersion: options.currentVersion,
    expectedVersion: options.config.expectedVersion,
    updateState: snapshot.state.type,
    recordedAt: now().toISOString(),
    ...(detail ? { detail } : {}),
  });

  try {
    if (options.currentVersion === options.config.expectedVersion) {
      const pendingReceipt = await options.receiptStore.read();
      if (pendingReceipt) {
        throw new Error(
          `candidate started but install receipt remains at stage ${pendingReceipt.stage}`,
        );
      }

      const snapshot = options.update.getSnapshot();
      await writeStatus(options.config, makeStatus('candidate-verified', snapshot));
      options.quitVerifiedCandidate();
      return;
    }

    await writeStatus(options.config, makeStatus('checking', options.update.getSnapshot()));

    await options.update.check('explicit');
    const ready = await waitForReady(options.update, options.config.readyTimeoutMs);
    if (ready.state.type === 'failed') {
      throw new Error(`update failed before ready: ${ready.state.failure.code}`);
    }
    if (ready.state.type !== 'ready') {
      throw new Error(`update reached unexpected terminal state: ${ready.state.type}`);
    }
    if (ready.state.release.version !== options.config.expectedVersion) {
      throw new Error(
        `unexpected update version ${ready.state.release.version}; expected ${options.config.expectedVersion}`,
      );
    }

    await writeStatus(options.config, makeStatus('ready', ready));
    await writeStatus(options.config, makeStatus('install-requested', ready));
    await options.install.requestRestartAndInstall();

    // quitAndInstall should terminate the old process. Give the handoff one
    // event-loop turn; the install coordinator's watchdog owns a hung process.
    await delay(0);
  } catch (error) {
    const snapshot = options.update.getSnapshot();
    await writeStatus(
      options.config,
      makeStatus(
        'failed',
        snapshot,
        error instanceof Error ? error.message : 'unknown Desktop Update E2E failure',
      ),
    ).catch(() => undefined);
    options.failProcess();
  }
}
