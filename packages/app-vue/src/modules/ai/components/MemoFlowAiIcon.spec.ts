import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MemoFlowAiIcon from './MemoFlowAiIcon.vue';

describe('MemoFlowAiIcon', () => {
  it('renders an SVG with the MemoFlow flowing streamlines and default stroke width', () => {
    const wrapper = mount(MemoFlowAiIcon, {
      attrs: {
        class: 'h-4 w-4 text-primary',
      },
    });

    const svg = wrapper.find('svg');
    expect(svg.exists()).toBe(true);
    expect(svg.attributes('viewBox')).toBe('0 0 24 24');
    expect(svg.attributes('stroke-width')).toBe('1.75');
    expect(svg.attributes('fill')).toBe('none');
    expect(svg.attributes('stroke')).toBe('currentColor');
    expect(svg.classes()).toContain('h-4');
    expect(svg.classes()).toContain('w-4');
    expect(svg.classes()).toContain('text-primary');

    const paths = wrapper.findAll('path');
    expect(paths).toHaveLength(3);
  });

  it('allows customizing stroke-width via prop', () => {
    const wrapper = mount(MemoFlowAiIcon, {
      props: {
        strokeWidth: 2,
      },
    });

    expect(wrapper.find('svg').attributes('stroke-width')).toBe('2');
  });
});
