/** @vitest-environment happy-dom */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { Plus } from '@lucide/vue';
import ResponsivePrimaryAction from './ResponsivePrimaryAction.vue';

const source = readFileSync(resolve(__dirname, 'ResponsivePrimaryAction.vue'), 'utf8');

describe('ResponsivePrimaryAction', () => {
  it('keeps one accessible primary action and collapses its label below the panel 2xl tier', () => {
    const wrapper = shallowMount(ResponsivePrimaryAction, {
      props: { label: 'New plan', icon: Plus },
      attrs: { 'data-testid': 'create-entry' },
    });

    expect(wrapper.attributes('aria-label')).toBe('New plan');
    expect(wrapper.attributes('data-testid')).toBe('create-entry');
    expect(source).toContain('@2xl/panel:mr-1.5');
    expect(source).toContain('hidden @2xl/panel:inline');
  });

  it('is the canonical primary-create action for Goal, Task, and Schedule toolbars', () => {
    for (const file of [
      '../../modules/goal/components/GoalPageToolbar.vue',
      '../../modules/task/components/TaskPageToolbar.vue',
      '../../modules/schedule/views/ScheduleCalendarView.vue',
    ]) {
      expect(readFileSync(resolve(__dirname, file), 'utf8')).toContain('<ResponsivePrimaryAction');
    }
  });
});
