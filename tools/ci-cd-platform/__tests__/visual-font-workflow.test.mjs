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

function runPreflight({
  family = 'Noto Sans CJK SC',
  englishFamily = 'WenQuanYi Zen Hei',
  fail = '',
} = {}) {
  assert.ok(script, 'font prerequisite must have an executable script');
  // Execute the actual workflow script without installing packages or changing host fonts.
  return spawnSync('bash', ['-s'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FONT_TEST_FAMILY: family,
      FONT_TEST_ENGLISH_FAMILY: englishFamily,
      FONT_TEST_FAIL: fail,
    },
    input: `
      sudo() {
        echo "sudo $*" >&2
        [[ "$FONT_TEST_FAIL" != "$*" ]]
      }
      fc-cache() {
        echo "fc-cache $*" >&2
        [[ "$FONT_TEST_FAIL" != 'cache' ]]
      }
      dpkg-query() {
        echo "dpkg-query $*" >&2
        [[ "$FONT_TEST_FAIL" != 'query' ]] || return 1
        printf '%s\\n' 'fonts-noto-cjk 1:20230817+repack1-3' 'fonts-wqy-zenhei 0.9.45-8'
      }
      fc-match() {
        echo "fc-match $*" >&2
        case "$*" in
          '-f %{family} Inter:lang=zh-cn')
            [[ "$FONT_TEST_FAIL" != 'match-zh' ]] || return 1
            printf '%s' "$FONT_TEST_FAMILY"
            ;;
          '-f %{family} Inter:lang=en:charset=4e00')
            [[ "$FONT_TEST_FAIL" != 'match-en' ]] || return 1
            printf '%s' "$FONT_TEST_ENGLISH_FAMILY"
            ;;
          *) return 2 ;;
        esac
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
    /sudo apt-get install --yes --no-install-recommends fonts-noto-cjk=1:20230817\+repack1-3 fonts-wqy-zenhei=0\.9\.45-8/u,
  );
  const provisionIndex = shard.indexOf('- name: Provision visual regression fonts');
  assert.ok(shard.indexOf('playwright install chromium') < provisionIndex);
  assert.ok(provisionIndex < shard.indexOf('run-web-shard.mjs'));
  assert.ok(provisionIndex < shard.indexOf('nx run web:e2e:visual-regression'));
  assert.equal((workflow.match(/name: Provision visual regression fonts/gu) ?? []).length, 1);
});

test('font preflight provisions both pinned packages before checking both CJK fallbacks', () => {
  const result = runPreflight();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stderr.trim().split('\n'), [
    'sudo apt-get update',
    'sudo apt-get install --yes --no-install-recommends fonts-noto-cjk=1:20230817+repack1-3 fonts-wqy-zenhei=0.9.45-8',
    'fc-cache -f',
    'dpkg-query -W -f=${Package} ${Version}\\n fonts-noto-cjk fonts-wqy-zenhei',
    'fc-match -f %{family} Inter:lang=zh-cn',
    'fc-match -f %{family} Inter:lang=en:charset=4e00',
  ]);
  assert.match(result.stdout, /fonts-noto-cjk 1:20230817\+repack1-3/u);
  assert.match(result.stdout, /fonts-wqy-zenhei 0\.9\.45-8/u);
  assert.match(result.stdout, /Inter:lang=zh-cn -> Noto Sans CJK SC/u);
  assert.match(result.stdout, /Inter:lang=en:charset=4e00 -> WenQuanYi Zen Hei/u);
});

test('font preflight fails closed on missing glyph coverage or either wrong fallback', () => {
  for (const family of ['', 'DejaVu Sans', 'Noto Sans CJK JP', 'Noto Sans CJK SC,DejaVu Sans']) {
    const result = runPreflight({ family });
    assert.equal(result.status, 1, `unexpected acceptance of Chinese fallback ${family}`);
    assert.match(result.stdout, /::error::Visual baselines require the Noto Sans CJK SC/u);
    assert.doesNotMatch(result.stderr, /Inter:lang=en:charset=4e00/u);
  }
  for (const englishFamily of [
    '',
    'DejaVu Sans',
    'Noto Sans CJK SC',
    'WenQuanYi Zen Hei,DejaVu Sans',
  ]) {
    const result = runPreflight({ englishFamily });
    assert.equal(result.status, 1, `unexpected acceptance of English fallback ${englishFamily}`);
    assert.match(result.stdout, /Inter:lang=zh-cn -> Noto Sans CJK SC/u);
    assert.match(result.stdout, /::error::Visual baselines require the WenQuanYi Zen Hei/u);
  }
});

test('font preflight fails closed on provisioning, cache, or fontconfig command errors', () => {
  for (const fail of [
    'apt-get update',
    'apt-get install --yes --no-install-recommends fonts-noto-cjk=1:20230817+repack1-3 fonts-wqy-zenhei=0.9.45-8',
    'cache',
    'query',
    'match-zh',
    'match-en',
  ]) {
    const result = runPreflight({ fail });
    assert.notEqual(result.status, 0, `unexpected acceptance of ${fail} failure`);
    assert.doesNotMatch(result.stdout, /Inter:lang=en:charset=4e00 ->/u);
    if (fail !== 'match-en') {
      assert.doesNotMatch(result.stdout, /Visual font preflight:/u);
    }
  }
});
