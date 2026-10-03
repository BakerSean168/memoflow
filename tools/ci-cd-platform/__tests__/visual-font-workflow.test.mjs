import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);
const shard = workflow.match(/^  web-flow-shard:\n([\s\S]*?)(?=^  \S)/mu)?.[1];
assert.ok(shard, 'Web Flow shard job must exist');
const fontStep = shard.match(
  /      - name: Provision visual regression fonts\n([\s\S]*?)(?=^      - |^      #)/mu,
)?.[1];
const script = fontStep
  ?.split('        run: |\n')[1]
  ?.split('\n')
  .map((line) => line.replace(/^ {10}/u, ''))
  .join('\n');

function runPreflight({ family = 'Noto Sans CJK SC', fail = '' } = {}) {
  assert.ok(script, 'font prerequisite must have an executable script');
  // Execute the actual workflow script without installing packages or changing host fonts.
  return spawnSync('bash', ['-s'], {
    encoding: 'utf8',
    env: { ...process.env, FONT_TEST_FAMILY: family, FONT_TEST_FAIL: fail },
    input: `
      sudo() {
        echo "$*"
        [[ "$FONT_TEST_FAIL" != "$*" ]]
      }
      fc-cache() {
        echo "fc-cache $*"
        [[ "$FONT_TEST_FAIL" != 'cache' ]]
      }
      dpkg-query() { echo 'fonts-noto-cjk 1:20230817+repack1-3'; }
      fc-match() {
        [[ "$*" == '-f %{family} Inter:lang=zh-cn' ]] || return 2
        [[ "$FONT_TEST_FAIL" != 'match' ]] || return 1
        printf '%s' "$FONT_TEST_FAMILY"
      }
      ${script}
    `,
  });
}

test('every Web Flow shard provisions Noble fonts before functional and visual browser tests', () => {
  assert.match(shard, /runs-on: ubuntu-24\.04/u);
  assert.match(shard, /shard: \['1\/4', '2\/4', '3\/4', '4\/4'\]/u);
  assert.ok(fontStep, 'font prerequisite must exist in the matrix job');
  assert.match(fontStep, /shell: bash/u);
  assert.doesNotMatch(fontStep, /(?:if:|continue-on-error:)/u);
  assert.match(script, /set -euo pipefail/u);
  assert.match(
    script,
    /sudo apt-get install --yes --no-install-recommends fonts-noto-cjk=1:20230817\+repack1-3/u,
  );
  const provisionIndex = shard.indexOf('- name: Provision visual regression fonts');
  assert.ok(shard.indexOf('playwright install chromium') < provisionIndex);
  assert.ok(provisionIndex < shard.indexOf('run-web-shard.mjs'));
  assert.ok(provisionIndex < shard.indexOf('nx run web:e2e:visual-regression'));
  assert.equal((workflow.match(/name: Provision visual regression fonts/gu) ?? []).length, 1);
});

test('font preflight refreshes the cache and reports the matching Chinese fallback', () => {
  const result = runPreflight();
  assert.equal(result.status, 0, result.stderr);
  const updateIndex = result.stdout.indexOf('apt-get update');
  const installIndex = result.stdout.indexOf('apt-get install');
  const cacheIndex = result.stdout.indexOf('fc-cache -f');
  const preflightIndex = result.stdout.indexOf('Visual font preflight:');
  assert.ok(updateIndex >= 0 && updateIndex < installIndex);
  assert.ok(installIndex < cacheIndex && cacheIndex < preflightIndex);
  assert.match(result.stdout, /Inter:lang=zh-cn -> Noto Sans CJK SC/u);
});

test('font preflight fails closed on missing glyph coverage or the wrong regional fallback', () => {
  for (const family of ['', 'DejaVu Sans', 'Noto Sans CJK JP']) {
    const result = runPreflight({ family });
    assert.equal(result.status, 1, `unexpected acceptance of ${family}`);
    assert.match(result.stdout, /::error::Visual baselines require/u);
  }
});

test('font preflight fails closed on provisioning, cache, or fontconfig command errors', () => {
  for (const fail of [
    'apt-get update',
    'apt-get install --yes --no-install-recommends fonts-noto-cjk=1:20230817+repack1-3',
    'cache',
    'match',
  ]) {
    const result = runPreflight({ fail });
    assert.notEqual(result.status, 0, `unexpected acceptance of ${fail} failure`);
    assert.doesNotMatch(result.stdout, /Visual font preflight:/u);
  }
});
