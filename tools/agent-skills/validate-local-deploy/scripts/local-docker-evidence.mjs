import { createConnection } from 'node:net';
import { spawnSync } from 'node:child_process';

export const LOCAL_DOCKER_PRODUCT_SERVICES = {
  web: {
    hostPortEnv: 'WEB_HOST_PORT',
    targetPort: 80,
  },
  api: {
    hostPortEnv: 'API_HOST_PORT',
    targetPort: 3000,
  },
};

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    exitCode: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ? String(result.error.message ?? result.error) : null,
  };
}

export function parseComposePsJson(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text
      .split(/\r?\n/gu)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

function normalizeRevision(revision) {
  return String(revision ?? '').trim();
}

function normalizePublishers(publishers) {
  return Array.isArray(publishers) ? publishers : [];
}

function healthFromEntry(entry) {
  const explicit = String(entry?.Health ?? entry?.health ?? '').toLowerCase();
  if (explicit) return explicit;
  const status = String(entry?.Status ?? entry?.statusLine ?? '').toLowerCase();
  return status.includes('healthy') ? 'healthy' : '';
}

function stateFromEntry(entry) {
  return String(entry?.State ?? entry?.state ?? '').toLowerCase();
}

export function evaluateLocalDockerRuntimeEvidence({
  expectedRevision,
  expectedServices,
  composeServices,
  listeners,
  containerRevisions,
}) {
  const services = {};
  const errors = [];
  const normalizedExpectedRevision = normalizeRevision(expectedRevision);

  for (const [serviceName, contract] of Object.entries(expectedServices)) {
    const compose = composeServices[serviceName] ?? null;
    const listener = listeners[contract.hostPort] ?? listeners[String(contract.hostPort)] ?? null;
    const publishers = normalizePublishers(compose?.publishers ?? compose?.Publishers);
    const mappingMatches = publishers.some(
      (publisher) =>
        Number(publisher.PublishedPort) === Number(contract.hostPort) &&
        Number(publisher.TargetPort) === Number(contract.targetPort) &&
        String(publisher.Protocol ?? 'tcp').toLowerCase() === 'tcp',
    );
    const health = healthFromEntry(compose);
    const state = stateFromEntry(compose);
    const listenerOpen = listener?.open === true;
    const actualRevision = normalizeRevision(containerRevisions[serviceName]);
    const revisionMatches =
      normalizedExpectedRevision.length > 0 && actualRevision === normalizedExpectedRevision;

    services[serviceName] = {
      name: compose?.name ?? compose?.Name ?? serviceName,
      state,
      health,
      hostPort: Number(contract.hostPort),
      targetPort: Number(contract.targetPort),
      mappingMatches,
      listenerOpen,
      listenerOwner: listener?.owner ?? null,
      expectedRevision: normalizedExpectedRevision,
      actualRevision: actualRevision || null,
      revisionMatches,
    };

    if (!compose) {
      errors.push(`${serviceName}: compose service is missing`);
      continue;
    }
    if (state !== 'running') {
      errors.push(`${serviceName}: expected running state, received ${state || 'unknown'}`);
    }
    if (health !== 'healthy') {
      errors.push(`${serviceName}: expected healthy status, received ${health || 'unknown'}`);
    }
    if (!mappingMatches) {
      errors.push(
        `${serviceName}: expected host ${contract.hostPort} -> container ${contract.targetPort}/tcp mapping`,
      );
    }
    if (!listenerOpen) {
      errors.push(`${serviceName}: expected an open listener on host port ${contract.hostPort}`);
    }
    if (!revisionMatches) {
      errors.push(
        `${serviceName}: container revision ${actualRevision || 'missing'} does not match ${normalizedExpectedRevision || 'missing expected revision'}`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    expectedRevision: normalizedExpectedRevision,
    services,
    errors,
  };
}

function probeTcpPort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const finish = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function detectListenerOwner(port, workspace) {
  const result = runCommand('ss', ['-ltnp', `( sport = :${port} )`], { cwd: workspace });
  if (result.exitCode !== 0) {
    return null;
  }

  const lines = result.stdout
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('State'));
  const processLine = lines.find((line) => line.includes('users:('));
  return processLine ?? null;
}

function normalizeComposeServices(entries) {
  const services = {};
  for (const entry of entries) {
    const serviceName = entry.Service ?? entry.service;
    if (!serviceName) continue;
    services[serviceName] = {
      name: entry.Name ?? entry.name ?? serviceName,
      state: entry.State ?? entry.state ?? '',
      health: entry.Health ?? entry.health ?? '',
      statusLine: entry.Status ?? entry.statusLine ?? '',
      publishers: normalizePublishers(entry.Publishers ?? entry.publishers),
    };
  }
  return services;
}

function inspectContainerRevision(containerName, workspace) {
  const result = runCommand(
    'docker',
    [
      'inspect',
      containerName,
      '--format',
      '{{index .Config.Labels "org.opencontainers.image.revision"}}',
    ],
    { cwd: workspace },
  );
  return result.exitCode === 0 ? result.stdout.trim() : '';
}

export async function collectLocalDockerRuntimeEvidence({
  workspace,
  env,
  composeArgs,
  expectedRevision = env.VCS_REF,
}) {
  const ps = runCommand('docker', [...composeArgs, 'ps', '--format', 'json'], {
    cwd: workspace,
    env,
  });
  if (ps.exitCode !== 0) {
    return {
      ok: false,
      expectedRevision: normalizeRevision(expectedRevision),
      services: {},
      errors: [
        `docker compose ps failed: ${ps.stderr.trim() || ps.stdout.trim() || ps.error || 'unknown error'}`,
      ],
    };
  }

  let entries;
  try {
    entries = parseComposePsJson(ps.stdout);
  } catch (error) {
    return {
      ok: false,
      expectedRevision: normalizeRevision(expectedRevision),
      services: {},
      errors: [`docker compose ps output could not be parsed: ${String(error.message ?? error)}`],
    };
  }

  const composeServices = normalizeComposeServices(entries);
  const expectedServices = {};
  const listeners = {};
  const containerRevisions = {};

  await Promise.all(
    Object.entries(LOCAL_DOCKER_PRODUCT_SERVICES).map(async ([serviceName, contract]) => {
      const hostPort = Number(env[contract.hostPortEnv]);
      expectedServices[serviceName] = { hostPort, targetPort: contract.targetPort };
      const open = Number.isInteger(hostPort) && (await probeTcpPort(hostPort));
      const composeName = composeServices[serviceName]?.name;
      listeners[hostPort] = {
        open,
        owner:
          detectListenerOwner(hostPort, workspace) ??
          (open && composeName ? `docker-published:${composeName}` : null),
      };
      containerRevisions[serviceName] = composeName
        ? inspectContainerRevision(composeName, workspace)
        : '';
    }),
  );

  return evaluateLocalDockerRuntimeEvidence({
    expectedRevision,
    expectedServices,
    composeServices,
    listeners,
    containerRevisions,
  });
}

export function hasBrowserProbeEvidence(logs, token) {
  const normalizedToken = String(token ?? '').trim();
  if (!/^[a-z0-9-]+$/u.test(normalizedToken)) return false;
  return String(logs ?? '').includes(`__pm_local_docker_probe=${normalizedToken}`);
}

export function collectBrowserProbeEvidence({ workspace, env, composeArgs, token, since }) {
  const result = runCommand(
    'docker',
    [...composeArgs, 'logs', '--no-color', `--since=${since}`, 'web'],
    { cwd: workspace, env },
  );
  const logs = [result.stdout, result.stderr].filter(Boolean).join('\n');
  return {
    ok: result.exitCode === 0 && hasBrowserProbeEvidence(logs, token),
    token,
    since,
    logCommandExitCode: result.exitCode,
    matchingLine:
      logs.split(/\r?\n/gu).find((line) => hasBrowserProbeEvidence(line, token)) ?? null,
    error:
      result.exitCode === 0
        ? null
        : result.stderr.trim() || result.stdout.trim() || result.error || 'unknown error',
  };
}
