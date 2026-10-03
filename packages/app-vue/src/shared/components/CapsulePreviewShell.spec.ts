import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import CapsulePreviewFooter from './CapsulePreviewFooter.vue';
import CapsulePreviewHeader from './CapsulePreviewHeader.vue';
import CapsulePreviewShell from './CapsulePreviewShell.vue';
import CapsulePreviewState from './CapsulePreviewState.vue';

const appRoot = resolve(import.meta.dirname, '../..');
const read = (relative: string) => readFileSync(resolve(appRoot, relative), 'utf8');

describe('capsule preview presentation grammar', () => {
  it('provides a bounded host shell while forwarding owner attributes and content', () => {
    const wrapper = mount(CapsulePreviewShell, {
      attrs: {
        'data-testid': 'owner-capsule',
        'data-capsule-workspace': 'goal',
      },
      props: { maxHeight: '28rem' },
      slots: { default: '<div data-testid="owner-content">Owner rows</div>' },
    });

    expect(wrapper.attributes('data-testid')).toBe('owner-capsule');
    expect(wrapper.attributes('data-capsule-workspace')).toBe('goal');
    expect(wrapper.attributes('data-capsule-preview-shell')).toBe('');
    expect(wrapper.attributes('style')).toContain('max-height: 28rem');
    expect(wrapper.get('[data-testid="owner-content"]').text()).toBe('Owner rows');
  });

  it('keeps identity, badge, actions and owner-specific header content as separate slots', () => {
    const wrapper = mount(CapsulePreviewHeader, {
      props: { title: 'Goals', subtitle: 'Needs attention' },
      slots: {
        badge: '<span data-testid="badge">3</span>',
        actions: '<button data-testid="action">Refresh</button>',
        default: '<div data-testid="extra">Search</div>',
      },
    });

    expect(wrapper.text()).toContain('Goals');
    expect(wrapper.text()).toContain('Needs attention');
    expect(wrapper.get('[data-testid="badge"]').text()).toBe('3');
    expect(wrapper.get('[data-testid="action"]').text()).toBe('Refresh');
    expect(wrapper.get('[data-testid="extra"]').text()).toBe('Search');
  });

  it('exposes consistent loading/error semantics without owning owner actions', () => {
    const loading = mount(CapsulePreviewState, {
      props: { kind: 'loading' },
      slots: { default: '<div data-testid="skeleton">Loading</div>' },
    });
    expect(loading.attributes('role')).toBe('status');
    expect(loading.attributes('aria-busy')).toBe('true');
    expect(loading.attributes('data-capsule-preview-state')).toBe('loading');

    const error = mount(CapsulePreviewState, {
      props: { kind: 'error' },
      slots: { default: '<button data-testid="retry">Retry</button>' },
    });
    expect(error.attributes('role')).toBe('alert');
    expect(error.attributes('aria-busy')).toBeUndefined();
    expect(error.get('[data-testid="retry"]').text()).toBe('Retry');
  });

  it('standardizes footer chrome while leaving action layout owner-controlled', () => {
    const wrapper = mount(CapsulePreviewFooter, {
      props: { align: 'between' },
      slots: {
        default:
          '<button data-testid="create">Create</button><button data-testid="view-all">View all</button>',
      },
    });

    expect(wrapper.classes()).toContain('justify-between');
    expect(wrapper.attributes('data-capsule-preview-footer')).toBe('');
    expect(wrapper.get('[data-testid="create"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="view-all"]').exists()).toBe(true);
  });

  it('keeps all six capsule owner families on the shared chrome', () => {
    const owners = [
      read('modules/task/components/TaskQuickSurface.vue'),
      read('layouts/shell/previews/GoalCapsulePreview.vue'),
      read('layouts/shell/previews/ScheduleCapsulePreview.vue'),
      read('modules/routine/components/RoutineCapsulePreview.vue'),
      read('modules/notification/components/NotificationCapsulePreview.vue'),
      read('layouts/shell/previews/NoteCapsulePreview.vue'),
    ];

    for (const source of owners) {
      expect(source).toContain('<CapsulePreviewShell');
      expect(source).toContain('<CapsulePreviewHeader');
      expect(source).toContain('<CapsulePreviewFooter');
      expect(source).toContain('<CapsulePreviewState');
    }
  });

  it('keeps shared capsule primitives free of universal business rows and owner actions', () => {
    const primitives = [
      'CapsulePreviewShell',
      'CapsulePreviewHeader',
      'CapsulePreviewFooter',
      'CapsulePreviewState',
    ];
    const exports = read('shared/components/index.ts');
    expect([...exports.matchAll(/default as (Capsule\w+)/g)].map((match) => match[1])).toEqual(
      primitives,
    );

    for (const primitive of primitives) {
      const source = read(`shared/components/${primitive}.vue`);
      // Rows, owner data and business actions must stay in each owner's surface.
      expect(source).not.toMatch(/@memoflow\/contracts|modules\/|defineEmits|v-for|<button\b/);
      expect(source).toContain('<slot');
    }
  });
});
