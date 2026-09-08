import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { detectHostEnvShadowing } from './env-shadow.mjs';
import {
  createLocalComposeArgs,
  createLocalDockerAuthBaseUrl,
  createLocalDockerWebUrl,
  extractHttpOrigin,
  mergeLocalDockerWebOrigins,
  resolveLocalDockerBrowserValidationOrigins,
  resolveLocalDockerPowerSyncUrl,
  resolveWorkspaceRevision,
} from './local-compose.mjs';

describe('createLocalComposeArgs', () => {
  it('loads production defaults even when no local secret overlay exists', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'memoflow-local-compose-'));
    try {
      writeFileSync(join(cwd, '.env.production'), 'DB_NAME=MemoFlow\n');
      assert.deepEqual(createLocalComposeArgs({ cwd }), [
        'compose',
        '-f',
        'docker-compose.local.yml',
        '--env-file',
        '.env.production',
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('layers the gitignored local secret file after production defaults when present', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'memoflow-local-compose-'));
    try {
      writeFileSync(join(cwd, '.env.production'), 'DB_NAME=MemoFlow\n');
      writeFileSync(join(cwd, '.env.production.local'), 'DB_PASSWORD=secret\n');
      assert.deepEqual(createLocalComposeArgs({ cwd }), [
        'compose',
        '-f',
        'docker-compose.local.yml',
        '--env-file',
        '.env.production',
        '--env-file',
        '.env.production.local',
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('resolveWorkspaceRevision', () => {
  const head = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  function gitStub({ diff = '', untracked = '' } = {}) {
    return (_command, args) => {
      if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${head}\n`, stderr: '' };
      if (args[0] === 'diff') return { exitCode: 0, stdout: diff, stderr: '' };
      if (args[0] === 'ls-files') return { exitCode: 0, stdout: untracked, stderr: '' };
      return { exitCode: 1, stdout: '', stderr: 'unexpected command' };
    };
  }

  it('uses plain HEAD for a clean Docker build context', () => {
    assert.equal(resolveWorkspaceRevision({ cwd: '/repo', runCommand: gitStub() }), head);
  });

  it('changes the dirty fingerprint when tracked source content changes', () => {
    const first = resolveWorkspaceRevision({
      cwd: '/repo',
      runCommand: gitStub({ diff: 'diff --git a/a.ts b/a.ts\n+one\n' }),
    });
    const second = resolveWorkspaceRevision({
      cwd: '/repo',
      runCommand: gitStub({ diff: 'diff --git a/a.ts b/a.ts\n+two\n' }),
    });

    assert.match(first, new RegExp(`^${head}-dirty-[0-9a-f]{12}$`));
    assert.notEqual(first, second);
  });

  it('excludes generated browser reports from the Docker source fingerprint', () => {
    const calls = [];
    const runCommand = (_command, args) => {
      calls.push(args);
      if (args[0] === 'rev-parse') return { exitCode: 0, stdout: `${head}\n`, stderr: '' };
      if (args[0] === 'diff') return { exitCode: 0, stdout: '', stderr: '' };
      if (args[0] === 'ls-files') return { exitCode: 0, stdout: '', stderr: '' };
      return { exitCode: 1, stdout: '', stderr: 'unexpected command' };
    };

    assert.equal(resolveWorkspaceRevision({ cwd: '/repo', runCommand }), head);
    const diffArgs = calls.find((args) => args[0] === 'diff');
    assert.ok(diffArgs.includes(':(exclude)docs/**'));
    assert.ok(diffArgs.includes(':(exclude)reports/**'));
    assert.ok(diffArgs.includes(':(exclude).github/**'));
    assert.ok(diffArgs.includes(':(exclude,glob)apps/web/playwright*-report/**'));
    assert.ok(diffArgs.includes(':(exclude,glob)apps/web/test-results*/**'));
  });

  it('includes non-ignored untracked source files in the dirty fingerprint', () => {
    const files = new Map([
      ['/repo/new-a.ts', Buffer.from('one')],
      ['/repo/new-b.ts', Buffer.from('two')],
    ]);
    const first = resolveWorkspaceRevision({
      cwd: '/repo',
      runCommand: gitStub({ untracked: 'new-a.ts\0' }),
      readFile: (file) => files.get(file),
    });
    const second = resolveWorkspaceRevision({
      cwd: '/repo',
      runCommand: gitStub({ untracked: 'new-b.ts\0' }),
      readFile: (file) => files.get(file),
    });

    assert.notEqual(first, second);
  });
});

describe('detectHostEnvShadowing', () => {
  it('warns when host process env differs from env-file for critical keys', () => {
    const envFileMap = new Map([
      ['DB_PASSWORD', 'file-password'],
      ['JWT_SECRET', 'file-jwt'],
      ['NODE_ENV', 'production'],
    ]);
    const warnings = detectHostEnvShadowing(
      {
        DB_PASSWORD: 'host-password',
        JWT_SECRET: 'file-jwt',
        NODE_ENV: 'development',
      },
      envFileMap,
    );
    assert.equal(
      warnings.some((warning) => warning.includes('DB_PASSWORD')),
      true,
    );
    assert.equal(
      warnings.some((warning) => warning.includes('NODE_ENV')),
      true,
    );
    assert.equal(
      warnings.some((warning) => warning.includes('JWT_SECRET')),
      false,
    );
  });

  it('is silent when host matches file or host key is unset', () => {
    const envFileMap = new Map([['DB_PASSWORD', 'same']]);
    assert.deepEqual(detectHostEnvShadowing({ DB_PASSWORD: 'same' }, envFileMap), []);
    assert.deepEqual(detectHostEnvShadowing({}, envFileMap), []);
  });
});

describe('mergeLocalDockerWebOrigins', () => {
  it('adds the resolved machine Web port to the browser-facing API allowlist', () => {
    assert.deepEqual(
      mergeLocalDockerWebOrigins('12137', 'https://app.example.com,http://localhost:12137').split(
        ',',
      ),
      ['https://app.example.com', 'http://localhost:12137', 'http://127.0.0.1:12137'],
    );
  });
});

describe('MagicDNS browser-facing local Docker URLs', () => {
  it('normalizes the public Web URL into an allowlist origin', () => {
    const publicWebOrigin = extractHttpOrigin('https://oracle.taile92a8e.ts.net:20200/auth');
    assert.equal(publicWebOrigin, 'https://oracle.taile92a8e.ts.net:20200');
    assert.equal(
      mergeLocalDockerWebOrigins('20200', publicWebOrigin).includes(
        'https://oracle.taile92a8e.ts.net:20200',
      ),
      true,
    );
  });

  it('preserves an explicit public PowerSync URL instead of forcing localhost', () => {
    assert.equal(
      resolveLocalDockerPowerSyncUrl('20202', 'https://oracle.taile92a8e.ts.net:20202'),
      'https://oracle.taile92a8e.ts.net:20202',
    );
    assert.equal(resolveLocalDockerPowerSyncUrl('20202'), 'http://localhost:20202');
  });

  it('runs browser validation through the configured public Web and API origins', () => {
    assert.deepEqual(
      resolveLocalDockerBrowserValidationOrigins({
        apiHostPort: '20201',
        webHostPort: '20200',
        authBaseUrl: 'https://oracle.taile92a8e.ts.net:20201/api/auth',
        webUrl: 'https://oracle.taile92a8e.ts.net:20200',
      }),
      {
        apiOrigin: 'https://oracle.taile92a8e.ts.net:20201',
        webOrigin: 'https://oracle.taile92a8e.ts.net:20200',
      },
    );
  });
});

describe('createLocalDockerAuthBaseUrl', () => {
  it('uses the resolved machine API port for Better Auth callbacks', () => {
    assert.equal(createLocalDockerAuthBaseUrl('12136'), 'http://localhost:12136/api/auth');
  });
});

describe('createLocalDockerWebUrl', () => {
  it('uses the resolved machine Web port for device confirmation pages', () => {
    assert.equal(createLocalDockerWebUrl('12137'), 'http://localhost:12137');
  });
});

describe('API runtime image boundary', () => {
  it('deploys isolated API and migrator production closures', () => {
    const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile.api'), 'utf8');

    assert.doesNotMatch(dockerfile, /RUN[^\n]*pnpm fetch/);
    assert.ok(
      dockerfile.indexOf('COPY apps/api/package.json') <
        dockerfile.indexOf('pnpm --config.node-linker=isolated'),
    );
    assert.ok(
      dockerfile.indexOf('pnpm --config.node-linker=isolated') <
        dockerfile.indexOf('COPY apps/api ./apps/api'),
    );
    assert.ok(dockerfile.includes('pnpm --config.node-linker=isolated'));
    assert.ok(dockerfile.includes('COPY packages/scheduler/package.json ./packages/scheduler/package.json'));
    assert.ok(dockerfile.includes('COPY packages/scheduler ./packages/scheduler'));
    assert.ok(
      dockerfile.indexOf('COPY packages/scheduler/package.json') <
        dockerfile.indexOf('pnpm --config.node-linker=isolated'),
    );
    assert.ok(
      dockerfile.includes('--filter @memoflow/api deploy --prod --ignore-scripts /prod/api'),
    );
    assert.ok(
      dockerfile.includes(
        '--filter @memoflow/migrator deploy --prod --ignore-scripts /prod/migrator',
      ),
    );
    assert.ok(
      dockerfile.includes(
        'node /prod/migrator/node_modules/@prisma/engines/scripts/postinstall.js',
      ),
    );
    assert.ok(
      dockerfile.includes(
        "find /prod/migrator/node_modules/@prisma/engines -maxdepth 1 -type f -name 'schema-engine-*'",
      ),
    );
    const migratorRuntime = dockerfile.slice(
      dockerfile.indexOf('FROM node-base AS migrator-runtime'),
      dockerfile.indexOf('FROM node-base AS api-runtime'),
    );
    assert.ok(migratorRuntime.includes('PRISMA_HIDE_UPDATE_MESSAGE=1'));
    assert.ok(migratorRuntime.includes('/app/node_modules/.bin/prisma -v'));
    assert.ok(migratorRuntime.includes("-name 'schema-engine-*'"));
    assert.ok(dockerfile.includes('COPY --from=builder /prod/api/node_modules ./node_modules'));
    assert.ok(!dockerfile.includes('COPY --from=builder /app/node_modules ./node_modules'));
    assert.ok(!dockerfile.includes('COPY --from=builder /app/packages ./packages'));

    const apiRuntime = dockerfile.slice(dockerfile.indexOf('FROM node-base AS api-runtime'));
    assert.ok(!apiRuntime.includes('packages/database'));
    assert.ok(!apiRuntime.includes('tsx'));
    assert.ok(!apiRuntime.includes('prisma'));
  });
});

describe('GitHub server-only compose environment contract', () => {
  const requiredKeys = [
    'GITHUB_OAUTH_CLIENT_ID',
    'GITHUB_OAUTH_CLIENT_SECRET',
    'GITHUB_APP_ID',
    'GITHUB_APP_SLUG',
    'GITHUB_APP_PRIVATE_KEY',
    'GITHUB_APP_WEBHOOK_SECRET',
    'GITHUB_INSTALLATION_ROUTE_KEY',
    'GITHUB_INSTALLATION_ROUTE_TARGETS',
  ];

  for (const composeFile of ['docker-compose.local.yml', 'docker-compose.prod.yml']) {
    it(`${composeFile} passes all GitHub identity and installation credentials to API`, () => {
      const source = readFileSync(resolve(process.cwd(), composeFile), 'utf8');
      for (const key of requiredKeys) {
        assert.ok(source.includes(key + ': ${' + key + ':'));
      }
    });
  }
});

describe('transactional email compose environment contract', () => {
  const requiredKeys = [
    'EMAIL_PROVIDER',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
    'SMTP_REPLY_TO',
    'RESEND_API_KEY',
    'RESEND_FROM',
  ];

  for (const composeFile of ['docker-compose.local.yml', 'docker-compose.prod.yml']) {
    it(`${composeFile} passes all transactional email delivery configuration to API`, () => {
      const source = readFileSync(resolve(process.cwd(), composeFile), 'utf8');
      for (const key of requiredKeys) {
        assert.ok(source.includes(key + ': ${' + key + ':'));
      }
    });
  }
});

describe('local Docker external bind contract', () => {
  it('binds API/Web/PowerSync to loopback by default so remote access must use a TLS terminator', () => {
    const source = readFileSync(resolve(process.cwd(), 'docker-compose.local.yml'), 'utf8');
    for (const mapping of [
      '${LOCAL_DOCKER_BIND_HOST:-127.0.0.1}:${API_HOST_PORT:-20201}:3000',
      '${LOCAL_DOCKER_BIND_HOST:-127.0.0.1}:${WEB_HOST_PORT:-20200}:80',
      '${LOCAL_DOCKER_BIND_HOST:-127.0.0.1}:${POWERSYNC_HOST_PORT:-20202}:${POWERSYNC_PORT:-8080}',
    ]) {
      assert.ok(source.includes(mapping));
    }
  });
});

describe('AI provider secret-vault compose environment contract', () => {
  const requiredKeys = [
    'AI_PROVIDER_ENCRYPTION_KEY',
    'AI_PROVIDER_ENCRYPTION_KEY_ID',
    'AI_PROVIDER_ENCRYPTION_PREVIOUS_KEYS',
  ];

  for (const composeFile of ['docker-compose.local.yml', 'docker-compose.prod.yml']) {
    it(`${composeFile} passes the active and previous provider-secret keyring to API`, () => {
      const source = readFileSync(resolve(process.cwd(), composeFile), 'utf8');
      for (const key of requiredKeys) {
        assert.ok(source.includes(key + ': ${' + key + ':'));
      }
    });
  }
});
