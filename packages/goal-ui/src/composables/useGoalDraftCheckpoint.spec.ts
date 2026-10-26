import { installGoalUiHost } from '@goal-ui-test-host/di/goal-ui-host';
import { expect, it, vi } from 'vitest';
import {
  GoalStatus,
  type GoalDraftCheckpointSnapshot,
  type GoalNativeDraftDTO,
} from '@memoflow/goal-contracts';
import {
  GoalDraftCheckpointConflict,
  type GoalDraftCheckpointStore,
} from '../infrastructure/goal-draft-checkpoint.indexeddb';
import { useGoalDraftCheckpoint } from './useGoalDraftCheckpoint';

const draft: GoalNativeDraftDTO = {
  name: 'Draft',
  summary: '',
  description: 'Human edits',
  status: GoalStatus.Planned,
  start: null,
  target: null,
  reminderConfig: null,
  labelIds: [],
  keyResults: [],
};
function fixture() {
  let scope = 'identity';
  const rows = new Map<string, GoalDraftCheckpointSnapshot>();
  const store: GoalDraftCheckpointStore = {
    scope: () => scope,
    load: vi.fn(async (key) =>
      structuredClone(rows.get(key) ?? { scope: key, version: 0, content: null }),
    ),
    write: vi.fn(async (key, version, content) => {
      if (key !== scope) throw new Error('Identity changed');
      const current = rows.get(key) ?? { scope: key, version: 0, content: null };
      if (current.version !== version) throw new GoalDraftCheckpointConflict(current);
      const next = structuredClone({ scope: key, version: version + 1, content });
      rows.set(key, next);
      return next;
    }),
  };
  return {
    store,
    rows,
    setScope: (value: string) => {
      scope = value;
    },
  };
}

it('restores human edits independently and keeps one durable create ID through submission and reload', async () => {
  const f = fixture();
  const first = useGoalDraftCheckpoint(f.store);
  await first.begin();
  first.capture(draft, null);
  await vi.waitFor(() => expect(first.status.value).toBe('saved'));
  const createId = first.content.value!.createId;
  expect(await first.prepare({ ...draft, name: 'Edited' })).toBe(true);
  expect(first.status.value).toBe('pending');
  const restored = useGoalDraftCheckpoint(f.store);
  expect(await restored.begin()).toMatchObject({
    createId,
    phase: 'submit_pending',
    draft: { name: 'Edited' },
  });
  expect(restored.blocked.value).toBe(true);
  expect(await restored.prepare(draft)).toBe(false);
  // A verified missing native receipt permits editing, retaining the same ID.
  expect(await restored.allowEditing()).toBe(true);
  expect(restored.content.value?.createId).toBe(createId);
  expect(await restored.complete()).toBe(true);
  expect(f.rows.get('identity')).toMatchObject({ version: 4, content: null });
});

it('preserves the losing window content and refuses to overwrite a newer checkpoint', async () => {
  const f = fixture();
  const first = useGoalDraftCheckpoint(f.store);
  const second = useGoalDraftCheckpoint(f.store);
  await Promise.all([first.begin(), second.begin()]);
  first.capture(draft, null);
  await vi.waitFor(() => expect(first.status.value).toBe('saved'));
  second.capture({ ...draft, name: 'Other window' }, null);
  await vi.waitFor(() => expect(second.status.value).toBe('conflict'));
  expect(await second.prepare(draft)).toBe(false);
  expect(f.rows.get('identity')?.content?.draft.name).toBe('Draft');
  expect((await second.begin())?.draft.name).toBe('Draft');
  expect(second.blocked.value).toBe(false);
});

it('restores an AI-owned checkpoint frozen and accepts only its matching fresh capability', async () => {
  const f = fixture();
  const first = useGoalDraftCheckpoint(f.store);
  await first.begin();
  first.capture(draft, 'run');
  await vi.waitFor(() => expect(first.status.value).toBe('saved'));
  const restored = useGoalDraftCheckpoint(f.store);
  await restored.begin();
  expect(restored.status.value).toBe('workflow');
  expect(restored.adoptWorkflow('foreign')).toBe(false);
  expect(restored.adoptWorkflow('run')).toBe(true);
  expect(restored.blocked.value).toBe(false);
});

it('does not read another identity and reports storage failure without clearing the editor', async () => {
  const f = fixture();
  const first = useGoalDraftCheckpoint(f.store);
  await first.begin();
  first.capture(draft, null);
  await vi.waitFor(() => expect(first.status.value).toBe('saved'));
  first.stop();
  f.setScope('new-identity');
  expect(await first.begin()).toBeNull();
  expect(first.content.value).toBeNull();
  vi.mocked(f.store.write).mockRejectedValueOnce(new Error('Storage unavailable'));
  first.capture(draft, null);
  await vi.waitFor(() => expect(first.status.value).toBe('unavailable'));
  expect(await first.prepare(draft)).toBe(false);
  expect(draft.name).toBe('Draft');
});

installGoalUiHost();
