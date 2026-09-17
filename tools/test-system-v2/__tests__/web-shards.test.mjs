/* eslint-disable @nx/enforce-module-boundaries -- governance test validates the Web-owned manifest */
import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';
import { WEB_FLOW_SPECS } from '../../../apps/web/web-flow-specs.mjs';

test('Web Flow shards have no omissions or duplicates', async () => {
  const manifest = JSON.parse(await readFile('tools/test-system-v2/web-shards.json', 'utf8'));
  const collected = manifest.shards.flatMap((shard) => shard.specs);
  assert.equal(collected.length, new Set(collected).size);
  assert.deepEqual([...collected].sort(), [...WEB_FLOW_SPECS].sort());
});



test('canonical Web Flow specs exist on disk and duration history has no retired specs', async () => {
  for (const spec of WEB_FLOW_SPECS) {
    await access(`apps/web/e2e/${spec}`);
  }

  const durations = JSON.parse(
    await readFile('tools/test-system-v2/web-spec-durations.json', 'utf8'),
  );
  const retiredDurationSpecs = Object.keys(durations).filter(
    (spec) => !WEB_FLOW_SPECS.includes(spec),
  );
  assert.deepEqual(retiredDurationSpecs, []);
});

test('Web Flow shard runner allocates a dynamic provider-mock port', async () => {
  const source = await readFile('tools/test-system-v2/run-web-shard.mjs', 'utf8');
  assert.match(source, /server\.listen\(0, '127\.0\.0\.1'/);
  assert.match(source, /E2E_OPENAI_MOCK_PORT: mockPort/);
});
