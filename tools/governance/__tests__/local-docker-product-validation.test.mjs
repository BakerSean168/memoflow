import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
/*
 * This integration test intentionally exercises standalone workspace tooling
 * that is not modeled as an Nx project. Keep the exception local to this test;
 * production and project-to-project imports remain boundary-enforced.
 */
/* eslint-disable @nx/enforce-module-boundaries */
import {
  evaluateLocalDockerRuntimeEvidence,
  hasBrowserProbeEvidence,
} from '../../agent-skills/validate-local-deploy/scripts/local-docker-evidence.mjs';
import { classifyValidationFailure } from '../../agent-skills/validate-local-deploy/scripts/validation-classification.mjs';
import {
  buildCleanupExecArgs,
  buildCleanupSql,
  normalizeCleanupPrefix,
} from '../../testing/local-docker-pm-cleanup.mjs';

const revision = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function healthyRuntime(overrides = {}) {
  return {
    expectedRevision: revision,
    expectedServices: {
      web: { hostPort: 20200, targetPort: 80 },
      api: { hostPort: 20201, targetPort: 3000 },
    },
    composeServices: {
      web: {
        name: 'memoflow-web-1',
        state: 'running',
        health: 'healthy',
        publishers: [{ PublishedPort: 20200, TargetPort: 80, Protocol: 'tcp' }],
      },
      api: {
        name: 'memoflow-api-1',
        state: 'running',
        health: 'healthy',
        publishers: [{ PublishedPort: 20201, TargetPort: 3000, Protocol: 'tcp' }],
      },
    },
    listeners: {
      20200: { open: true, owner: 'docker-compose:web' },
      20201: { open: true, owner: 'docker-compose:api' },
    },
    containerRevisions: {
      web: revision,
      api: revision,
    },
    ...overrides,
  };
}

describe('API Docker workspace closure', () => {
  it('copies every direct workspace package needed by API production deploy', () => {
    const dockerfile = readFileSync(new URL('../../../Dockerfile.api', import.meta.url), 'utf8');

    expect(dockerfile).toContain('COPY packages/label/package.json ./packages/label/package.json');
    expect(dockerfile).toContain('COPY packages/label ./packages/label');
    expect(dockerfile).toContain('--filter @memoflow/api deploy --prod --ignore-scripts /prod/api');
    expect(dockerfile).toContain(
      '--filter @memoflow/migrator deploy --prod --ignore-scripts /prod/migrator',
    );
    expect(dockerfile).toContain(
      'node /prod/migrator/node_modules/@prisma/engines/scripts/postinstall.js',
    );
    expect(dockerfile).toContain(
      "find /prod/migrator/node_modules/@prisma/engines -maxdepth 1 -type f -name 'schema-engine-*'",
    );
  });
});

describe('local Docker image provenance', () => {
  it('stamps the locally built PowerSync image with the exact workspace revision and build date', () => {
    const compose = readFileSync(new URL('../../../docker-compose.local.yml', import.meta.url), 'utf8');
    const powersyncStart = compose.indexOf('\n  powersync:\n');
    const webStart = compose.indexOf('\n  web:\n', powersyncStart + 1);

    expect(powersyncStart).toBeGreaterThanOrEqual(0);
    expect(webStart).toBeGreaterThan(powersyncStart);

    const powersyncBlock = compose.slice(powersyncStart, webStart);
    expect(powersyncBlock).toContain('org.opencontainers.image.created: ${BUILD_DATE:-unknown}');
    expect(powersyncBlock).toContain('org.opencontainers.image.revision: ${VCS_REF:-unknown}');
  });
});

describe('local Docker product validation evidence', () => {
  it('requires healthy listeners, exact compose port mappings, and current revisions', () => {
    const result = evaluateLocalDockerRuntimeEvidence(healthyRuntime());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.services.web.mappingMatches).toBe(true);
    expect(result.services.api.revisionMatches).toBe(true);
    expect(result.services.web.listenerOpen).toBe(true);
  });

  it('rejects stale images and a listener that is not mapped to the expected container port', () => {
    const fixture = healthyRuntime();
    fixture.composeServices.web.publishers = [
      { PublishedPort: 20200, TargetPort: 8080, Protocol: 'tcp' },
    ];
    fixture.containerRevisions.api = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    const result = evaluateLocalDockerRuntimeEvidence(fixture);

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/web.*20200.*80/);
    expect(result.errors.join('\n')).toMatch(/api.*revision/);
  });

  it('accepts browser proof only when the unique query token appears in current web logs', () => {
    const token = 'pm-local-docker-browser-171234';
    const logs =
      '127.0.0.1 - - "GET /?__pm_local_docker_probe=pm-local-docker-browser-171234 HTTP/1.1" 200';

    expect(hasBrowserProbeEvidence(logs, token)).toBe(true);
    expect(hasBrowserProbeEvidence(logs, 'pm-local-docker-browser-other')).toBe(false);
  });
});

describe('validation failure classification', () => {
  it.each([
    ['affected-test', false, 'code'],
    ['docker-local-up', false, 'docker-deploy'],
    ['affected-typecheck', true, 'host-tool'],
  ])(
    'classifies %s failures without conflating host tools and product code',
    (label, environmentIssue, expected) => {
      expect(classifyValidationFailure({ label, environmentIssue })).toBe(expected);
    },
  );
});

describe('local Docker PM data cleanup', () => {
  it('accepts the fixed PM prefix and emits identity-rooted cascade cleanup SQL', () => {
    const prefix = normalizeCleanupPrefix('pm-phase-');
    const sql = buildCleanupSql(prefix);

    expect(prefix).toBe('pm-phase-');
    expect(sql).toContain('FROM cloud_auth_users');
    expect(sql).toContain('email LIKE');
    expect(sql).toContain('DELETE FROM cloud_auth_users');
    expect(sql).toContain('information_schema.columns');
    expect(sql).toContain('WHEN foreign_key_violation OR restrict_violation');
    expect(sql).toContain('PM cleanup could not resolve dependent identity tables');
  });

  it('uses the postgres container credentials without copying database secrets into host args', () => {
    const sql = buildCleanupSql('pm-phase-');
    const args = buildCleanupExecArgs(sql);

    expect(args).toContain('psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"');
    expect(args.at(-1)).toBe(sql);
  });

  it.each(['', 'pm-%', 'test', 'pm_phase_'])('rejects unsafe or non-PM prefix %s', (prefix) => {
    expect(() => normalizeCleanupPrefix(prefix)).toThrow();
  });
});
