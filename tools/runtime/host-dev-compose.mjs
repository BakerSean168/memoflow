/**
 * Host-dev infrastructure launcher.
 *
 * Docker Compose remains the implementation mechanism, but host ports come from
 * tools/runtime/profiles.json so the shared GCP Dev contract has one authority.
 */
import { spawnSync } from 'node:child_process';
import { getRuntimeProfile } from './load-profiles.mjs';

const profile = getRuntimeProfile('host-dev');

function runtimeEnv() {
  return {
    ...process.env,
    POSTGRES_HOST_PORT: String(profile.ports.postgres),
    REDIS_HOST_PORT: String(profile.ports.redis),
    POWERSYNC_HOST_PORT: String(profile.ports.powersync),
  };
}

function run(args) {
  const result = spawnSync(
    'docker',
    ['compose', '-p', profile.composeProject, '--profile', 'dev', ...args],
    {
      stdio: 'inherit',
      env: runtimeEnv(),
    },
  );
  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) process.exit(result.status);
}

const command = process.argv[2] ?? 'up';
console.log(
  `[host-dev] ports: WEB=${profile.ports.web} API=${profile.ports.api} PS=${profile.ports.powersync} PG=${profile.ports.postgres} REDIS=${profile.ports.redis}`,
);

switch (command) {
  case 'up':
    run(['up', '-d']);
    break;
  case 'down':
    run(['down']);
    break;
  case 'logs':
    run(['logs', '-f']);
    break;
  case 'ps':
    run(['ps']);
    break;
  case 'reset':
    run(['down', '-v']);
    run(['up', '-d']);
    break;
  default:
    console.error(`Unsupported host-dev command: ${command}`);
    process.exit(1);
}
