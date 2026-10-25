import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '../../..');
const require = createRequire(import.meta.url);

const rootPackage = JSON.parse(await readFile(path.join(workspaceRoot, 'package.json'), 'utf8'));
const workspaceConfig = await readFile(path.join(workspaceRoot, 'pnpm-workspace.yaml'), 'utf8');
const declaredVite = rootPackage.devDependencies?.vite;
const overrideMatch = workspaceConfig.match(/^\s{2}vite:\s*([^\s#]+)\s*$/mu);
const overrideVite = overrideMatch?.[1];
const resolvedVite = require('vite/package.json').version;
const resolvedRolldown = require('rolldown/package.json').version;

function versionTuple(value) {
  return String(value)
    .split(/[.-]/u)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function atLeast(actual, minimum) {
  const left = versionTuple(actual);
  const right = versionTuple(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true;
    if (left[index] < right[index]) return false;
  }
  return true;
}

if (!declaredVite || !overrideVite) {
  throw new Error(
    'Desktop build requires Vite to be declared in package.json and pnpm-workspace.yaml overrides',
  );
}
if (declaredVite !== overrideVite || resolvedVite !== declaredVite) {
  throw new Error(
    `Desktop Vite version drift: package=${declaredVite}, override=${overrideVite}, resolved=${resolvedVite}`,
  );
}
if (!atLeast(resolvedRolldown, '1.2.1')) {
  throw new Error(`Desktop build requires Rolldown >=1.2.1, resolved ${resolvedRolldown}`);
}

console.log(
  `[verify-build-toolchain] Vite ${resolvedVite} / Rolldown ${resolvedRolldown} verified for Desktop build`,
);
