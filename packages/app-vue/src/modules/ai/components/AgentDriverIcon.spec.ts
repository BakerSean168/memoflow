import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { AgentDriverKindSchema } from '@memoflow/contracts/ai';
import AgentDriverIcon from './AgentDriverIcon.vue';
import {
  AGENT_BRAND_GLYPH_BOX_RATIO,
  agentBrandGlyphs,
  brandGlyphTransform,
  type AgentBrandGlyph,
} from './agentBrandGlyphs';

/** First path tokens of the verified source assets; pins glyph identity. */
const verifiedPathPrefixes: Record<string, string> = {
  codex: 'M8.086.457',
  claude: 'M4.709 15.955',
};

function mountIcon(driver: string, attrs: Record<string, unknown> = {}) {
  return mount(AgentDriverIcon, { props: { driver }, attrs });
}

describe('AgentDriverIcon', () => {
  it('renders the verified brand glyph for the codex driver', () => {
    const wrapper = mountIcon('codex');
    const svg = wrapper.find('svg');

    expect(svg.exists()).toBe(true);
    expect(svg.attributes('viewBox')).toBe('0 0 24 24');
    expect(svg.attributes('fill')).toBe('currentColor');
    expect(svg.attributes('aria-hidden')).toBe('true');
    expect(svg.classes()).toContain('size-4');
    expect(svg.classes()).toContain('shrink-0');
    expect(svg.find('g').attributes('transform')).toMatch(/^translate\(/);
    const paths = wrapper.findAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0].attributes('d').startsWith(verifiedPathPrefixes.codex)).toBe(true);
  });

  it('renders the verified brand glyph for the claude driver', () => {
    const wrapper = mountIcon('claude');
    const svg = wrapper.find('svg');

    expect(svg.exists()).toBe(true);
    expect(svg.attributes('viewBox')).toBe('0 0 24 24');
    expect(svg.attributes('fill')).toBe('currentColor');
    expect(svg.attributes('aria-hidden')).toBe('true');
    expect(svg.find('g').attributes('transform')).toMatch(/^translate\(/);
    const paths = wrapper.findAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0].attributes('d').startsWith(verifiedPathPrefixes.claude)).toBe(true);
  });

  it('keeps the Lucide placeholder for drivers whose brand glyph has not landed', () => {
    for (const driver of ['mastra', 'pi', 'dsh'] as const) {
      const wrapper = mountIcon(driver);
      const svg = wrapper.find('svg');

      expect(svg.exists()).toBe(true);
      expect(svg.attributes('stroke')).toBe('currentColor');
      expect(svg.attributes('fill')).toBe('none');
      expect(svg.attributes('aria-hidden')).toBe('true');
      expect(svg.find('g').exists()).toBe(false);
    }
  });

  it('falls back to the generic placeholder for unknown driver strings', () => {
    const wrapper = mountIcon('not-a-real-driver');
    const svg = wrapper.find('svg');

    expect(svg.exists()).toBe(true);
    expect(svg.attributes('stroke')).toBe('currentColor');
    expect(svg.attributes('aria-hidden')).toBe('true');
    expect(svg.find('g').exists()).toBe(false);
  });

  it('merges parent classes and accent styles onto the glyph', () => {
    const wrapper = mountIcon('codex', {
      class: 'size-5 text-primary',
      style: { color: 'rgb(2, 6, 23)' },
    });
    const svg = wrapper.find('svg');

    expect(svg.classes()).toContain('size-4');
    expect(svg.classes()).toContain('shrink-0');
    expect(svg.classes()).toContain('size-5');
    expect(svg.classes()).toContain('text-primary');
    expect(svg.attributes('style')).toMatch(/color/i);
  });

  it('only maps glyphs for real agent driver kinds', () => {
    const driverKinds = AgentDriverKindSchema.options;
    expect(Object.keys(agentBrandGlyphs).length).toBeGreaterThan(0);
    for (const key of Object.keys(agentBrandGlyphs)) {
      expect(driverKinds).toContain(key);
    }
  });
});

describe('brand glyph normalization', () => {
  const glyphs = Object.entries(agentBrandGlyphs) as [string, AgentBrandGlyph][];

  it('keeps provenance and license evidence for every landed glyph', () => {
    expect(glyphs.length).toBeGreaterThanOrEqual(2);
    for (const [driver, glyph] of glyphs) {
      const verifiedPrefix = verifiedPathPrefixes[driver];
      expect(verifiedPrefix).toBeDefined();
      expect(glyph.paths.length).toBeGreaterThan(0);
      expect(glyph.paths[0].startsWith(verifiedPrefix)).toBe(true);
      expect(glyph.provenance.source).toContain('@lobehub/icons@5.23.1');
      expect(glyph.provenance.license).toContain('MIT');
      expect(glyph.provenance.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(glyph.bbox.w).toBeGreaterThan(0);
      expect(glyph.bbox.h).toBeGreaterThan(0);
    }
  });

  it('maps every glyph onto one shared visual box, centered in its viewBox', () => {
    for (const [, glyph] of glyphs) {
      const transform = brandGlyphTransform(glyph);
      const match = /^translate\((-?[\d.]+) (-?[\d.]+)\) scale\((-?[\d.]+)\)$/.exec(transform);
      expect(match).not.toBeNull();

      const tx = Number(match![1]);
      const ty = Number(match![2]);
      const scale = Number(match![3]);
      const half = glyph.viewBoxSize / 2;
      const mappedCenterX = tx + scale * (glyph.bbox.x + glyph.bbox.w / 2);
      const mappedCenterY = ty + scale * (glyph.bbox.y + glyph.bbox.h / 2);
      const mappedLongEdge = Math.max(scale * glyph.bbox.w, scale * glyph.bbox.h);

      // brandGlyphTransform rounds transform components to 4 decimals, so the
      // mapped box may drift up to ~0.002 viewBox units from the exact target.
      expect(mappedCenterX).toBeCloseTo(half, 2);
      expect(mappedCenterY).toBeCloseTo(half, 2);
      expect(mappedLongEdge).toBeCloseTo(glyph.viewBoxSize * AGENT_BRAND_GLYPH_BOX_RATIO, 2);
    }
  });

  it('normalizes to the Lucide optical weight (20/24 of the viewBox edge)', () => {
    expect(AGENT_BRAND_GLYPH_BOX_RATIO).toBeCloseTo(20 / 24, 10);
  });
});
