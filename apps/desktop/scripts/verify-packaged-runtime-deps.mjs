import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as asar from '@electron/asar';
import {
  electronExternalWorkspacePackages,
  electronJsExternalPackages,
  electronNativeRuntimePackages,
  nativeLoaderRuntimePackages,
  powerSyncRuntimePackages,
} from '../runtime-external.config.mjs';

const require = createRequire(import.meta.url);
const desktopRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(desktopRoot, '..', '..');
const requestedDistRoot = process.env.DESKTOP_PACKAGE_OUTPUT_DIR;
const seenPackages = new Set();
const seenNativePackages = new Set();
const requiredUnpackedPackages = new Set(powerSyncRuntimePackages);
const requiredRuntimeLoaderPackages = new Set(nativeLoaderRuntimePackages);

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Residual 1198 keep-boundary: desktop packaged-deps readJson — filesystem path → parsed JSON.
 * Synchronous fs.readFileSync + JSON.parse for package.json inspection (throws on bad JSON).
 * Soft residual 1198: auth-web Response→unknown|null and e2e stream→Record differ (no force-merge).
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveWorkspacePackageJson(packageName) {
  if (!packageName.startsWith('@memoflow/')) {
    return null;
  }

  const packageDirName = packageName.split('/')[1];
  const candidatePaths = [
    path.join(workspaceRoot, 'packages', packageDirName, 'package.json'),
    path.join(workspaceRoot, 'apps', packageDirName, 'package.json'),
  ];

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

function resolvePackageJson(packageName) {
  const workspacePackageJson = resolveWorkspacePackageJson(packageName);
  if (workspacePackageJson) {
    return workspacePackageJson;
  }

  const packagePathParts = packageName.split('/');
  const directCandidatePaths = [
    path.join(desktopRoot, 'node_modules', ...packagePathParts, 'package.json'),
    path.join(workspaceRoot, 'node_modules', ...packagePathParts, 'package.json'),
  ];

  for (const candidatePath of directCandidatePaths) {
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  const resolvedEntry = require.resolve(packageName, {
    paths: [desktopRoot, workspaceRoot],
  });

  let currentDir = path.dirname(resolvedEntry);
  while (true) {
    const candidatePath = path.join(currentDir, 'package.json');
    if (fs.existsSync(candidatePath)) {
      const candidateJson = readJson(candidatePath);
      if (candidateJson.name === packageName) {
        return candidatePath;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  throw new Error(`Unable to resolve package.json for ${packageName}`);
}

// Per-package policies for native module dependency closure verification.
// Describes which dependency *edges* to prune when walking from a specific
// package.  This handles cases where upstream packages list install-time
// tooling in `dependencies` instead of `devDependencies`.
//
// Format:  { [packageName]: { ignoreSubtreesFrom: string[] } }
//   ignoreSubtreesFrom – when walking packageName's dependencies and
//   encountering one of these names, skip the entire subtree below it.
const nativeRuntimePolicies = {
  // argon2 install script: "cross-env ZERO_AR_DATE=1 node-gyp-build"
  //   cross-env     – only invoked during `npm install`, not at app runtime
  //   node-addon-api – C++ header files consumed by node-gyp at compile time
  // Kept in the runtime closure:
  //   @phc/format    – real JS runtime dependency
  //   node-gyp-build – can act as a bindings loader at runtime
  argon2: {
    ignoreSubtreesFrom: ['cross-env', 'node-addon-api'],
  },
  // better-sqlite3 loads `bindings` at runtime to locate the compiled addon,
  // but `prebuild-install` and everything below it is only used during install.
  'better-sqlite3': {
    ignoreSubtreesFrom: ['prebuild-install'],
  },
};

function collectRuntimeDependencyClosure(packageName, parentPackage = null) {
  if (seenPackages.has(packageName)) {
    return;
  }

  // Edge-based pruning: if the parent has a policy that ignores this edge,
  // skip this package and everything below it.
  const parentPolicy = parentPackage && nativeRuntimePolicies[parentPackage];
  if (parentPolicy?.ignoreSubtreesFrom?.includes(packageName)) {
    return;
  }

  seenPackages.add(packageName);

  const packageJsonPath = resolvePackageJson(packageName);
  const packageJson = readJson(packageJsonPath);
  const dependencies = packageJson.dependencies ?? {};

  for (const [dependencyName, dependencyVersion] of Object.entries(dependencies)) {
    if (String(dependencyVersion).startsWith('workspace:')) {
      continue;
    }
    collectRuntimeDependencyClosure(dependencyName, packageName);
  }
}

function findPackagedAsars(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const discovered = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === 'app.asar') {
        discovered.push(entryPath);
      }
    }
  }

  return discovered.sort();
}

function collectPackedFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return new Set();
  }

  return new Set(
    fs.readdirSync(rootDir, { recursive: true }).map((entry) => normalizePath(String(entry))),
  );
}

