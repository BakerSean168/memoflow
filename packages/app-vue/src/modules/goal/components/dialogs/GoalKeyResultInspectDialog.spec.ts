import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import {
  createMockGoalMutationReceipt,
  createMockKeyResult,
  createMockGoalRecord,
} from '@memoflow/contracts/mocks';
import { GOAL_SERVICE_KEY } from '../../../../di/keys';
import { productionLocaleMessages } from '../../../../locales/production-messages';
import {
  KEY_RESULT_CALCULATION_METHODS,
  getKeyResultCalculationExplanation,
  getKeyResultCalculationLabel,
} from '../../utils';
import GoalKeyResultInspectDialog from './GoalKeyResultInspectDialog.vue';
import GoalKeyResultTrajectoryPlot from '../GoalKeyResultTrajectoryPlot.vue';

const service = { getGoalRecordsByKeyResult: vi.fn(), getGoalWorkspaceTasks: vi.fn() };
const kr = createMockKeyResult({
  id: 'kr-1' as never,
  title: 'Distance',
  description: 'Walk daily',
  weight: 3,
  progress: {
    aggregationMethod: 'Sum',
    initialValue: 10,
    currentValue: 30,
    targetValue: 50,
    unit: 'km',
  },
  target: null,
  isCompleted: false,
  progressPercentage: 50,
});
const goal = createMockGoalMutationReceipt({
  id: 'goal-1' as never,
  name: 'Walking goal',
  keyResults: [kr],
  target: { kind: 'year', year: 2026 },
  start: { kind: 'month', year: 2026, month: 9 },
  archivedAt: null,
}).readModel;
const recordDTOs = Array.from({ length: 25 }, (_, index) =>
  createMockGoalRecord({
    id: `record-${25 - index}` as never,
    keyResultId: kr.id,
    goalId: goal.id,
    recordedAt: 100000 - Math.floor(index / 2),
    value: index,
    valueAfter: 10 + index,
    authorship:
      index % 3 === 0 ? 'Manual' : index % 3 === 1 ? 'TaskAutomatic' : 'TaskUserMeasurement',
    source:
      index % 3 === 0
        ? null
        : { type: index % 2 ? 'TASK_INSTANCE' : 'TASK_TEMPLATE', id: `raw-source-${index}` },
  }),
);
enableAutoUnmount(afterEach);
beforeEach(() => {
  vi.clearAllMocks();
  service.getGoalRecordsByKeyResult.mockImplementation(async (_goal, _kr, { limit, offset }) => ({
    ok: true,
    data: {
      records: recordDTOs.slice(offset, offset + limit).map((dto) => ({ toDTO: () => dto })),
      total: recordDTOs.length,
    },
  }));
  service.getGoalWorkspaceTasks.mockResolvedValue({
    ok: true,
    data: {
      items: [
        {
          taskPlanId: 'task-1',
          name: 'Morning walk',
          keyResultId: kr.id,
          status: 'Active',
          outcome: 'None',
          hasContribution: true,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    },
  });
});
function open(locale = 'en-US', keyResult = kr) {
  const i18n = createI18n({ legacy: false, locale, messages: productionLocaleMessages });
  const wrapper = mount(GoalKeyResultInspectDialog, {
    props: { goal, keyResult, recordRevision: 0, taskAvailability: 'Available' },
    global: { plugins: [i18n], provide: { [GOAL_SERVICE_KEY as symbol]: service } },
    attachTo: document.body,
  });
  return { wrapper, t: i18n.global.t };
}
function dialog() {
  return document.querySelector<HTMLElement>('[data-testid="goal-kr-inspect"]')!;
}
async function click(testId: string) {
  dialog().querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.click();
  await flushPromises();
}

describe.each(['en-US', 'zh-CN'])('KR Inspect in %s', (locale) => {
  it.each(KEY_RESULT_CALCULATION_METHODS)(
    'shows core metadata and owner explanation for %s without edit controls',
    async (method) => {
      const { wrapper, t } = open(locale, {
        ...kr,
        progress: { ...kr.progress, aggregationMethod: method },
      });
      await flushPromises();
      const surface = dialog();
      expect(surface.textContent).toContain('Distance');
      expect(surface.textContent).toContain('Walk daily');
      expect(surface.textContent).toContain('10 km');
      expect(surface.textContent).toContain('30 km');
      expect(surface.textContent).toContain('50 km');
      expect(surface.textContent).toContain('2026');
      expect(surface.textContent).toContain(t('goal.inspect.incomplete'));
      expect(surface.textContent).toContain(getKeyResultCalculationLabel(method, t));
      expect(
        surface.querySelector('[data-testid="goal-inspect-method-explanation"]')?.textContent,
      ).toBe(getKeyResultCalculationExplanation(method, t));
      expect(surface.querySelector('input, textarea, [role="combobox"]')).toBeNull();
      expect(wrapper.findComponent(GoalKeyResultTrajectoryPlot).props()).toMatchObject({
        readonly: true,
        size: 'inspect',
      });
      expect(surface.querySelector('svg')?.getAttribute('class')).toContain('h-40');
      expect(surface.textContent).not.toMatch(/goal\.(inspect|dialog)\./);
    },
  );

  it('reads beyond recent progress with canonical ordering and safe provenance', async () => {
    const { t } = open(locale);
    await flushPromises();
    expect(service.getGoalRecordsByKeyResult).toHaveBeenCalledExactlyOnceWith('goal-1', 'kr-1', {
      limit: 20,
      offset: 0,
    });
    expect(dialog().querySelectorAll('[data-record-id]')).toHaveLength(20);
    expect(dialog().textContent).toContain(t('goal.inspect.loaded', { count: 20, total: 25 }));
    await click('goal-inspect-records-more');
    expect(service.getGoalRecordsByKeyResult).toHaveBeenLastCalledWith('goal-1', 'kr-1', {
      limit: 20,
      offset: 20,
    });
    expect(
      Array.from(dialog().querySelectorAll('[data-record-id]'), (node) =>
        node.getAttribute('data-record-id'),
      ),
    ).toEqual(recordDTOs.map((dto) => dto.id));
    expect(dialog().querySelector('[data-testid="goal-inspect-records-more"]')).toBeNull();
    for (const authorship of ['Manual', 'TaskAutomatic', 'TaskUserMeasurement'])
      expect(dialog().textContent).toContain(
        t(`goal.cards.cardsRecordCard.authorship.${authorship}`),
      );
    expect(dialog().textContent).toContain(t('goal.inspect.taskOccurrenceSource'));
    expect(dialog().textContent).toContain(t('goal.inspect.taskPlanSource'));
    expect(dialog().textContent).not.toContain('raw-source-');
  });
});

it('delegates check-in and Task navigation without any metadata or Task mutation command', async () => {
  const { wrapper } = open();
  await flushPromises();
  await click('goal-inspect-check-in');
  expect(wrapper.emitted('check-in')).toHaveLength(1);
  Array.from(dialog().querySelectorAll('button'))
    .find((button) => button.textContent?.includes('Morning walk'))!
    .click();
  expect(wrapper.emitted('open-task')).toEqual([['task-1']]);
  await click('goal-inspect-task-scope');
  expect(wrapper.emitted('open-task-scope')).toHaveLength(1);
  expect(service.getGoalWorkspaceTasks).toHaveBeenCalledExactlyOnceWith('goal-1', {
    keyResultId: 'kr-1',
    limit: 20,
    offset: 0,
  });
  const source = readFileSync(resolve(__dirname, 'GoalKeyResultInspectDialog.vue'), 'utf8');
  expect(source).not.toMatch(
    /useTask|TASK_SERVICE_KEY|updateKeyResult|createTask|deleteTask|completeTask/,
  );
});

it('retries failed history reads and reloads records after the owner composer saves', async () => {
  service.getGoalRecordsByKeyResult.mockRejectedValueOnce(new Error('Offline'));
  const { wrapper } = open();
  await flushPromises();
  expect(dialog().querySelector('[role="alert"]')).not.toBeNull();
  await click('goal-inspect-records-more');
  expect(dialog().querySelectorAll('[data-record-id]')).toHaveLength(20);
  await wrapper.setProps({ recordRevision: 1 });
  await flushPromises();
  expect(service.getGoalRecordsByKeyResult).toHaveBeenLastCalledWith('goal-1', 'kr-1', {
    limit: 20,
    offset: 0,
  });
});

it('ignores stale record and Task responses after switching KR', async () => {
  let finish!: (data: unknown) => void;
  service.getGoalRecordsByKeyResult.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  let finishTasks!: (data: unknown) => void;
  service.getGoalWorkspaceTasks.mockReturnValueOnce(
    new Promise((resolve) => {
      finishTasks = resolve;
    }),
  );
  const { wrapper } = open();
  await wrapper.setProps({ keyResult: { ...kr, id: 'kr-2' as never } });
  await flushPromises();
  finish({
    ok: true,
    data: { records: [{ toDTO: () => ({ ...recordDTOs[0], id: 'stale' }) }], total: 1 },
  });
  await flushPromises();
  finishTasks({
    ok: true,
    data: { items: [{ taskPlanId: 'stale-task', name: 'Stale task' }], total: 1 },
  });
  await flushPromises();
  expect(dialog().querySelector('[data-record-id="stale"]')).toBeNull();
  expect(dialog().textContent).not.toContain('Stale task');
  expect(service.getGoalRecordsByKeyResult).toHaveBeenLastCalledWith('goal-1', 'kr-2', {
    limit: 20,
    offset: 0,
  });
});

it('uses the accessible bounded shell and closes through Escape and its explicit button', async () => {
  const { wrapper } = open();
  await flushPromises();
  expect(dialog().getAttribute('role')).toBe('dialog');
  expect(dialog().getAttribute('aria-labelledby')).toBeTruthy();
  expect(dialog().getAttribute('aria-describedby')).toBeTruthy();
  expect(dialog().className).toContain('h-[calc(100dvh-2rem)]');
  expect(dialog().querySelector('[data-testid="product-dialog-body"]')?.className).toContain(
    'overflow-y-auto',
  );
  await click('goal-kr-inspect-close');
  expect(wrapper.emitted('close')).toHaveLength(1);
  dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await flushPromises();
  expect(wrapper.emitted('close')).toHaveLength(2);
});

it('pages linked Tasks independently, retries read failures and honors unavailable context', async () => {
  const items = Array.from({ length: 21 }, (_, i) => ({
    taskPlanId: `task-${i}`,
    name: `Walk ${i}`,
    keyResultId: kr.id,
  }));
  service.getGoalWorkspaceTasks.mockRejectedValueOnce(new Error('Offline'));
  const { wrapper } = open();
  await flushPromises();
  expect(
    dialog().querySelector('[data-testid="goal-inspect-tasks"] [role="alert"]'),
  ).not.toBeNull();
  service.getGoalWorkspaceTasks.mockImplementation(async (_id, { limit, offset }) => ({
    ok: true,
    data: { items: items.slice(offset, offset + limit), total: 21 },
  }));
  await click('goal-inspect-tasks-more');
  await click('goal-inspect-tasks-more');
  expect(service.getGoalWorkspaceTasks).toHaveBeenLastCalledWith('goal-1', {
    keyResultId: 'kr-1',
    limit: 20,
    offset: 20,
  });
  expect(dialog().querySelector('[data-testid="goal-inspect-tasks-more"]')).toBeNull();
  await wrapper.setProps({ taskAvailability: 'Unavailable' });
  await flushPromises();
  expect(dialog().textContent).toContain('Task context is unavailable.');
  expect(service.getGoalWorkspaceTasks).toHaveBeenCalledTimes(3);
});

it('shows safe missing-source, empty history, description and inherited-timeframe fallbacks', async () => {
  service.getGoalRecordsByKeyResult.mockResolvedValueOnce({
    ok: true,
    data: { records: [{ toDTO: () => ({ ...recordDTOs[1], source: null }) }], total: 1 },
  });
  const { wrapper } = open('en-US', { ...kr, description: null, isCompleted: true });
  await flushPromises();
  expect(dialog().textContent).toContain('Source context unavailable.');
  expect(dialog().textContent).not.toContain('Source: Manual Goal check-in.');
  expect(dialog().textContent).toContain('No description');
  expect(dialog().textContent).toContain('Completed');
  service.getGoalRecordsByKeyResult.mockResolvedValueOnce({
    ok: true,
    data: { records: [], total: 0 },
  });
  await wrapper.setProps({ goal: { ...goal, start: null, target: null }, recordRevision: 1 });
  await flushPromises();
  expect(dialog().textContent).toContain('No records yet.');
  expect(dialog().textContent).toContain('Not set');
});
