#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function verifyRecording(log) {
  const plain = log.replace(/\u001b\[[0-9;]*m/gu, '');
  const count = (label) => Number(plain.match(new RegExp(`│\\s*(\\d+)\\s*│ ${label}`))?.[1]);
  const successful = count('Successful Tasks');
  const cached = count('Cached Tasks');
  // Workers shares the row with Total Executed Tasks; find its own column.
  const workerCount = Number(plain.match(/│\s*(\d+)\s*│ Number of Workers/u)?.[1]);
  const reports = plain.match(
    /Reports: (\d+) processed; (\d+) rejected; (\d+) skipped with no reads/u,
  );
  assert(successful > cached, 'Recording requires a real cache miss');
  assert(workerCount > 0, 'Recording requires a Worker that executed tasks');
  assert(reports && Number(reports[1]) > 0, 'No Ultracache reports were processed');
  assert.equal(Number(reports[2]), 0, 'Ultracache rejected recording reports');
  assert.match(plain, /Config generation: [1-9]\d* pass/u, 'No configurations generated');
  return {
    successful,
    cached,
    misses: successful - cached,
    workers: workerCount,
    processed: Number(reports[1]),
    rejected: Number(reports[2]),
    skipped: Number(reports[3]),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(verifyRecording(await readFile(process.argv[2], 'utf8')), null, 2));
}
