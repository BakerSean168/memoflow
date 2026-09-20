/**
 * Runtime profile loader (SSOT for host ports / lanes).
 * @module tools/runtime/load-profiles
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_PATH = resolve(__dirname, 'profiles.json');

/**
 * @typedef {object} RuntimeProfile
 * @property {string} title
 * @property {string} [description]
 * @property {"environment" | "support"} [category]
 * @property {string} [hostGroup]
 * @property {string} [portBlock]
 * @property {string} [composeProject]
 * @property {boolean} [localProbe]
 * @property {Record<string, string>} [commands]
 * @property {Record<string, number>} ports
 * @property {Record<string, number>} [hostPortEnv]
 * @property {Record<string, string>} [urls]
 * @property {string} [runtimeLane]
 * @property {string[]} [mutexWith]
 */

/**
 * @typedef {object} RuntimeProfilesDocument
 * @property {number} version
 * @property {string} [description]
 * @property {string[]} [primaryEnvironments]
 * @property {Record<string, RuntimeProfile>} profiles
 */

/** @type {RuntimeProfilesDocument | null} */
let cached = null;

/**
 * @returns {RuntimeProfilesDocument}
 */
export function loadRuntimeProfiles() {
  if (cached) {
    return cached;
  }

  const raw = readFileSync(PROFILES_PATH, 'utf8');
  cached = JSON.parse(raw);
  return cached;
}

/**
 * @param {string} name
 * @returns {RuntimeProfile}
 */
export function getRuntimeProfile(name) {
  const doc = loadRuntimeProfiles();
  const profile = doc.profiles[name];
  if (!profile) {
    const known = Object.keys(doc.profiles).join(', ');
    throw new Error(`Unknown runtime profile "${name}". Known: ${known}`);
  }
  return profile;
}

/**
 * Host ports claimed by every profile except the named one.
 * @param {string} profileName
 * @returns {Map<number, string[]>}
 */
export function getPortsClaimedOutside(profileName) {
  const doc = loadRuntimeProfiles();
  /** @type {Map<number, string[]>} */
  const claimed = new Map();

  const selected = getRuntimeProfile(profileName);
  const selectedHostGroup = selected.hostGroup;

  for (const [name, profile] of Object.entries(doc.profiles)) {
    if (name === profileName || profile.hostGroup !== selectedHostGroup) {
      continue;
    }
    for (const port of Object.values(profile.ports ?? {})) {
      const list = claimed.get(port) ?? [];
      list.push(name);
      claimed.set(port, list);
    }
  }

  return claimed;
}

/**
 * Resolve prod-like host port env map from SSOT, with an explicit opt-in for
 * a gitignored machine-local override.
 * @param {Record<string, string | number | undefined>} hostPortEnv
 * @param {{ allowMachineOverride?: boolean }} [options]
 * @returns {{ ok: boolean, forced: Record<string, string>, warnings: string[], errors: string[] }}
 */
export function resolveProdLikeHostPorts(hostPortEnv = {}, options = {}) {
  const profile = getRuntimeProfile('prod-like');
  const expected = profile.hostPortEnv ?? {};
  const claimedOutside = getPortsClaimedOutside('prod-like');
  const allowMachineOverride = options.allowMachineOverride === true;

  /** @type {Record<string, string>} */
  const forced = {};
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const errors = [];

  const selectedPorts = new Map();

  for (const [key, expectedPort] of Object.entries(expected)) {
    const expectedValue = String(expectedPort);
    const raw = hostPortEnv[key];
    const current = raw === undefined || raw === null || raw === '' ? null : String(raw).trim();

    if (!current) {
      forced[key] = expectedValue;
      warnings.push(`${key} is unset; using SSOT value ${expectedValue}`);
      continue;
    }

    if (current === expectedValue) {
      forced[key] = expectedValue;
      selectedPorts.set(Number(expectedValue), key);
      continue;
    }

    const numeric = Number(current);
    if (allowMachineOverride) {
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > 65535) {
        errors.push(`${key}=${current} is not a valid TCP port`);
        continue;
      }
      if (claimedOutside.has(numeric)) {
        errors.push(
          `${key}=${current} collides with reserved host port for [${claimedOutside
            .get(numeric)
            ?.join(', ')}]`,
        );
        continue;
      }
      if (selectedPorts.has(numeric)) {
        errors.push(`${key}=${current} duplicates ${selectedPorts.get(numeric)}`);
        continue;
      }

      forced[key] = current;
      selectedPorts.set(numeric, key);
      continue;
    }

    const collides = Number.isFinite(numeric) && claimedOutside.has(numeric);
    const reason = collides
      ? `collides with reserved host port for [${claimedOutside.get(numeric)?.join(', ')}]`
      : 'differs from SSOT prod-like contract';

    warnings.push(`${key}=${current} ${reason}; forcing SSOT ${expectedValue}`);
    forced[key] = expectedValue;
  }

  return {
    ok: errors.length === 0,
    forced,
    warnings,
    errors,
  };
}

/**
 * @param {string} profileName
 * @returns {string[]}
 */
export function listProfileSummaries(profileName) {
  const profile = getRuntimeProfile(profileName);
  const lines = [
    `profile: ${profileName} — ${profile.title}`,
    profile.description ? `  ${profile.description}` : null,
    profile.category ? `  category=${profile.category}` : null,
    profile.hostGroup ? `  hostGroup=${profile.hostGroup}` : null,
    profile.portBlock ? `  portBlock=${profile.portBlock}` : null,
    profile.composeProject ? `  composeProject=${profile.composeProject}` : null,
  ].filter(Boolean);

  for (const [name, port] of Object.entries(profile.ports ?? {})) {
    lines.push(`  port.${name}=${port}`);
  }
  for (const [name, url] of Object.entries(profile.urls ?? {})) {
    lines.push(`  url.${name}=${url}`);
  }
  for (const [name, command] of Object.entries(profile.commands ?? {})) {
    lines.push(`  cmd.${name}=${command}`);
  }
  if (profile.mutexWith?.length) {
    lines.push(`  mutexWith=${profile.mutexWith.join(', ')}`);
  }
  return lines;
}

/** @deprecated Use resolveProdLikeHostPorts. */
export const resolveLocalDockerHostPorts = resolveProdLikeHostPorts;

export { PROFILES_PATH };
