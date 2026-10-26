import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const workflow = readFileSync(
  new URL('../../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);
const shard = workflow.match(/^  web-visual:\n([\s\S]*?)(?=^  \S)/mu)?.[1];
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
  workflowScript = script,
  fail = '',
} = {}) {
  assert.ok(script, 'font prerequisite must have an executable script');
  const runnerTemp = mkdtempSync(join(tmpdir(), 'memoflow-visual-fonts-'));
  // Execute the actual workflow script without installing packages or changing host fonts.
  try {
    const result = spawnSync('bash', ['-s'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNNER_TEMP: runnerTemp,
        FONT_TEST_FAMILY: family,
        FONT_TEST_ENGLISH_FAMILY: englishFamily,
        FONT_TEST_FAIL: fail,
      },
      input: `
      sudo() {
        echo "sudo $*" >&2
        for argument in "$@"; do
          case "$argument" in
            update|install) [[ "$FONT_TEST_FAIL" != "$argument" ]] || return 1 ;;
          esac
        done
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
            printf '%s' 'WenQuanYi Zen Hei,文泉驛正黑,文泉驛正黑'
            ;;
          '-f %{family[0]} Inter:lang=en:charset=4e00')
            [[ "$FONT_TEST_FAIL" != 'match-en' ]] || return 1
            printf '%s' "$FONT_TEST_ENGLISH_FAMILY"
            ;;
          *) return 2 ;;
        esac
      }
      ${workflowScript}
    `,
    });
    const sourcePath = join(runnerTemp, 'visual-fonts.list');
    return {
      ...result,
      stderr: result.stderr.replaceAll(runnerTemp, '<runner-temp>'),
      fontsSource: existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : null,
    };
  } finally {
    rmSync(runnerTemp, { recursive: true, force: true });
  }
}

test('visual shards provision Noble fonts before comparisons; PR representatives run once', () => {
  assert.match(shard, /runs-on: ubuntu-24\.04/u);
  assert.match(
    shard,
    /matrix: \$\{\{ fromJSON\(needs.scope-detector.outputs.visual_matrix\) \}\}/u,
  );
  assert.ok(fontStep, 'font prerequisite must exist in the matrix job');
  assert.match(fontStep, /shell: bash/u);
  assert.match(fontStep, /timeout-minutes: 5/u);
  assert.match(fontStep, /if: github\.event_name != 'pull_request' \|\| strategy\.job-index == 0/u);
  assert.doesNotMatch(fontStep, /continue-on-error:/u);
  assert.match(script, /set -euo pipefail/u);
  assert.match(
    script,
    /sudo apt-get .*install --yes --no-install-recommends fonts-noto-cjk=1:20230817\+repack1-3 fonts-wqy-zenhei=0\.9\.45-8/u,
  );
  const provisionIndex = shard.indexOf('- name: Provision visual regression fonts');
  assert.ok(shard.indexOf('playwright install chromium') < provisionIndex);
  assert.ok(provisionIndex < shard.indexOf('run-ci-tasks.mjs web-visual visual-pr'));
  assert.equal((workflow.match(/name: Provision visual regression fonts/gu) ?? []).length, 1);
});

test('PR visual selection is nonempty and smaller; nightly/manual retain the full collector', () => {
  const config = YAML.parse(workflow);
  const nightly = YAML.parse(
    readFileSync(new URL('../../../.github/workflows/nightly-audit.yml', import.meta.url), 'utf8'),
  );
  assert.ok(nightly.on.schedule.length > 0);
  assert.ok(Object.hasOwn(config.on, 'workflow_dispatch'));
  const steps = config.jobs['web-visual'].steps;
  const representative = steps.find(
    (step) => step.name === 'Product visual representatives (compare only)',
  );
  const audit = steps.find((step) => step.name === 'Product visual full audit (compare only)');
  assert.equal(representative.if, "github.event_name == 'pull_request' && strategy.job-index == 0");
  assert.equal(audit.if, "github.event_name != 'pull_request'");
  assert.doesNotMatch(audit.run, /--grep|update-snapshots/u);
  assert.doesNotMatch(representative.run, /--shard|update-snapshots/u);
  const list = (args) => {
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config',
        'playwright.visual-regression.config.ts',
        '--list',
        '--reporter=json',
        ...args,
      ],
      {
        cwd: new URL('../../../apps/web', import.meta.url),
        encoding: 'utf8',
        timeout: 30000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const collect = (suite) => [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(collect)];
    return collect(JSON.parse(result.stdout));
  };
  const full = list([]);
  const selected = list(['--grep', representative.env.VISUAL_PR_GREP]);
  assert.ok(selected.length > 0 && selected.length < full.length);
  const titles = new Set(selected.map((spec) => spec.title));
  // All canonical Web surfaces survive; the removed host/width/theme cross
  // product remains reachable through the unfiltered scheduled/manual target.
  for (const spec of full.filter((spec) => spec.title.startsWith('web: '))) {
    assert.ok(titles.has(spec.title), `missing canonical representative: ${spec.title}`);
  }
  for (const file of ['matrix.spec.ts', 'composer-footer.spec.ts', 'scrollbar-gutter.spec.ts']) {
    assert.ok(
      selected.some((spec) => spec.file.endsWith(file)),
      `empty visual owner ${file}`,
    );
  }
});

