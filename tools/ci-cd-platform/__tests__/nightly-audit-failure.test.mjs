import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { reportNightlyFailure } from '../nightly-audit-failure.mjs';

for (const state of [null, 'OPEN', 'CLOSED']) {
  test(`reports a failed audit with tracking issue state ${state}`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'nightly-audit-'));
    try {
      const calls = [];
      const summaryPath = join(directory, 'summary.md');
      const issueUrl = 'https://github.com/BakerSean168/memoflow/issues/900';
      reportNightlyFailure(
        { repository: 'BakerSean168/memoflow', runId: '123', summaryPath },
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
            'Nightly Web Flow Audit failed: https://github.com/BakerSean168/memoflow/actions/runs/123',
          ),
      );
      const summary = readFileSync(summaryPath, 'utf8');
      assert.ok(summary.includes('/actions/runs/123'));
      assert.ok(summary.includes(issueUrl));
      assert.ok(calls.find((args) => args[1] === 'list').includes('all'));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('propagates GitHub errors and rejects invalid run identity before writing', () => {
  assert.throws(() => reportNightlyFailure({ repository: 'bad', runId: '123' }), /repository/);
  assert.throws(() => reportNightlyFailure({ repository: 'owner/repo', runId: 'bad' }), /runId/);
  assert.throws(
    () =>
      reportNightlyFailure({ repository: 'owner/repo', runId: '123' }, () => {
        throw new Error('GitHub unavailable');
      }),
    /GitHub unavailable/,
  );
});

test('only the serialized failure notification job has issue write permission', () => {
  const workflow = parse(readFileSync('.github/workflows/web-flow-audit.yml', 'utf8'));
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.jobs.audit.permissions, undefined);
  const notify = workflow.jobs['notify-failure'];
  assert.equal(notify.needs, 'audit');
  assert.ok(notify.if.includes("needs.audit.result == 'failure'"));
  assert.deepEqual(notify.permissions, { contents: 'read', issues: 'write' });
  assert.equal(notify.concurrency['cancel-in-progress'], false);
  assert.ok(
    notify.steps.some((step) => step.run === 'node tools/ci-cd-platform/nightly-audit-failure.mjs'),
  );
});
