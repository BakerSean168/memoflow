import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import TaskOccurrenceCard from '../TaskOccurrenceCard.vue';
import type { TaskOccurrenceViewModel } from '../types';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      task: {
        instanceCard: {
          completedAt: 'Completed at {time}',
          unknownTask: 'Unknown task',
        },
        rootInstanceCard: {
          taskFallback: 'Unknown task',
        },
        templateCard: {
          allDay: 'All day',
        },
      },
    },
  },
});

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  props: ['disabled', 'variant', 'size'],
  setup(props, { attrs, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          disabled: props.disabled,
        },
        slots.default?.(),
      );
  },
});

function createTask(overrides: Partial<TaskOccurrenceViewModel> = {}): TaskOccurrenceViewModel {
  return {
    id: 'instance-1',
    templateId: 'template-1',
    templateTitle: 'Write regression tests',
    isCompleted: false,
    instanceDate: '2026-04-27',
    timeConfig: {
      timeType: 'TimePoint',
      timePoint: 540,
    },
    ...overrides,
  };
}

function mountCard(task: TaskOccurrenceViewModel) {
  return mount(TaskOccurrenceCard, {
    props: {
      task,
    },
    global: {
      plugins: [i18n],
      stubs: {
        Button: ButtonStub,
        CheckCircle2: true,
        Circle: true,
        Clock: true,
        Check: true,
      },
    },
  });
}

describe('TaskOccurrenceCard', () => {
  it('renders scheduled task metadata and emits complete when toggled', async () => {
    const wrapper = mountCard(createTask());

    expect(wrapper.text()).toContain('Write regression tests');
    expect(wrapper.text()).toContain('09:00');

    await wrapper.get('button').trigger('click');

    expect(wrapper.emitted('complete')).toEqual([['instance-1']]);
  });

  it('shows completed state text and falls back to all-day for missing time details', () => {
    // ADR-037: actualEndTime is Instant (epoch ms)
    const completedAt = new Date(2026, 3, 27, 18, 45, 0).getTime();
    const wrapper = mountCard(
      createTask({
        templateTitle: undefined,
        isCompleted: true,
        actualEndTime: completedAt,
        timeConfig: {
          timeType: undefined,
        },
      }),
    );

    expect(wrapper.text()).toContain('Unknown task');
    expect(wrapper.text()).toContain('Completed at');
    expect(wrapper.text()).toContain('18:45');
  });
});