test('font preflight provisions both pinned packages before checking both CJK fallbacks', () => {
  const result = runPreflight();
  assert.equal(result.status, 0, result.stderr);
  const commands = result.stderr.trim().split('\n');
  assert.match(commands[0], /^sudo apt-get .* update$/u);
  assert.match(
    commands[1],
    / install --yes --no-install-recommends fonts-noto-cjk=1:20230817\+repack1-3 fonts-wqy-zenhei=0\.9\.45-8$/u,
  );
  for (const command of commands.slice(0, 2)) {
    assert.match(command, /-o Dir::Etc::sourcelist=<runner-temp>\/visual-fonts\.list/u);
    assert.match(command, /-o Dir::Etc::sourceparts=-/u);
    assert.match(command, /-o Acquire::Retries=2/u);
    assert.match(command, /-o Acquire::http::Timeout=30/u);
    assert.match(command, /-o Acquire::https::Timeout=30/u);
    assert.match(command, /-o APT::Update::Error-Mode=any/u);
  }
  assert.equal(
    result.fontsSource,
    'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] https://archive.ubuntu.com/ubuntu noble main universe\n',
  );
  assert.deepEqual(commands.slice(2), [
    'fc-cache -f',
    'dpkg-query -W -f=${Package} ${Version}\\n fonts-noto-cjk fonts-wqy-zenhei',
    'fc-match -f %{family} Inter:lang=zh-cn',
    'fc-match -f %{family[0]} Inter:lang=en:charset=4e00',
  ]);
  assert.match(result.stdout, /fonts-noto-cjk 1:20230817\+repack1-3/u);
  assert.match(result.stdout, /fonts-wqy-zenhei 0\.9\.45-8/u);
  assert.match(result.stdout, /Inter:lang=zh-cn -> Noto Sans CJK SC/u);
  assert.match(result.stdout, /Inter:lang=en:charset=4e00 -> WenQuanYi Zen Hei/u);
});

test('font preflight selects the first English family and rejects the full alias list', () => {
  const result = runPreflight();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /fc-match -f %\{family\[0\]\} Inter:lang=en:charset=4e00/u);
  assert.doesNotMatch(result.stdout, /文泉驛正黑/u);

  const withoutFirstFamily = runPreflight({
    workflowScript: script.replace('%{family[0]}', '%{family}'),
  });
  assert.equal(withoutFirstFamily.status, 1, withoutFirstFamily.stderr);
  assert.match(
    withoutFirstFamily.stdout,
    /Inter:lang=en:charset=4e00 -> WenQuanYi Zen Hei,文泉驛正黑,文泉驛正黑/u,
  );
  assert.match(
    withoutFirstFamily.stdout,
    /::error::Visual baselines require the WenQuanYi Zen Hei/u,
  );
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
  for (const fail of ['update', 'install', 'cache', 'query', 'match-zh', 'match-en']) {
    const result = runPreflight({ fail });
    assert.notEqual(result.status, 0, `unexpected acceptance of ${fail} failure`);
    assert.doesNotMatch(result.stdout, /Inter:lang=en:charset=4e00 ->/u);
    if (fail !== 'match-en') {
      assert.doesNotMatch(result.stdout, /Visual font preflight:/u);
    }
  }
});
