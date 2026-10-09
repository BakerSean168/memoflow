import { expect, it } from 'vitest';
import { profileImportDigest, selectProfileImportPayload } from './profile-import-manifest';

it('verifies content and nested relationships while excluding unrelated later roots', () => {
  const bindings = [{ ref: 'goals:1', targetKey: 'goal-target' }];
  const expected = {
    goals: [
      {
        ref: 'goals:1',
        name: 'Study',
        labelRefs: ['labels:1'],
        keyResults: [{ ref: 'goals:2', value: 5 }],
      },
    ],
  };
  const withUnrelated = {
    goals: [...expected.goals, { ref: 'goals:3', name: 'Later', labelRefs: [], keyResults: [] }],
  };
  expect(profileImportDigest(selectProfileImportPayload(withUnrelated, bindings))).toBe(
    profileImportDigest(expected),
  );
  const changed = structuredClone(expected);
  changed.goals[0]!.keyResults[0]!.value = 4;
  expect(profileImportDigest(changed)).not.toBe(profileImportDigest(expected));
  changed.goals[0]!.keyResults[0]!.value = 5;
  changed.goals[0]!.labelRefs = ['labels:2'];
  expect(profileImportDigest(changed)).not.toBe(profileImportDigest(expected));
  expect(profileImportDigest({ goals: [] })).not.toBe(profileImportDigest(expected));
});
