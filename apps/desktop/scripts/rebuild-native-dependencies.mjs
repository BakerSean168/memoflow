import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

const REQUIRED_MODULES = ['argon2', 'better-sqlite3'];

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function normalizePlatform(value) {
  const aliases = {
    windows: 'win32',
    win32: 'win32',
    linux: 'linux',
    macos: 'darwin',
    darwin: 'darwin',
  };
  const normalized = aliases[value];
  if (!normalized) throw new Error(`Unsupported Electron rebuild platform: ${value}`);
  return normalized;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultWorkspaceRoot = path.resolve(scriptDir, '../../..');
const args = parseArgs(process.argv.slice(2));
const workspaceRoot = path.resolve(args['workspace-root'] ?? defaultWorkspaceRoot);
const desktopRoot = path.join(workspaceRoot, 'apps', 'desktop');
const platform = normalizePlatform(args.platform ?? process.platform);
const arch = args.arch ?? process.arch;

if (!['x64', 'arm64'].includes(arch)) {
  throw new Error(`Unsupported Electron rebuild architecture: ${arch}`);
}

const packageJson = JSON.parse(await readFile(path.join(workspaceRoot, 'package.json'), 'utf8'));
const electronVersion = packageJson.devDependencies?.electron;
if (!electronVersion)
  throw new Error('Workspace package.json does not declare devDependencies.electron');

// Resolve @electron/rebuild from the workspace being packaged. This also works
// when the helper comes from a separate release-tooling checkout.
const workspaceRequire = createRequire(path.join(workspaceRoot, 'package.json'));
const rebuildEntry = workspaceRequire.resolve('@electron/rebuild');
const { rebuild } = await import(pathToFileURL(rebuildEntry).href);

const task = rebuild({
  buildPath: desktopRoot,
  projectRootPath: workspaceRoot,
  electronVersion,
  arch,
  platform,
  onlyModules: REQUIRED_MODULES,
  force: true,
  mode: 'sequential',
  disablePreGypCopy: true,
});

let foundModules = [];
task.lifecycle.on('modules-found', (modules) => {
  foundModules = modules;
});

await task;
for (const moduleName of REQUIRED_MODULES) {
  if (!foundModules.includes(moduleName)) {
    throw new Error(`Electron rebuild did not discover required native module: ${moduleName}`);
  }
}

console.log(
  `[desktop-native-rebuild] Electron ${electronVersion} ${platform}/${arch}: ${foundModules.join(', ')}`,
);
