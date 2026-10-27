import { replayCiMatrix } from './tools/ci-cd-platform/replay-ci-matrix.mjs';
import { writeFile } from 'node:fs/promises';
const results = await replayCiMatrix({ check: false });
await writeFile('.agent-tmp/replay-actual.json', JSON.stringify(results, null, 2));
console.log('cases', results.length);
