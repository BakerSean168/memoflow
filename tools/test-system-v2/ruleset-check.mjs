#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const ruleset = JSON.parse(await readFile('.github/rulesets/main.json', 'utf8'));
const required =
  ruleset.rules.find((rule) => rule.type === 'required_status_checks')?.parameters
    ?.required_status_checks ?? [];
// CI Check is the single aggregate gate (#488); Oracles and Delivery Observation still run but are not required.
const expected = ['CI Check'];
const actual = required.map((entry) => entry.context);
const pullRequestRule = ruleset.rules.find((rule) => rule.type === 'pull_request');
const reviewPolicy = pullRequestRule?.parameters;
const soloMaintainerPolicy =
  reviewPolicy?.required_approving_review_count === 0 &&
  reviewPolicy?.require_code_owner_review === false &&
  reviewPolicy?.require_last_push_approval === false;
if (
  ruleset.enforcement !== 'active' ||
  actual.join('\n') !== expected.join('\n') ||
  !soloMaintainerPolicy
) {
  console.error(
    '[ruleset-check] enforcement or required status contexts do not match (expected only CI Check)',
  );
  process.exit(1);
}
console.log(
  `[ruleset-check] active; required contexts: ${actual.join(', ')}; solo-maintainer review policy enabled`,
);