for (const packageName of [...electronJsExternalPackages, ...electronExternalWorkspacePackages]) {
  collectRuntimeDependencyClosure(packageName);
}
for (const packageName of electronNativeRuntimePackages) {
  collectRuntimeDependencyClosure(packageName);
  seenNativePackages.add(packageName);
}

const distRoots = [
  requestedDistRoot
    ? path.resolve(desktopRoot, requestedDistRoot)
    : path.join(desktopRoot, 'dist-package'),
];

const packagedAsars = distRoots.flatMap((rootDir) => findPackagedAsars(rootDir));
const resourceNodeModulesFiles = new Set(
  distRoots.flatMap((rootDir) => {
    const resourceNodeModulesRoot = path.join(rootDir, 'resources', 'node_modules');
    return [...collectPackedFiles(resourceNodeModulesRoot)];
  }),
);

if (packagedAsars.length === 0) {
  throw new Error(`No packaged app.asar found under ${distRoots.join(', ')}`);
}

for (const asarPath of packagedAsars) {
  const files = new Set(asar.listPackage(asarPath).map(normalizePath));
  const unpackedRoot = `${asarPath}.unpacked`;
  const unpackedFiles = collectPackedFiles(unpackedRoot);
  const missingPackages = [...seenPackages]
    .filter((packageName) => {
      if (requiredUnpackedPackages.has(packageName) || seenNativePackages.has(packageName)) {
        return (
          !unpackedFiles.has(`node_modules/${packageName}/package.json`) &&
          !resourceNodeModulesFiles.has(`${packageName}/package.json`) &&
          !files.has(`node_modules/${packageName}/package.json`)
        );
      }
      return !files.has(`node_modules/${packageName}/package.json`);
    })
    .sort();

  const missingUnpackedPackages = [...requiredUnpackedPackages]
    .filter((packageName) => !unpackedFiles.has(`node_modules/${packageName}/package.json`))
    .sort();

  const missingRuntimeLoaderPackages = [...requiredRuntimeLoaderPackages]
    .filter(
      (packageName) =>
        !unpackedFiles.has(`node_modules/${packageName}/package.json`) &&
        !resourceNodeModulesFiles.has(`${packageName}/package.json`) &&
        !files.has(`node_modules/${packageName}/package.json`),
    )
    .sort();

  if (
    missingPackages.length > 0 ||
    missingUnpackedPackages.length > 0 ||
    missingRuntimeLoaderPackages.length > 0
  ) {
    throw new Error(
      [
        `Packaged runtime dependency verification failed for ${asarPath}`,
        'Missing packages:',
        ...missingPackages.map((packageName) => `- ${packageName}`),
        ...(missingUnpackedPackages.length > 0 ? ['Missing unpacked packages:'] : []),
        ...missingUnpackedPackages.map((packageName) => `- ${packageName}`),
        ...(missingRuntimeLoaderPackages.length > 0 ? ['Missing runtime loader packages:'] : []),
        ...missingRuntimeLoaderPackages.map((packageName) => `- ${packageName}`),
      ].join('\n'),
    );
  }

  // Winston 3 requires the CommonJS is-stream 2 API. electron-builder's
  // hoister can otherwise place ESM-only is-stream 4 under Winston.
  const winstonIsStreamPath = [
    'node_modules/winston/node_modules/is-stream/package.json',
    'node_modules/is-stream/package.json',
  ].find((packagePath) => files.has(packagePath));
  const winstonIsStreamVersion = winstonIsStreamPath
    ? JSON.parse(asar.extractFile(asarPath, winstonIsStreamPath).toString()).version
    : undefined;
  if (!winstonIsStreamVersion?.startsWith('2.')) {
    throw new Error(
      `Packaged Winston requires is-stream 2, found ${winstonIsStreamVersion ?? 'none'} in ${asarPath}`,
    );
  }

  console.log(
    `[verify-packaged-runtime-deps] Verified ${seenPackages.size} runtime packages in ${asarPath}`,
  );
}
