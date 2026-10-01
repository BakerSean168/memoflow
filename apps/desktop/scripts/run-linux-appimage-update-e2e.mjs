import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, openSync } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [baseArg, feedArg, expectedVersion, reportArg, runtimeArg, timeoutArg = '300'] =
  process.argv.slice(2);
const timeoutSeconds = Number(timeoutArg);
if (
  process.platform !== 'linux' ||
  !baseArg ||
  !feedArg ||
  !reportArg ||
  !runtimeArg ||
  !/^\d+\.\d+\.\d+$/u.test(expectedVersion ?? '') ||
  !Number.isInteger(timeoutSeconds) ||
  timeoutSeconds < 1 ||
  timeoutSeconds > 600
) {
  throw new Error(
    'usage: run-linux-appimage-update-e2e.mjs <base-AppImage> <candidate-feed-dir> <expected-version> <report> <fresh-runtime-dir> [timeout-seconds:1..600] (Linux only)',
  );
}
const baseAppImage = path.resolve(baseArg);
const candidateFeedDir = path.resolve(feedArg);
const reportPath = path.resolve(reportArg);
const runtimeRoot = path.resolve(runtimeArg);
const executable = path.join(runtimeRoot, 'MemoFlow.AppImage');
const userDataPath = path.join(runtimeRoot, 'user-data');
const userFilesPath = path.join(runtimeRoot, 'user-files');
const statusPath = path.join(runtimeRoot, 'status.json');
const registryPath = path.join(userDataPath, 'shared/profiles/registry.json');
const sentinelPath = path.join(userDataPath, 'shared/update-e2e-preservation.txt');
const receiptPath = path.join(userDataPath, 'shared/update/install-receipt.json');
const metadataPath = path.join(candidateFeedDir, 'latest-linux.yml');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileHash = async (file) => {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
};
const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
};
async function readStatus() {
  try {
    return JSON.parse(await readFile(statusPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Match the Windows runner's semantic fields, excluding incidental registry timestamps.
async function registryHash() {
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  if (registry.version !== 2 || !Array.isArray(registry.profiles)) {
    throw new Error('invalid Profile registry');
  }
  const fields = [
    'profileId',
    'profileKind',
    'localOwnerId',
    'displayName',
    'avatarSeed',
    'keyEnvelopeId',
    'identifier',
    'cloudBinding',
    'createdAt',
    'hasSnapshot',
    'lastSnapshotVersion',
    'lastSnapshotHydratedAt',
    'status',
  ];
  const profiles = [...registry.profiles]
    .sort((a, b) => a.profileId.localeCompare(b.profileId))
    .map((profile) => Object.fromEntries(fields.map((key) => [key, profile[key] ?? null])));
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical(value[key])]),
      );
    }
    return value;
  };
  return hash(
    JSON.stringify(
      canonical({ version: registry.version, activeProfileId: registry.activeProfileId, profiles }),
    ),
  );
}

// AppImageUpdater force-runs N+1 in a detached session. Scope cleanup to our
// isolated userData environment, including that candidate and its renderers.
async function ownedProcesses() {
  const processes = [];
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/u.test(name) || Number(name) === process.pid) continue;
    try {
      const env = (await readFile(`/proc/${name}/environ`, 'utf8')).split('\0');
      if (env.includes(`MEMOFLOW_DESKTOP_USER_DATA_PATH=${userDataPath}`)) {
        processes.push({
          pid: Number(name),
          command: (await readFile(`/proc/${name}/cmdline`, 'utf8')).replaceAll('\0', ' '),
        });
      }
    } catch (error) {
      if (!['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes(error.code)) throw error;
    }
  }
  return processes;
}

const candidates = (await readdir(candidateFeedDir, { withFileTypes: true })).filter(
  (entry) => entry.isFile() && entry.name.endsWith('.AppImage'),
);
if (candidates.length !== 1) throw new Error('candidate feed must contain exactly one AppImage');
const candidate = path.join(candidateFeedDir, candidates[0].name);
const baseSha256 = await fileHash(baseAppImage);
const candidateSha256 = await fileHash(candidate);
const metadataSha256 = await fileHash(metadataPath);
if (baseSha256 === candidateSha256) throw new Error('base and candidate AppImages must differ');
// Refuse reuse rather than deleting a user-supplied directory or accepting stale status.
await mkdir(runtimeRoot);
await mkdir(path.dirname(registryPath), { recursive: true });
await writeJson(registryPath, { version: 2, activeProfileId: null, profiles: [] });
await writeFile(sentinelPath, 'memoflow-update-e2e-preserve\n');
await copyFile(baseAppImage, executable);
await chmod(executable, 0o755);
const sentinelBefore = await fileHash(sentinelPath);
const log = openSync(path.join(runtimeRoot, 'base-process.log'), 'w');
const allowedFiles = new Set(['latest-linux.yml', candidates[0].name]);
const server = createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname.slice(1));
    if (!['GET', 'HEAD'].includes(request.method) || !allowedFiles.has(name)) {
      response.writeHead(404).end();
      return;
    }
    const file = path.join(candidateFeedDir, name);
    const { size } = await stat(file);
    // Full responses also support electron-updater's differential fallback.
    response.writeHead(200, { 'Content-Length': size, 'Content-Type': 'application/octet-stream' });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
