import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../../../locales/en-US';
import type { KeyResultClientDTO } from '@memoflow/contracts/goal';
import KeyResultDialog from './KeyResultDialog.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  missingWarn: false,
  fallbackWarn: false,
  messages: { 'en-US': enUS },
});

function dom(testId: string): DOMWrapper<Element> {
  const element = document.querySelector(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`Missing DOM element ${testId}`);
  return new DOMWrapper(element);
}

function keyResultFixture(overrides: Partial<KeyResultClientDTO> = {}): KeyResultClientDTO {
  return {
    id: 'IKeyResultId_550e8400-e29b-41d4-a716-446655440001',
    title: 'Reduce weight',
    description: null,
    progress: {
      initialValue: 100,
      currentValue: 80,
      targetValue: 50,
      aggregationMethod: 'Last',
      unit: 'kg',
    },
    target: { kind: 'quarter', year: 2027, quarter: 4 },
    progressPercentage: 40,
    isCompleted: false,
    weight: 3,
    order: 0,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  } as KeyResultClientDTO;
}

describe('KeyResultDialog submission lifecycle', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('awaits submission and preserves the draft when submission fails', async () => {
    let resolveSubmit!: (value: boolean) => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const wrapper = mount(KeyResultDialog, {
      props: { onSubmit },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    wrapper.vm.openForCreateKeyResult('goal-1');
    await nextTick();

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="key-result-title-input"]')!,
    ).setValue('Reliable delivery');
    await new DOMWrapper(
      document.querySelector<HTMLElement>('[data-testid="save-key-result-button"]')!,
    ).trigger('click');
    await nextTick();

    expect(
      document.querySelector<HTMLButtonElement>('[data-testid="save-key-result-button"]')?.disabled,
    ).toBe(true);
    expect(document.querySelector('[data-testid="key-result-dialog"]')).not.toBeNull();

    resolveSubmit(false);
    await nextTick();
    await nextTick();

    expect(
      document.querySelector<HTMLInputElement>('[data-testid="key-result-title-input"]')?.value,
    ).toBe('Reliable delivery');
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('closes after the awaited submission succeeds', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const wrapper = mount(KeyResultDialog, {
      props: { onSubmit },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    wrapper.vm.openForCreateKeyResult('goal-1');
    await nextTick();

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="key-result-title-input"]')!,
    ).setValue('Reliable delivery');
    await new DOMWrapper(
      document.querySelector<HTMLElement>('[data-testid="save-key-result-button"]')!,
    ).trigger('click');
    await nextTick();
    await nextTick();

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-testid="key-result-dialog"]')).toBeNull();
    wrapper.unmount();
  });
  it('uses Initial/Current/Target defaults and never exposes the retired progress-baseline field', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const wrapper = mount(KeyResultDialog, {
      props: { onSubmit },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    wrapper.vm.openForCreateKeyResult('goal-1');
    await nextTick();

    expect((dom('key-result-initial-input').element as HTMLInputElement).value).toBe('0');
    expect((dom('key-result-current-input').element as HTMLInputElement).value).toBe('0');
    expect((dom('key-result-target-input').element as HTMLInputElement).value).toBe('100');
    expect(document.body.textContent).not.toContain('Progress baseline');
    wrapper.unmount();
  });

  it('accepts decreasing Initial > Target with the same public measurement shape', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const wrapper = mount(KeyResultDialog, {
      props: { onSubmit },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    wrapper.vm.openForCreateKeyResult('goal-1');
    await nextTick();

    await dom('key-result-title-input').setValue('Reduce weight');
    await dom('key-result-initial-input').setValue('100');
    await dom('key-result-current-input').setValue('80');
    await dom('key-result-target-input').setValue('50');
    await dom('save-key-result-button').trigger('click');
    await flushPromises();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        keyResult: expect.objectContaining({
          initialValue: 100,
          currentValue: 80,
          targetValue: 50,
          target: null,
        }),
      }),
    );
    wrapper.unmount();
  });

  it('rejects Initial equal to Target before calling the application port', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const wrapper = mount(KeyResultDialog, {
      props: { onSubmit },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    wrapper.vm.openForCreateKeyResult('goal-1');
    await nextTick();

    await dom('key-result-title-input').setValue('Invalid span');
    await dom('key-result-initial-input').setValue('50');
    await dom('key-result-current-input').setValue('50');
    await dom('key-result-target-input').setValue('50');
    await dom('save-key-result-button').trigger('click');
    await nextTick();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Initial value must differ from target value',
    );
    wrapper.unmount();
  });

  it('preserves a broad KR target until the day field is explicitly changed', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const wrapper = mount(KeyResultDialog, {
      props: { onSubmit },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    const keyResult = keyResultFixture();
    wrapper.vm.openForUpdateKeyResult('goal-1', keyResult);
    await nextTick();

    expect(document.body.textContent).toContain('2027 Q4');
    expect((dom('key-result-target-date-input').element as HTMLInputElement).value).toBe('');
    await dom('save-key-result-button').trigger('click');
    await flushPromises();
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        keyResult: expect.objectContaining({ target: { kind: 'quarter', year: 2027, quarter: 4 } }),
      }),
    );

    wrapper.vm.openForUpdateKeyResult('goal-1', keyResult);
    await nextTick();
    await dom('key-result-target-date-input').setValue('2027-11-15');
    await dom('save-key-result-button').trigger('click');
    await flushPromises();
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        keyResult: expect.objectContaining({ target: { kind: 'day', date: '2027-11-15' } }),
      }),
    );
    wrapper.unmount();
  });
});
