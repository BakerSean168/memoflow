import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateDesktopRuntimeValidations } from './desktop-runtime-validations.mjs';
import { validateMacosTrustReceipt } from './verify-macos-trust.mjs';

const [root, tag, gitSha, output] = process.argv.slice(2);
if (!root || !tag || !gitSha || !output) {
  throw new Error('usage: create-desktop-manifest.mjs <artifact-root> <tag> <git-sha> <output>');
}

const REQUIRED_PLATFORMS = Object.freeze(['windows-x64', 'linux-x64', 'macos-x64', 'macos-arm64']);
const selected = (name) =>
  /(?:\.exe|\.zip|\.dmg|\.blockmap|\.AppImage|\.deb|\.rpm|latest.*\.ya?ml)$/u.test(name);

async function findReceipts(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const receipts = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) receipts.push(...(await findReceipts(absolute)));
    else if (entry.isFile() && entry.name === 'desktop-platform-receipt.json') {
      receipts.push(absolute);
    }
  }
  return receipts;
}

const receiptFiles = (await findReceipts(root)).sort();
if (receiptFiles.length === 0) {
  throw new Error(`no desktop platform receipts found under ${root}`);
}

const receipts = [];
const assets = [];
const names = new Set();
for (const receiptFile of receiptFiles) {
  const receipt = JSON.parse(await readFile(receiptFile, 'utf8'));
  if (receipt.kind !== 'desktop-platform-receipt' || receipt.schemaVersion !== 2) {
    throw new Error(`invalid Desktop platform receipt: ${receiptFile}`);
  }
  if (
    receipt.tag !== tag ||
    receipt.version !== tag.replace(/^v/u, '') ||
    receipt.gitSha !== gitSha
  ) {
    throw new Error(`Desktop platform receipt identity mismatch: ${receipt.platform}`);
  }
  if (
    receipt.runtimeValidation?.status !== 'passed' ||
    receipt.runtimeValidation?.method !== 'packaged-electron-playwright' ||
    !receipt.runtimeValidation?.executableKind
  ) {
    throw new Error(`Desktop platform runtime validation missing or failed: ${receipt.platform}`);
  }
  receipt.runtimeValidations = validateDesktopRuntimeValidations(receipt, receipt.platform);
  if (receipt.os === 'macos' && receipt.signingState === 'signed-notarized') {
    try {
      const trust = validateMacosTrustReceipt(receipt.trustValidation);
      if (trust.platform !== receipt.platform || trust.arch !== receipt.arch) {
        throw new Error('trust receipt platform identity mismatch');
      }
    } catch (error) {
      throw new Error(
        `signed macOS platform trust validation missing or failed: ${receipt.platform}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (
    receipt.os === 'macos' &&
    receipt.signingState === 'unsigned-pilot' &&
    receipt.trustValidation
  ) {
    throw new Error(
      `unsigned macOS pilot must not carry signed trust evidence: ${receipt.platform}`,
    );
  }
  const directory = path.dirname(receiptFile);
  const actualNames = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && selected(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(actualNames) !== JSON.stringify([...receipt.assets].sort())) {
    throw new Error(`Desktop platform receipt asset list mismatch: ${receipt.platform}`);
  }
  for (const name of actualNames) {
    if (names.has(name)) throw new Error(`duplicate Desktop release asset name: ${name}`);
    names.add(name);
    const file = path.join(directory, name);
    const body = await readFile(file);
    const size = (await stat(file)).size;
    if (size <= 0) throw new Error(`empty Desktop release asset: ${name}`);
    assets.push({
      name,
      platform: receipt.platform,
      os: receipt.os,
      arch: receipt.arch,
      signingState: receipt.signingState,
      sha256: createHash('sha256').update(body).digest('hex'),
      size,
    });
  }
  receipts.push(receipt);
}

const platforms = new Map();
for (const receipt of receipts) {
  if (platforms.has(receipt.platform)) {
    throw new Error(`duplicate Desktop platform receipt: ${receipt.platform}`);
  }
  platforms.set(receipt.platform, receipt);
}
for (const platform of REQUIRED_PLATFORMS) {
  if (!platforms.has(platform)) throw new Error(`missing required Desktop platform: ${platform}`);
}
if (platforms.size !== REQUIRED_PLATFORMS.length) {
  throw new Error(`unexpected Desktop platforms: ${[...platforms.keys()].sort().join(',')}`);
}

const platformEvidence = Object.fromEntries(
  REQUIRED_PLATFORMS.map((platform) => {
    const receipt = platforms.get(platform);
    return [
      platform,
      {
        os: receipt.os,
        arch: receipt.arch,
        signingState: receipt.signingState,
        runtimeValidation: receipt.runtimeValidation,
        runtimeValidations: receipt.runtimeValidations,
        trustValidation: receipt.trustValidation ?? null,
        assets: receipt.assets,
      },
    ];
  }),
);

const manifest = {
  schemaVersion: 2,
  kind: 'desktop-release',
  version: tag.replace(/^v/u, ''),
  tag,
  gitSha,
  requiredPlatforms: REQUIRED_PLATFORMS,
  platforms: platformEvidence,
  assets: assets.sort((left, right) => left.name.localeCompare(right.name)),
};
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
