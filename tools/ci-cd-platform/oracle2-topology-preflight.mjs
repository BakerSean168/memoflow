#!/usr/bin/env node
/**
 * Oracle2 adoption guard. READ ONLY: inspects existing Compose topology,
 * running containers, and the shared HTTPS edge. Never prints env values.
 * This must pass before any new deploy watcher may adopt the existing stack.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ORACLE_PROJECT = 'memoflow-oracle2';
export const ORACLE_EDGE = 'cpa-caddy';
const SERVICES = Object.freeze(['api', 'web', 'powersync', 'postgres', 'redis']);
const REQUIRED = Object.freeze([...SERVICES, 'migrator']);
const PUBLISHED = Object.freeze({
  web: { host: '172.18.0.1', published: '20700', target: 80 },
  api: { host: '172.18.0.1', published: '20701', target: 3000 },
  powersync: { host: '172.18.0.1', published: '20702', target: 8080 },
});
const VOLUMES = Object.freeze({
  postgres: { '/var/lib/postgresql': 'postgres-prod-data' },
  redis: { '/data': 'redis-prod-data' },
  api: {
    '/app/apps/api/logs': 'api-logs',
    '/app/uploads': 'api-uploads',
    '/tmp/memoflow-repository-storage': 'repository-storage',
    '/var/lib/memoflow/powersync-snapshots': 'powersync-profile-snapshots',
  },
});

function sameKeys(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

function matchPort(actual, expected) {
  return (
    String(actual?.published ?? '') === expected.published &&
    String(actual?.target ?? '') === String(expected.target) &&
    String(actual?.host_ip ?? '') === expected.host
  );
}

export function validateOracle2Topology({ compose, containers, caddy, arch = 'arm64' }) {
  const errors = [];
  if (arch !== 'arm64') errors.push('Oracle2 host must run native linux/arm64');
  const defined = Object.keys(compose?.services ?? {});
  if (!sameKeys(defined, REQUIRED)) {
    errors.push(
      'Compose services must be exactly api,web,powersync,postgres,redis,migrator (no Caddy)',
    );
  }
  for (const name of REQUIRED) {
    const service = compose?.services?.[name];
    if (!service) continue;
    const ports = service.ports ?? [];
    const expected = PUBLISHED[name];
    if (expected) {
      if (ports.length !== 1 || !matchPort(ports[0], expected)) {
        errors.push(
          `${name} must publish only ${expected.host}:${expected.published}->${expected.target}`,
        );
      }
    } else if (ports.length !== 0) {
      errors.push(`${name} must not publish host ports`);
    }
    const desired = VOLUMES[name] ?? {};
    const volumes = (service.volumes ?? []).filter((v) => v.type === 'volume');
    if (
      !sameKeys(
        volumes.map((v) => v.target),
        Object.keys(desired),
      )
    ) {
      errors.push(`${name} volume mount destinations changed`);
    }
    for (const v of volumes) {
      if (desired[v.target] !== v.source) {
        errors.push(`${name} named volume changed at ${v.target}`);
      }
    }
    if (name === 'powersync') {
      const configs = (service.volumes ?? []).filter((v) => v.type === 'bind');
      const expectedConfigs = ['/config/powersync.yaml', '/config/sync-config.yaml'];
      if (
        !sameKeys(
          configs.map((v) => v.target),
          expectedConfigs,
        ) ||
        configs.some((v) => v.read_only !== true)
      ) {
        errors.push('PowerSync config binds must remain read-only');
      }
    }
  }

  const volumeNames = Object.entries(compose?.volumes ?? {}).map(([name, volume]) => [
    name,
    volume?.name,
    volume?.external === true,
  ]);
  const expectedVolumes = [
    'postgres-prod-data',
    'redis-prod-data',
    'api-logs',
    'api-uploads',
    'repository-storage',
    'powersync-profile-snapshots',
  ];
  if (
    !sameKeys(
      volumeNames.map((v) => v[0]),
      expectedVolumes,
    )
  ) {
    errors.push('Compose persistent volume declarations do not match the retained stack');
  }
  for (const [key, value, external] of volumeNames) {
    if (value !== `${ORACLE_PROJECT}_${key}` || external) {
      errors.push(`Volume ${key} is not the retained ${ORACLE_PROJECT} named volume`);
    }
  }

  const networks = compose?.networks ?? {};
  if (
    !sameKeys(Object.keys(networks), ['memoflow-network']) ||
    networks['memoflow-network']?.name !== `${ORACLE_PROJECT}_memoflow-network`
  ) {
    errors.push('Compose network identity drifted from the existing Oracle2 project');
  }

  const found = new Map();
  for (const container of containers ?? []) {
    const labels = container?.Config?.Labels ?? {};
    if (labels['com.docker.compose.project'] !== ORACLE_PROJECT) {
      errors.push('Non-MemoFlow container was included in topology snapshot');
      continue;
    }
    const name = labels['com.docker.compose.service'];
    if (found.has(name)) errors.push(`Duplicate running ${name} container`);
    found.set(name, container);
  }
  if (!sameKeys(found.keys(), SERVICES))
    errors.push('Running service set must equal api,web,powersync,postgres,redis');
  for (const name of SERVICES) {
    const container = found.get(name);
    if (!container) continue;
    // A topology match alone is insufficient: the on-disk Compose can still
    // point at a retired image while a newer image is running. Adopting that
    // Compose would silently downgrade the running application on the next up.
    const configuredImage = compose.services?.[name]?.image;
    const runningImage = container.Config?.Image;
    if (typeof configuredImage !== 'string' || !configuredImage) {
      errors.push(`${name} Compose image identity is missing`);
    } else if (typeof runningImage !== 'string' || !runningImage) {
      errors.push(`${name} live image identity is missing`);
    } else if (runningImage !== configuredImage) {
      errors.push(`${name} live image differs from Compose; reconcile before adoption`);
    }
    const health = container.State?.Health?.Status;
    if (health !== 'healthy') errors.push(`${name} is not healthy`);
    const wanted = VOLUMES[name] ?? {};
    const mounted = (container.Mounts ?? []).filter((m) => m.Type === 'volume');
    if (
      !sameKeys(
        mounted.map((m) => m.Destination),
        Object.keys(wanted),
      )
    ) {
      errors.push(`${name} live persistent volumes do not match Compose`);
    }
    for (const mount of mounted) {
      if (mount.Name !== `${ORACLE_PROJECT}_${wanted[mount.Destination]}`) {
        errors.push(`${name} live named volume identity changed`);
      }
    }
    const expectedPort = PUBLISHED[name];
    const bindings = container?.HostConfig?.PortBindings ?? {};
    if (expectedPort) {
      const entries = Object.entries(bindings).flatMap(([target, ports]) =>
        (ports ?? []).map((p) => ({ target, ...p })),
      );
      if (
        entries.length !== 1 ||
        entries[0].target !== `${expectedPort.target}/tcp` ||
        entries[0].HostIp !== expectedPort.host ||
        entries[0].HostPort !== expectedPort.published
      ) {
        errors.push(`${name} live host gateway binding has drifted`);
      }
    } else if (Object.values(bindings).some((v) => (v ?? []).length > 0)) {
      errors.push(`${name} unexpectedly binds a host port`);
    }
  }
  const edgeLabels = caddy?.Config?.Labels ?? {};
  if (
    !caddy ||
    !caddy.State?.Running ||
    edgeLabels['com.docker.compose.project'] === ORACLE_PROJECT ||
    !(caddy.Mounts ?? []).some(
      (mount) =>
        mount.Destination === '/etc/caddy/Caddyfile' && mount.Source === '/opt/cpa/Caddyfile',
    )
  ) {
    errors.push('Shared CPA Caddy must be running outside the MemoFlow Compose project');
  }
  const edgePorts = caddy?.HostConfig?.PortBindings ?? {};
  if (
    !['80/tcp', '443/tcp'].every((port) =>
      (edgePorts[port] ?? []).some((binding) => binding.HostPort === port.split('/')[0]),
    )
  ) {
    errors.push('Shared CPA Caddy must retain public HTTP and HTTPS bindings');
  }
  return errors;
}

function dockerJson(args) {
  return JSON.parse(
    execFileSync('docker', args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 20_000,
    }),
  );
}
function dockerIds(args) {
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 12_000 })
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

function cli() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--compose' || args[2] !== '--env-file') {
    throw new Error('usage: oracle2-topology-preflight.mjs --compose PATH --env-file PATH');
  }
  const project = ORACLE_PROJECT;
  const compose = dockerJson([
    'compose',
    '-p',
    project,
    '-f',
    args[1],
    '--env-file',
    args[3],
    'config',
    '--format',
    'json',
  ]);
  const ids = dockerIds(['ps', '-q', '--filter', `label=com.docker.compose.project=${project}`]);
  const containers = ids.length ? dockerJson(['inspect', ...ids]) : [];
  const caddy = dockerJson(['inspect', ORACLE_EDGE])[0];
  const errors = validateOracle2Topology({ compose, containers, caddy, arch: process.arch });
  if (errors.length) throw new Error(errors.join('; '));
  console.log(
    `ORACLE2_TOPOLOGY=PASS arch=${process.arch} project=${project} live=${SERVICES.length} shared_edge=${ORACLE_EDGE} read_only=true`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    cli();
  } catch (error) {
    console.error(`ORACLE2_TOPOLOGY=FAIL ${error.message}`);
    process.exitCode = 1;
  }
}