let child;
let childError;
let registryBefore;
let finalStatus;
let lastPhase;
const abort = new AbortController();
const onSignal = () => abort.abort();
process.once('SIGTERM', onSignal);
process.once('SIGINT', onSignal);
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const feedUrl = `http://127.0.0.1:${server.address().port}`;
  // Do not manufacture APPIMAGE: the actual AppImage launcher must set it.
  const env = {
    ...process.env,
    CI: 'true',
    APPIMAGE_EXTRACT_AND_RUN: '1',
    MEMOFLOW_DESKTOP_UPDATE_E2E: '1',
    MEMOFLOW_DESKTOP_UPDATE_E2E_EXPECTED_VERSION: expectedVersion,
    MEMOFLOW_DESKTOP_UPDATE_E2E_STATUS_PATH: statusPath,
    MEMOFLOW_DESKTOP_UPDATE_E2E_FEED_URL: feedUrl,
    MEMOFLOW_DESKTOP_USER_DATA_PATH: userDataPath,
    MEMOFLOW_DESKTOP_USER_FILES_PATH: userFilesPath,
  };
  delete env.APPIMAGE;
  child = spawn(executable, [], { env, detached: true, stdio: ['ignore', log, log] });
  child.on('error', (error) => {
    childError = error;
  });
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    if (childError) throw childError;
    const status = await readStatus();
    if (status) {
      if (status.expectedVersion !== expectedVersion)
        throw new Error('status expected version mismatch');
      if (status.phase !== lastPhase) {
        console.log(`[update-e2e] phase=${status.phase} current=${status.currentVersion}`);
        lastPhase = status.phase;
      }
      if (status.phase === 'failed') throw new Error(`Desktop Update E2E failed: ${status.detail}`);
      if (!registryBefore && status.currentVersion !== expectedVersion)
        registryBefore = await registryHash();
      if (status.phase === 'candidate-verified') {
        finalStatus = status;
        break;
      }
    }
    await delay(100, undefined, { signal: abort.signal });
  }
  if (!finalStatus)
    throw new Error(`AppImage E2E did not reach candidate-verified within ${timeoutSeconds}s`);
  if (finalStatus.currentVersion !== expectedVersion)
    throw new Error('candidate reported wrong version');
  if (!registryBefore)
    throw new Error('base Profile registry semantic fingerprint was never captured');
  const installedSha256 = await fileHash(executable);
  if (installedSha256 !== candidateSha256)
    throw new Error('stable AppImage path was not replaced by candidate bytes');
  try {
    await stat(receiptPath);
    throw new Error('update receipt still exists after candidate verification');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const registryAfter = await registryHash();
  const sentinelAfter = await fileHash(sentinelPath);
  if (registryBefore !== registryAfter)
    throw new Error('Profile registry semantic identity changed across update');
  if (sentinelBefore !== sentinelAfter)
    throw new Error('userData preservation sentinel changed across update');
  await copyFile(metadataPath, path.join(runtimeRoot, 'latest-linux.yml'));
  await writeJson(reportPath, {
    kind: 'desktop-update-installed-e2e',
    schemaVersion: 1,
    platform: 'linux-appimage',
    result: 'passed',
    expectedVersion,
    feedUrl,
    baseAppImage: { name: path.basename(baseAppImage), sha256: baseSha256 },
    candidate: {
      appImage: candidates[0].name,
      appImageSha256: candidateSha256,
      metadata: 'latest-linux.yml',
      metadataSha256,
    },
    installedExecutable: executable,
    installedSha256,
    profileRegistrySemanticSha256Before: registryBefore,
    profileRegistrySemanticSha256After: registryAfter,
    preservationSentinelSha256Before: sentinelBefore,
    preservationSentinelSha256After: sentinelAfter,
    receiptCleared: true,
    finalStatus,
  });
  console.log(`[update-e2e] PASS report=${reportPath}`);
} catch (error) {
  await writeJson(path.join(runtimeRoot, 'failure-diagnostics.json'), {
    error: String(error),
    status: await readStatus().catch(() => null),
    basePid: child?.pid,
    baseExitCode: child?.exitCode,
    processes: await ownedProcesses(),
    executable,
  });
  throw error;
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (child?.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  for (const { pid } of await ownedProcesses()) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  closeSync(log);
  process.removeListener('SIGTERM', onSignal);
  process.removeListener('SIGINT', onSignal);
}
