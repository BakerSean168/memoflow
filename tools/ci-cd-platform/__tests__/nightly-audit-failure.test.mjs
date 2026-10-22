import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { reportNightlyFailure } from '../nightly-audit-failure.mjs';

for (const auditResult of ['failure', 'cancelled']) {
  for (const state of [null, 'OPEN', 'CLOSED']) {
    test(`reports audit ${auditResult} with tracking issue state ${state}`, () => {
      const directory = mkdtempSync(join(tmpdir(), 'nightly-audit-'));
      try {
        const calls = [];
        const summaryPath = join(directory, 'summary.md');
        const issueUrl = 'https://github.com/BakerSean168/memoflow/issues/900';
        reportNightlyFailure(
          { repository: 'BakerSean168/memoflow', runId: '123', auditResult, summaryPath },
          (args) => {
            calls.push(args);
            if (args[1] === 'list') {
              return JSON.stringify(state ? [{ number: 900, state, url: issueUrl }] : []);
            }
            if (args[1] === 'create' && args[0] === 'issue') return issueUrl;
            return '';
          },
        );
        const writes = calls.filter((args) => args[0] === 'issue' && args[1] !== 'list');
        assert.deepEqual(
          writes.map((args) => args[1]),
          state === 'CLOSED' ? ['reopen', 'comment'] : [state ? 'comment' : 'create'],
        );
        assert.ok(
          writes
            .at(-1)
            .includes(
              `Nightly Web Flow Audit ${auditResult}: https://github.com/BakerSean168/memoflow/actions/runs/123`,
            ),
        );
        const summary = readFileSync(summaryPath, 'utf8');
        assert.ok(summary.includes('/actions/runs/123'));
        assert.ok(summary.includes(`Nightly Web Flow Audit ${auditResult}`));
        assert.ok(summary.includes(issueUrl));
        assert.ok(calls.find((args) => args[1] === 'list').includes('all'));
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
}

test('propagates GitHub errors and rejects invalid run identity before writing', () => {
  assert.throws(() => reportNightlyFailure({ repository: 'bad', runId: '123' }), /repository/);
  assert.throws(() => reportNightlyFailure({ repository: 'owner/repo', runId: 'bad' }), /runId/);
  assert.throws(
    () =>
      reportNightlyFailure(
        { repository: 'owner/repo', runId: '123', auditResult: 'failure' },
        () => {
          throw new Error('GitHub unavailable');
        },
      ),
    /GitHub unavailable/,
  );
});

test('rejects results outside failure/cancelled before calling GitHub', () => {
  for (const auditResult of [undefined, null, '', 'success', 'skipped', 'unknown']) {
    let called = false;
    assert.throws(
      () =>
        reportNightlyFailure({ repository: 'owner/repo', runId: '123', auditResult }, () => {
          called = true;
        }),
      /auditResult/,
    );
    assert.equal(called, false);
  }
});

test('only the serialized failure notification job has issue write permission', () => {
  const workflow = parse(readFileSync('.github/workflows/nightly-audit.yml', 'utf8'));
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.jobs.audit.permissions, undefined);
  const notify = workflow.jobs['notify-failure'];
  assert.equal(notify.needs, 'audit');
  assert.equal(
    notify.if,
    "${{ always() && (needs.audit.result == 'failure' || needs.audit.result == 'cancelled') }}",
  );
  assert.deepEqual(notify.permissions, { contents: 'read', issues: 'write' });
  assert.equal(notify.concurrency['cancel-in-progress'], false);
  const reportingStep = notify.steps.find(
    (step) => step.run === 'node tools/ci-cd-platform/nightly-audit-failure.mjs',
  );
  assert.ok(reportingStep);
  assert.equal(reportingStep.env.AUDIT_RESULT, '${{ needs.audit.result }}');
  assert.ok(workflow.on.schedule);
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
});
