/**
 * Runtime preflight: print active lane expectations and fail on hard port conflicts.
 *
 * Usage:
 *   node ./tools/runtime/preflight.mjs --profile e2e
 *   node ./tools/runtime/preflight.mjs --profile prod-like
 *   node ./tools/runtime/preflight.mjs --profile host-dev
 *   node ./tools/runtime/preflight.mjs --list
 */
import { createConnection } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getRuntimeProfile,
  listProfileSummaries,
  loadRuntimeProfiles,
  resolveProdLikeHostPorts,
} from './load-profiles.mjs';

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ profile: string | null, list: boolean, json: boolean, strict: boolean }} */
  const args = {
    profile: null,
    list: false,
    json: false,
    strict: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--list') {
      args.list = true;
    } else if (token === '--json') {
      args.json = true;
    } else if (token === '--strict') {
      args.strict = true;
    } else if (token === '--profile' || token === '-p') {
      args.profile = argv[i + 1] ?? null;
      i += 1;
    } else if (token.startsWith('--profile=')) {
      args.profile = token.slice('--profile='.length);
    }
  }

  return args;
}

/**
 * @param {string} path
 * @returns {Map<string, string>}
 */
function readEnvFileMap(path) {
  /** @type {Map<string, string>} */
  const values = new Map();
  if (!existsSync(path)) {
    return values;
  }

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/\s+#.*$/u, '').trim();
    values.set(key, value);
  }

  return values;
}

/**
 * @param {number} port
 * @param {string} host
 * @returns {Promise<boolean>}
 */
function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ port, host });
    const finish = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolvePromise(open);
    };

    socket.setTimeout(700);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/**
 * @param {string} url
 * @returns {Promise<{ ok: boolean, status?: number, body?: any, error?: string }>}
 */
async function fetchJson(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 200);
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * @param {string} profileName
 * @param {{ strict: boolean }} options
 */
