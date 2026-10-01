import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoutineDefinitionDto, RoutineTriggerDto } from '@memoflow/contracts/routine';
import { RoutineTriggerSchema } from '@memoflow/contracts/routine';
import { requireTimeZoneId, requireYmd } from '@memoflow/contracts/primitives';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { productionLocaleMessages } from '../../../locales/production-messages';
import { getProductTodayYmd, setProductTimePreferences } from '../../../shared/utils/product-time';
import RoutineEditorDialog from './RoutineEditorDialog.vue';

const wallClock: RoutineTriggerDto = {
  type: 'WallClock',
  timingOwner: 'scheduler',
  localTime: '07:45',
  timeZone: requireTimeZoneId('America/New_York'),
  recurrence: {
    startDate: requireYmd('2026-10-15'),
    frequency: 'daily',
    interval: 1,
    byWeekday: [],
    count: null,
    until: null,
  },
};
const wrappers: ReturnType<typeof mount>[] = [];

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  setProductTimePreferences(createDefaultUserPreferenceProfile());
  vi.restoreAllMocks();
});

function element(selector: string) {
  return new DOMWrapper(document.querySelector(selector)!);
}
function testId(id: string) {
  return element(`[data-testid="${id}"]`);
}

async function openEditor(trigger?: RoutineTriggerDto, saving = false, locale = 'en-US') {
  vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Asia/Tokyo', 'America/New_York']);
  const profile = createDefaultUserPreferenceProfile();
  setProductTimePreferences({
    ...profile,
    regional: { ...profile.regional, timeZone: 'Asia/Shanghai' },
  });
  const routine: RoutineDefinitionDto | null = trigger
    ? {
        id: 'routine-1',
        name: 'Morning',
        description: null,
        enabled: true,
        trigger,
        version: 1,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      }
    : null;
  const wrapper = mount(RoutineEditorDialog, {
    props: { open: true, profiles: [], routine, saving },
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: productionLocaleMessages })],
    },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await flushPromises();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await flushPromises();
  return wrapper;
}

async function submit(wrapper: Awaited<ReturnType<typeof openEditor>>) {
  await element('#routine-editor-form').trigger('submit');
  const saved = wrapper.emitted('save')?.at(-1)?.[0] as { trigger: RoutineTriggerDto } | undefined;
  if (saved) expect(RoutineTriggerSchema.safeParse(saved.trigger).success).toBe(true);
  return saved?.trigger;
}

async function openChip(id: string) {
  await testId(id).trigger('click');
  await flushPromises();
}

async function editNumber(name: string, value: string) {
  const input = element(`[data-testid="routine-${name}"] input`);
  await input.setValue(value);
  await input.trigger('blur');
  await flushPromises();
}

