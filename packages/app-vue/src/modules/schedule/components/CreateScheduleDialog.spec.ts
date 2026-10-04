import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { setProductTimePreferences } from '../../../shared/utils/product-time';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../../locales/en-US';

const confirmMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@memoflow/ui-vue-shadcn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/ui-vue-shadcn')>();
  return { ...actual, useConfirm: confirmMock };
});

import { Dialog } from '@memoflow/ui-vue-shadcn';
import CreateScheduleDialog from './CreateScheduleDialog.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  missingWarn: false,
  fallbackWarn: false,
  messages: { 'en-US': enUS },
});

beforeAll(() => {
  // jsdom has no alert; the dialog's endBeforeStart guard calls it when
  // startTimestamp >= endTimestamp, which would throw and kill handleSubmit
  // before props.onSubmit is invoked.
  vi.stubGlobal('alert', vi.fn());
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('CreateScheduleDialog submission lifecycle', () => {
  beforeEach(() => {
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
    // Freeze the clock at mid-day UTC so nowDateStr()/nowTimeStr()/
    // oneHourLaterTimeStr() can never straddle a date/TZ boundary, keeping
    // startTimestamp < endTimestamp deterministic regardless of when CI runs.
    const profile = createDefaultUserPreferenceProfile();
    setProductTimePreferences({ ...profile, regional: { ...profile.regional, timeZone: 'UTC' } });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));
  });

  afterEach(() => {
    setProductTimePreferences(createDefaultUserPreferenceProfile());
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('keeps required time visible and progressively reveals only optional details', async () => {
    const wrapper = mount(CreateScheduleDialog, {
      props: { modelValue: true, onSubmit: vi.fn().mockResolvedValue(true) },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    expect(document.querySelector('[data-testid="schedule-time-panel"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="schedule-start-time-button"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="schedule-end-time-button"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="schedule-conflict-setting"]')).not.toBeNull();

    const chips = document.querySelector('[data-testid="schedule-property-chips"]');
    expect(chips).not.toBeNull();
    expect(document.querySelector('[data-testid="schedule-property-editor"]')).toBeNull();

    const locationChip = new DOMWrapper(
      document.querySelector<HTMLButtonElement>('[data-testid="schedule-location-chip"]')!,
    );
    const attendeesChip = new DOMWrapper(
      document.querySelector<HTMLButtonElement>('[data-testid="schedule-attendees-chip"]')!,
    );

    await locationChip.trigger('click');
    await nextTick();
    expect(locationChip.attributes('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('[data-testid="schedule-property-editor"]')).toHaveLength(1);
    expect(document.querySelector('#location')).not.toBeNull();

    await attendeesChip.trigger('click');
    await nextTick();
    expect(locationChip.attributes('aria-pressed')).toBe('false');
    expect(attendeesChip.attributes('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('[data-testid="schedule-property-editor"]')).toHaveLength(1);
    expect(document.querySelector('#location')).toBeNull();

    wrapper.unmount();
  }, 20_000);

  it('seeds the exact calendar selection into the create draft', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const start = Date.parse('2026-08-14T09:30:00.000Z');
    const end = Date.parse('2026-08-14T11:00:00.000Z');
    const wrapper = mount(CreateScheduleDialog, {
      props: {
        modelValue: true,
        initialRange: { start, end, allDay: false },
        onSubmit,
      },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="schedule-title-input"]')!,
    ).setValue('Selected block');
    await new DOMWrapper(
      document.querySelector<HTMLButtonElement>('[data-testid="schedule-save-button"]')!,
    ).trigger('click');
    await nextTick();
    await nextTick();

    expect(onSubmit).toHaveBeenCalledOnce();
    const request = onSubmit.mock.calls[0]?.[0];
    expect(request?.range).toEqual({ kind: 'Timed', start, end });
    wrapper.unmount();
  }, 20_000);

  it('rolls the default end date forward when the one-hour draft crosses local midnight', async () => {
    vi.setSystemTime(new Date(2026, 7, 14, 23, 30, 0));
    const onSubmit = vi.fn().mockResolvedValue(true);
    const wrapper = mount(CreateScheduleDialog, {
      props: { modelValue: true, onSubmit },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="schedule-title-input"]')!,
    ).setValue('Cross-midnight review');
    await new DOMWrapper(
      document.querySelector<HTMLButtonElement>('[data-testid="schedule-save-button"]')!,
    ).trigger('click');
    await nextTick();
    await nextTick();

    expect(onSubmit).toHaveBeenCalledOnce();
    const request = onSubmit.mock.calls[0]?.[0];
    expect(request?.range.kind).toBe('Timed');
    if (request?.range.kind === 'Timed') {
      expect(request.range.end).toBeGreaterThan(request.range.start);
    }
    wrapper.unmount();
  }, 20_000);

  it('blocks duplicate submission and preserves the draft when saving fails', async () => {
    let resolveSubmit!: (value: boolean) => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const wrapper = mount(CreateScheduleDialog, {
      props: { modelValue: true, onSubmit },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    const title = new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="schedule-title-input"]')!,
    );
    const save = new DOMWrapper(
      document.querySelector<HTMLButtonElement>('[data-testid="schedule-save-button"]')!,
    );
    await title.setValue('Release review');
    await save.trigger('click');
    await save.trigger('click');
    await nextTick();

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(save.element.disabled).toBe(true);

    resolveSubmit(false);
    await nextTick();
    await nextTick();

    expect(title.element.value).toBe('Release review');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('still here');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  }, 20_000);

  it('closes a clean draft without confirmation', async () => {
    const wrapper = mount(CreateScheduleDialog, {
      props: { modelValue: true, onSubmit: vi.fn().mockResolvedValue(true) },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Cancel',
    );
    expect(cancel).toBeDefined();
    await new DOMWrapper(cancel!).trigger('click');
    await flushPromises();

    expect(confirmMock).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    wrapper.unmount();
  }, 20_000);

  it('guards both cancel and dialog dismissal when the draft is dirty', async () => {
    const wrapper = mount(CreateScheduleDialog, {
      props: { modelValue: true, onSubmit: vi.fn().mockResolvedValue(true) },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="schedule-title-input"]')!,
    ).setValue('Unsaved schedule');
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Cancel',
    );
    await new DOMWrapper(cancel!).trigger('click');
    await flushPromises();

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    wrapper.unmount();

    confirmMock.mockClear();
    const dismissedWrapper = mount(CreateScheduleDialog, {
      props: { modelValue: true, onSubmit: vi.fn().mockResolvedValue(true) },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();
    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="schedule-title-input"]')!,
    ).setValue('Unsaved schedule again');
    dismissedWrapper.findComponent(Dialog).vm.$emit('update:open', false);
    await flushPromises();

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(dismissedWrapper.emitted('update:modelValue')).toEqual([[false]]);
    dismissedWrapper.unmount();
  }, 20_000);

  it('keeps a dirty draft open when discard confirmation is rejected', async () => {
    confirmMock.mockResolvedValueOnce(false);
    const wrapper = mount(CreateScheduleDialog, {
      props: { modelValue: true, onSubmit: vi.fn().mockResolvedValue(true) },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    const title = new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="schedule-title-input"]')!,
    );
    await title.setValue('Keep this schedule');
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Cancel',
    );
    await new DOMWrapper(cancel!).trigger('click');
    await flushPromises();

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(title.element.value).toBe('Keep this schedule');
    wrapper.unmount();
  }, 20_000);

  it('closes and clears the draft only after saving succeeds', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const wrapper = mount(CreateScheduleDialog, {
      props: { modelValue: true, onSubmit },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="schedule-title-input"]')!,
    ).setValue('Release review');
    await new DOMWrapper(
      document.querySelector<HTMLButtonElement>('[data-testid="schedule-save-button"]')!,
    ).trigger('click');
    await nextTick();
    await nextTick();

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    wrapper.unmount();
  }, 20_000);
  it.each(['Timed', 'AllDay'] as const)(
    'seeds %s edit facts and saves the same range',
    async (kind) => {
      const range =
        kind === 'Timed'
          ? {
              kind,
              start: Date.parse('2026-08-14T09:30:00Z'),
              end: Date.parse('2026-08-14T11:00:00Z'),
            }
          : { kind, start: '2026-08-14', end: null };
      const onSubmit = vi.fn().mockResolvedValue(true);
      const wrapper = mount(CreateScheduleDialog, {
        props: {
          modelValue: true,
          schedule: {
            title: 'Existing entry',
            description: 'Seeded note',
            location: 'Desk',
            attendees: ['Ada'],
            range,
          } as unknown as import('@memoflow/contracts/schedule').CalendarEntryClientDTO,
          onSubmit,
        },
        attachTo: document.body,
        global: { plugins: [i18n] },
      });
      await nextTick();
      expect(
        document.querySelector<HTMLInputElement>('[data-testid="schedule-title-input"]')?.value,
      ).toBe('Existing entry');
      await new DOMWrapper(
        document.querySelector<HTMLButtonElement>('[data-testid="schedule-save-button"]')!,
      ).trigger('click');
      await nextTick();
      await nextTick();
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Existing entry',
          description: 'Seeded note',
          location: 'Desk',
          attendees: ['Ada'],
          range,
        }),
      );
      wrapper.unmount();
    },
    20_000,
  );
  it.each([false, true])(
    'submits the canonical selected range once under synchronous form races, allDay=%s',
    async (allDay) => {
      let finish!: (value: boolean) => void;
      const onSubmit = vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            finish = resolve;
          }),
      );
      const wrapper = mount(CreateScheduleDialog, {
        props: {
          modelValue: true,
          initialRange: {
            start: Date.parse('2026-08-14T09:30:00Z'),
            end: Date.parse(allDay ? '2026-08-16T00:00:00Z' : '2026-08-14T10:30:00Z'),
            allDay,
          },
          onSubmit,
        },
        attachTo: document.body,
        global: { plugins: [i18n] },
      });
      await nextTick();
      await new DOMWrapper(
        document.querySelector<HTMLInputElement>('[data-testid="schedule-title-input"]')!,
      ).setValue('Selected range');
      const form = document.querySelector<HTMLFormElement>('#schedule-form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          range: allDay
            ? { kind: 'AllDay', start: '2026-08-14', end: '2026-08-15' }
            : {
                kind: 'Timed',
                start: Date.parse('2026-08-14T09:30:00Z'),
                end: Date.parse('2026-08-14T10:30:00Z'),
              },
        }),
      );
      finish(true);
      await nextTick();
      await wrapper.setProps({ modelValue: false });
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      expect(onSubmit).toHaveBeenCalledOnce();
      wrapper.unmount();
    },
    20_000,
  );

  it('retains the selected draft after an exception and allows a distinct retry', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(true);
    const wrapper = mount(CreateScheduleDialog, {
      props: { modelValue: true, onSubmit },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();
    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="schedule-title-input"]')!,
    ).setValue('Retry draft');
    const form = new DOMWrapper(document.querySelector<HTMLFormElement>('#schedule-form')!);
    await form.trigger('submit');
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    await form.trigger('submit');
    await nextTick();
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[0]).toEqual(onSubmit.mock.calls[1]);
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    wrapper.unmount();
  }, 20_000);
});
