import assert from 'node:assert/strict';
import test from 'node:test';
import { validateOracle2Topology } from '../oracle2-topology-preflight.mjs';

const project = 'memoflow-oracle2';
const named = {
  api: {
    '/app/apps/api/logs': 'api-logs',
    '/app/uploads': 'api-uploads',
    '/tmp/memoflow-repository-storage': 'repository-storage',
    '/var/lib/memoflow/powersync-snapshots': 'powersync-profile-snapshots',
  },
  postgres: { '/var/lib/postgresql': 'postgres-prod-data' },
  redis: { '/data': 'redis-prod-data' },
};

function fixture() {
  const serviceNames = ['api', 'web', 'powersync', 'postgres', 'redis', 'migrator'];
  const ports = {
    api: ['20701', 3000],
    web: ['20700', 80],
    powersync: ['20702', 8080],
  };
  const compose = {
    services: Object.fromEntries(
      serviceNames.map((name) => [
        name,
        {
          image: `fixture/${name}:pinned`,
          ports: ports[name]
            ? [{ host_ip: '172.18.0.1', published: ports[name][0], target: ports[name][1] }]
            : [],
          volumes: [
            ...Object.entries(named[name] ?? {}).map(([target, source]) => ({
              type: 'volume',
              source,
              target,
            })),
            ...(name === 'powersync'
              ? ['/config/powersync.yaml', '/config/sync-config.yaml'].map((target) => ({
                  type: 'bind',
                  source: '/opt/memoflow-oracle2/docker/powersync/' + target.split('/').at(-1),
                  target,
                  read_only: true,
                }))
              : []),
          ],
        },
      ]),
    ),
    volumes: Object.fromEntries(
      Object.values(named)
        .flatMap((mapping) => Object.values(mapping))
        .map((volume) => [volume, { name: `${project}_${volume}`, external: false }]),
    ),
    networks: { 'memoflow-network': { name: `${project}_memoflow-network` } },
  };
  const containers = serviceNames
    .filter((name) => name !== 'migrator')
    .map((name) => ({
      Config: {
        Image: `fixture/${name}:pinned`,
        Labels: {
          'com.docker.compose.project': project,
          'com.docker.compose.service': name,
        },
      },
      State: { Health: { Status: 'healthy' } },
      Mounts: Object.entries(named[name] ?? {}).map(([destination, volume]) => ({
        Type: 'volume',
        Destination: destination,
        Name: `${project}_${volume}`,
      })),
      HostConfig: {
        PortBindings: ports[name]
          ? {
              [`${ports[name][1]}/tcp`]: [{ HostIp: '172.18.0.1', HostPort: ports[name][0] }],
            }
          : {},
      },
    }));
  const caddy = {
    Config: { Labels: { 'com.docker.compose.project': 'cpa' } },
    State: { Running: true },
    Mounts: [{ Destination: '/etc/caddy/Caddyfile', Source: '/opt/cpa/Caddyfile' }],
    HostConfig: {
      PortBindings: {
        '80/tcp': [{ HostIp: '', HostPort: '80' }],
        '443/tcp': [{ HostIp: '', HostPort: '443' }],
      },
    },
  };
  return { compose, containers, caddy, arch: 'arm64' };
}

test('Oracle2 dry-run preflight accepts exact existing named volumes and shared CPA edge', () => {
  assert.deepEqual(validateOracle2Topology(fixture()), []);
});

test('Oracle2 preflight rejects an internally owned Caddy and dangerous published ports', () => {
  const site = fixture();
  site.compose.services.caddy = { ports: [{ published: '443', target: 443 }] };
  site.compose.services.postgres.ports = [{ published: '5432', target: 5432 }];
  site.caddy.Config.Labels['com.docker.compose.project'] = project;
  const result = validateOracle2Topology(site).join('; ');
  assert.match(result, /no Caddy/u);
  assert.match(result, /postgres must not publish host ports/u);
  assert.match(result, /Shared CPA Caddy/u);
});

test('Oracle2 preflight rejects changed DB and API data volumes before any deploy', () => {
  const site = fixture();
  site.compose.volumes['postgres-prod-data'].name = 'new-postgres-data';
  site.compose.services.api.volumes[0].source = 'api-logs-v2';
  site.containers.find(
    (c) => c.Config.Labels['com.docker.compose.service'] === 'postgres',
  ).Mounts[0].Name = 'different_db_volume';
  const result = validateOracle2Topology(site).join('; ');
  assert.match(result, /postgres-prod-data is not the retained/u);
  assert.match(result, /api named volume changed/u);
  assert.match(result, /postgres live named volume identity changed/u);
});

test('Oracle2 preflight rejects wrong bind hosts, stopped services, and unsupported architecture', () => {
  const site = fixture();
  site.arch = 'x64';
  site.compose.services.powersync.ports[0].host_ip = '0.0.0.0';
  site.containers.find(
    (c) => c.Config.Labels['com.docker.compose.service'] === 'web',
  ).State.Health.Status = 'unhealthy';
  const result = validateOracle2Topology(site).join('; ');
  assert.match(result, /native linux\/arm64/u);
  assert.match(result, /powersync must publish only/u);
  assert.match(result, /web is not healthy/u);
});

test('Oracle2 preflight blocks stale Compose images even while new live containers are healthy', () => {
  const site = fixture();
  site.compose.services.api.image = 'memoflow-oracle2-api:v0.16.0';
  site.containers.find(
    (c) => c.Config.Labels['com.docker.compose.service'] === 'api',
  ).Config.Image = 'memoflow-oracle2-api:rc-0.21.1-8c84330cc974';
  const result = validateOracle2Topology(site).join('; ');
  assert.match(result, /api live image differs from Compose; reconcile before adoption/u);
});

test('Oracle2 preflight fails closed for missing Compose and running image identities', () => {
  const site = fixture();
  delete site.compose.services.web.image;
  delete site.containers.find((c) => c.Config.Labels['com.docker.compose.service'] === 'redis')
    .Config.Image;
  const result = validateOracle2Topology(site).join('; ');
  assert.match(result, /web Compose image identity is missing/u);
  assert.match(result, /redis live image identity is missing/u);
});