async function runPreflight(profileName, options) {
  const profile = getRuntimeProfile(profileName);
  /** @type {string[]} */
  const info = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const errors = [];

  info.push(...listProfileSummaries(profileName));

  if (profileName === 'host-dev') {
    const localDevEnv = readEnvFileMap(resolve(process.cwd(), '.env.development.local'));
    const workstationWebUrl = localDevEnv.get('MEMOFLOW_WEB_URL');
    if (workstationWebUrl) {
      info.push(`  workstation.web=${workstationWebUrl}`);
    } else {
      warnings.push(
        'Tailnet workstation URL is not configured. Run: corepack pnpm run runtime:tailnet:host-dev',
      );
    }
  }

  if (profileName === 'prod-like') {
    const envMap = readEnvFileMap(resolve(process.cwd(), '.env.production.local'));
    const machineEnvMap = readEnvFileMap(resolve(process.cwd(), '.env.prod-like.local'));
    /** @type {Record<string, string>} */
    const hostPortEnv = {};
    for (const key of Object.keys(profile.hostPortEnv ?? {})) {
      if (envMap.has(key)) {
        hostPortEnv[key] = envMap.get(key) ?? '';
      }
      if (machineEnvMap.has(key)) {
        hostPortEnv[key] = machineEnvMap.get(key) ?? '';
      }
    }
    const resolved = resolveProdLikeHostPorts(hostPortEnv, {
      allowMachineOverride:
        machineEnvMap.get('LOCAL_DOCKER_MACHINE_PORTS')?.toLowerCase() === 'true',
    });
    warnings.push(...resolved.warnings);
    errors.push(...resolved.errors);
    info.push('  resolved host ports:');
    for (const [key, value] of Object.entries(resolved.forced)) {
      info.push(`    ${key}=${value}`);
    }
  }

  // Probe configured ports when the profile lives on this host. Production is
  // described here for topology/URL truth but is owned by the Alibaba watcher.
  if (profile.localProbe === false) {
    info.push('  local probes skipped: runtime is owned by a different host group');
  }

  for (const [name, port] of Object.entries(profile.ports ?? {})) {
    if (profile.localProbe === false) {
      continue;
    }
    const openLocal = await isPortOpen(port, '127.0.0.1');
    const openLocalhost = name === 'api' ? await isPortOpen(port, 'localhost') : openLocal;
    const open = openLocal || openLocalhost;
    info.push(`  probe.${name}:${port} => ${open ? 'OPEN' : 'closed'}`);

    if (profileName === 'e2e') {
      if (name === 'postgres' && !open) {
        warnings.push(`Test DB port ${port} is closed. Start with: pnpm docker:test:up`);
      }
      if (name === 'api' && open) {
        const health = await fetchJson(`http://127.0.0.1:${port}/healthz`);
        const lane = health.body && typeof health.body === 'object' ? health.body.lane : undefined;
        if (health.ok && lane === 'e2e') {
          info.push(`  api identity: lane=e2e (safe to reuse if E2E_REUSE_SERVERS=1)`);
        } else if (health.ok) {
          errors.push(
            `Port ${port} answers /healthz but lane=${lane ?? '(missing)'}. ` +
              `Likely Docker prod-like or host-dev API. Playwright must not reuse it. ` +
              `Fix: stop the conflicting runtime or free the port, then re-run e2e.`,
          );
        } else {
          warnings.push(
            `Port ${port} is open but /healthz is not healthy (${health.error ?? health.status}).`,
          );
        }
      }
      if (name === 'web' && open) {
        info.push(
          '  web port is open; Playwright may reuse Vite when reuseExistingServer allows it',
        );
      }
    }

    if (profileName === 'host-dev' && name === 'api' && open) {
      const health = await fetchJson(`http://127.0.0.1:${port}/healthz`);
      const lane = health.body && typeof health.body === 'object' ? health.body.lane : undefined;
      if (health.ok && lane === 'e2e') {
        warnings.push(
          `API :${port} reports lane=e2e (Playwright leftover). Prefer stopping it before host-dev work.`,
        );
      }
    }

    if (profileName === 'prod-like') {
      // For prod-like we only require isolation of host ports, not that stack is already up.
      if (name === 'api' || name === 'web' || name === 'postgres') {
        // no-op probes already logged
      }
    }
  }

  // Report prod-like presence while host-dev/e2e is active; distinct port blocks make coexistence safe.
  if (profileName === 'e2e' || profileName === 'host-dev') {
    const prodLike = getRuntimeProfile('prod-like');
    const localApiPort = prodLike.ports.api;
    const localApiOpen = await isPortOpen(localApiPort);
    if (localApiOpen) {
      info.push(
        `  note: prod-like API :${localApiPort} is up (ok; isolated by its own port block)`,
      );
    }
  }

  const hardFail = errors.length > 0 || (options.strict && warnings.length > 0);
  return {
    profile: profileName,
    info,
    warnings,
    errors,
    ok: !hardFail,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const doc = loadRuntimeProfiles();

  if (args.list || !args.profile) {
    if (!args.profile && !args.list) {
      console.log('Runtime profiles (SSOT: tools/runtime/profiles.json)\n');
    }
    const primary = doc.primaryEnvironments ?? [];
    if (primary.length) {
      console.log(`Primary environments: ${primary.join(', ')}\n`);
    }
    const ordered = [
      ...primary,
      ...Object.keys(doc.profiles).filter((name) => !primary.includes(name)),
    ];
    for (const name of ordered) {
      console.log(listProfileSummaries(name).join('\n'));
      console.log('');
    }
    if (!args.profile) {
      console.log(
        'Usage: node ./tools/runtime/preflight.mjs --profile <host-dev|prod-like|staging|prod|e2e|dev-infra|test-infra> [--strict]',
      );
      process.exit(args.list ? 0 : 0);
    }
  }

  const result = await runPreflight(/** @type {string} */ (args.profile), {
    strict: args.strict,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[runtime:preflight] profile=${result.profile}`);
    for (const line of result.info) {
      console.log(line);
    }
    for (const warning of result.warnings) {
      console.warn(`WARN  ${warning}`);
    }
    for (const error of result.errors) {
      console.error(`ERROR ${error}`);
    }
    console.log(result.ok ? '[runtime:preflight] OK' : '[runtime:preflight] FAILED');
  }

  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error('[runtime:preflight] crashed', error);
  process.exit(1);
});
