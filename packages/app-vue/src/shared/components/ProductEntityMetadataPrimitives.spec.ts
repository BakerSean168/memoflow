import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ProductEntityIdentity from './ProductEntityIdentity.vue';
import ProductMetadataRow from './ProductMetadataRow.vue';
import ProductMoreProperties from './ProductMoreProperties.vue';

const appRoot = resolve(import.meta.dirname, '..', '..');
const read = (relative: string) => readFileSync(resolve(appRoot, relative), 'utf8');

describe('product entity metadata primitives', () => {
  it('keeps entity identity presentation-only', () => {
    const wrapper = mount(ProductEntityIdentity, {
      slots: {
        default: '<h1 data-testid="identity-title">Quarterly plan</h1>',
      },
    });

    expect(wrapper.get('[data-slot="product-entity-identity"]').classes()).toContain('space-y-1');
    expect(wrapper.get('[data-testid="identity-title"]').text()).toBe('Quarterly plan');
  });

  it('provides the canonical metadata label/value grid without owning domain content', () => {
    const wrapper = mount(ProductMetadataRow, {
      props: { label: 'Labels' },
      slots: {
        default:
          '<div class="flex min-w-0 flex-wrap items-center gap-1.5"><button data-testid="metadata-value">Backend</button></div>',
      },
    });

    expect(wrapper.get('[data-slot="product-metadata-row"]').classes()).toContain(
      'grid-cols-[6.5rem_minmax(0,1fr)]',
    );
    expect(wrapper.get('[data-slot="product-metadata-label"]').text()).toBe('Labels');
    expect(wrapper.get('[data-testid="metadata-value"]').text()).toBe('Backend');
  });

  it('owns only the shared more-properties trigger chrome', () => {
    const wrapper = mount(ProductMoreProperties, {
      props: {
        label: 'More properties',
        testId: 'more-properties',
      },
      slots: {
        default: '<button data-testid="domain-action">Domain action</button>',
      },
    });

    const trigger = wrapper.get('[data-testid="more-properties"]');
    expect(trigger.attributes('aria-label')).toBe('More properties');
    expect(trigger.attributes('data-slot')).toBe('product-more-properties-trigger');
  });

  it('keeps Goal and Task on the same metadata grammar while domain actions stay owner-owned', () => {
    const goal = read('modules/goal/views/GoalDetailView.vue');
    const task = read('modules/task/views/TaskDetailView.vue');

    for (const source of [goal, task]) {
      expect(source).toContain('<ProductEntityIdentity');
      expect(source).toContain('<ProductMetadataRow');
      expect(source).toContain('<ProductMoreProperties');
    }

    expect(task).toContain('<ProductPropertyChip');
    expect(goal).toContain('createTaskForGoal');
    expect(task).toContain('req.goalBinding = nextGoalBinding');

    for (const primitive of [
      'shared/components/ProductEntityIdentity.vue',
      'shared/components/ProductMetadataRow.vue',
      'shared/components/ProductMoreProperties.vue',
      'shared/components/ProductPropertyChip.vue',
    ]) {
      const source = read(primitive);
      expect(source).not.toContain('modules/goal');
      expect(source).not.toContain('modules/task');
    }
  });
});