describe('RoutineEditorDialog Product controls', () => {
  it('defaults a new WallClock to Product zone and Product today', async () => {
    // A fixed instant is already the following day in the Product zone.
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-01T20:00:00Z'));
    const wrapper = await openEditor();
    await testId('routine-name-input').setValue('New routine');
    await openChip('routine-trigger-type');
    await testId('routine-trigger-option-WallClock').trigger('click');
    await flushPromises();
    const trigger = await submit(wrapper);
    expect(getProductTodayYmd()).toBe('2026-10-02');
    expect(trigger).toEqual({
      ...wallClock,
      localTime: '09:00',
      timeZone: 'Asia/Shanghai',
      recurrence: { ...wallClock.recurrence, startDate: '2026-10-02' },
    });
  });

  it('localizes time accessibility and timezone search/default/empty text in zh-CN', async () => {
    const wrapper = await openEditor(
      { ...wallClock, timeZone: requireTimeZoneId('Asia/Shanghai') },
      false,
      'zh-CN',
    );
    expect(testId('routine-local-time-hour').attributes('aria-label')).toBe('小时');
    expect(testId('routine-local-time-minute').attributes('aria-label')).toBe('分钟');
    expect(testId('routine-time-zone').attributes('aria-label')).toBe('时区');
    expect(testId('routine-time-zone').text()).toContain('默认时区');
    await openChip('routine-time-zone');
    expect(testId('routine-time-zone-search').attributes('placeholder')).toBe('搜索时区…');
    expect(element('[data-zone-id="Asia/Shanghai"]').text()).toContain('默认时区');
    await testId('routine-time-zone-search').setValue('Mars/Olympus_Mons');
    await flushPromises();
    expect(document.body.textContent).toContain('未找到时区');
    expect(await submit(wrapper)).toEqual({ ...wallClock, timeZone: 'Asia/Shanghai' });
  });

  it('saves an existing zone override, Hm and Ymd unchanged', async () => {
    const wrapper = await openEditor(wallClock);
    expect(testId('routine-local-time-hour').element).toHaveProperty('value', '07');
    expect(testId('routine-local-time-minute').element).toHaveProperty('value', '45');
    expect(testId('routine-time-zone').text()).toContain('America/New_York');
    expect(await submit(wrapper)).toEqual(wallClock);
  });

  it('emits exact selected time/date/zone and retains day-only date precision', async () => {
    const wrapper = await openEditor(wallClock);
    await testId('routine-local-time-hour').setValue('18');
    await testId('routine-local-time-minute').setValue('20');
    await openChip('routine-start-date');
    expect(document.querySelector('[data-testid="routine-start-date-precision-month"]')).toBeNull();
    await testId('routine-start-date-query').setValue('2026/11/03');
    await testId('routine-start-date-query').trigger('keydown', { key: 'Enter' });
    await element('[data-testid="routine-start-date-query"]').trigger('keydown', { key: 'Escape' });
    await flushPromises();
    await openChip('routine-time-zone');
    await testId('routine-time-zone-search').setValue('Asia/Tokyo');
    await flushPromises();
    await element('[data-zone-id="Asia/Tokyo"]').trigger('click');
    expect(await submit(wrapper)).toEqual({
      ...wallClock,
      localTime: '18:20',
      timeZone: 'Asia/Tokyo',
      recurrence: { ...wallClock.recurrence, startDate: '2026-11-03' },
    });
  });

  it('keeps invalid Hm drafts from changing the persisted value', async () => {
    const wrapper = await openEditor(wallClock);
    await testId('routine-local-time-hour').setValue('24');
    await testId('routine-local-time-hour').trigger('blur');
    expect(testId('routine-local-time-hour').element).toHaveProperty('value', '07');
    expect(await submit(wrapper)).toEqual(wallClock);
  });

  it('keeps recurrence interval at its minimum through keyboard stepping and typed input', async () => {
    const wrapper = await openEditor(wallClock);
    const input = element('[data-testid="routine-recurrenceInterval"] input');
    expect(input.attributes('aria-valuemin')).toBe('1');
    await input.trigger('keydown', { key: 'ArrowDown' });
    await editNumber('recurrenceInterval', '0');
    expect(await submit(wrapper)).toEqual(wallClock);
  });

  it.each(['last-satisfied', 'routine-activation', 'profile-activation'] as const)(
    'preserves Elapsed %s and its duration minimum',
    async (anchor) => {
      const trigger: RoutineTriggerDto =
        anchor === 'profile-activation'
          ? { type: 'Elapsed', timingOwner: 'local-runtime', durationMs: 60_000, anchor }
          : { type: 'Elapsed', timingOwner: 'scheduler', durationMs: 60_000, anchor };
      const wrapper = await openEditor(trigger);
      expect(await submit(wrapper)).toEqual(trigger);
      await openChip('routine-duration-chip');
      expect(
        element('[data-testid="routine-durationMinutes"] input').attributes('aria-valuemin'),
      ).toBe('1');
      await editNumber('durationMinutes', '0');
      expect(await submit(wrapper)).toEqual(trigger);
    },
  );

  it.each(['last-satisfied', 'profile-activation'] as const)(
    'preserves ActiveUsage %s and minima 1/0',
    async (anchor) => {
      const trigger: RoutineTriggerDto = {
        type: 'ActiveUsage',
        timingOwner: 'local-runtime',
        requiredActiveMs: 60_000,
        anchor,
        naturalBreakCredit: null,
        protocolBreakCredit: null,
      };
      const wrapper = await openEditor(trigger);
      expect(await submit(wrapper)).toEqual(trigger);
      await openChip('routine-active-duration-chip');
      expect(
        element('[data-testid="routine-activeMinutes"] input').attributes('aria-valuemin'),
      ).toBe('1');
      await editNumber('activeMinutes', '0');
      await element('[data-testid="routine-activeMinutes"] input').trigger('keydown', {
        key: 'Escape',
      });
      await flushPromises();
      await openChip('routine-natural-break-chip');
      expect(
        element('[data-testid="routine-naturalBreakMinutes"] input').attributes('aria-valuemin'),
      ).toBe('0');
      await editNumber('naturalBreakMinutes', '-1');
      expect(await submit(wrapper)).toEqual(trigger);
      await editNumber('naturalBreakMinutes', '5');
      expect(await submit(wrapper)).toEqual({
        ...trigger,
        naturalBreakCredit: { idleDurationMs: 300_000, effect: 'satisfy-and-reset' },
      });
    },
  );

  it('blocks edits and saving while busy', async () => {
    const wrapper = await openEditor(wallClock, true);
    expect(testId('routine-local-time-hour').attributes('disabled')).toBeDefined();
    expect(testId('routine-start-date').attributes('disabled')).toBeDefined();
    expect(testId('routine-time-zone').attributes('disabled')).toBeDefined();
    expect(
      element('[data-testid="routine-recurrenceInterval"] input').attributes('disabled'),
    ).toBeDefined();
    expect(await submit(wrapper)).toBeUndefined();
  });
});
