import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contractRoutedProjects } from '../lib/contracts.mjs';

const required = { contract: { required: true, targets: ['test:contract'] } };

test('contract routing removes contracts from unit shards only when others remain', () => {
  assert.deepEqual(
    contractRoutedProjects({ scope: { unit: ['contracts', 'goal'] }, laneDetails: required }),
    ['contracts'],
  );
  assert.deepEqual(
    contractRoutedProjects({ scope: { unit: ['contracts'] }, laneDetails: required }),
    [],
  );
  assert.deepEqual(
    contractRoutedProjects({ scope: { unit: ['goal'] }, laneDetails: required }),
    [],
  );
  assert.deepEqual(
    contractRoutedProjects({
      scope: { unit: ['contracts', 'goal'] },
      laneDetails: { contract: { required: false, targets: [] } },
    }),
    [],
  );
});
