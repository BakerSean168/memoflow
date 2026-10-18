import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const label = 'nightly-audit-failure';

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', timeout: 30_000 }).trim();
}

/** The workflow serializes callers so two failures cannot create duplicate issues. */
export function reportNightlyFailure({ repository, runId, summaryPath }, run = gh) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Invalid repository');
  if (!/^\d+$/.test(runId ?? '')) throw new Error('Invalid runId');
  const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
  const body = `Nightly Web Flow Audit failed: ${runUrl}`;
  if (summaryPath)
    appendFileSync(summaryPath, `## Nightly audit failure\n\n[Failed run](${runUrl})\n\n`);
  run([
    'label',
    'create',
    label,
    '--repo',
    repository,
    '--color',
    'B60205',
    '--description',
    'Nightly Web Flow Audit failures',
    '--force',
  ]);
  const issues = JSON.parse(
    run([
      'issue',
      'list',
      '--repo',
      repository,
      '--label',
      label,
      '--state',
      'all',
      '--limit',
      '1',
      '--json',
      'number,state,url',
    ]),
  );
  if (!Array.isArray(issues)) throw new Error('Invalid GitHub issue list');
  const issue = issues[0];
  let issueUrl;
  if (issue) {
    if (
      !Number.isSafeInteger(issue.number) ||
      !['OPEN', 'CLOSED'].includes(issue.state) ||
      issue.url !== `https://github.com/${repository}/issues/${issue.number}`
    ) {
      throw new Error('Invalid GitHub tracking issue');
    }
    if (issue.state === 'CLOSED')
      run(['issue', 'reopen', String(issue.number), '--repo', repository]);
    run(['issue', 'comment', String(issue.number), '--repo', repository, '--body', body]);
    issueUrl = issue.url;
  } else {
    issueUrl = run([
      'issue',
      'create',
      '--repo',
      repository,
      '--label',
      label,
      '--title',
      'Nightly Web Flow Audit failures',
      '--body',
      body,
    ]).trim();
    if (!issueUrl.startsWith(`https://github.com/${repository}/issues/`))
      throw new Error('Invalid created issue URL');
  }
  if (summaryPath) appendFileSync(summaryPath, `[Tracking issue](${issueUrl})\n`);
}

if (import.meta.main) {
  reportNightlyFailure({
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    summaryPath: process.env.GITHUB_STEP_SUMMARY,
  });
}
