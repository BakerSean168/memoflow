import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { AgentDriverKindSchema } from '@memoflow/ai-contracts';
import AgentDriverIcon from './AgentDriverIcon.vue';
import {
  AGENT_BRAND_GLYPH_BOX_RATIO,
  agentBrandGlyphs,
  brandGlyphTransform,
  type AgentBrandGlyph,
} from './agent-brand-glyphs';

/** First path tokens of the verified source assets; pins glyph identity. */
const verifiedPathPrefixes: Record<string, string> = {
  codex: 'M8.086.457',
  claude: 'M4.709 15.955',
  pi: 'M420 280H280V140H0V0H420V280Z',
  dsh: 'M23.748 4.482',
  mastra: 'M14.74 9.977',
  antigravity: 'M21.751 22.607',
};

/** Where each glyph's verbatim asset must come from. */
const verifiedSources: Record<string, RegExp> = {
  codex: /@lobehub\/icons@5\.23\.1.*Codex\/components\/Mono\.mjs/,
  claude: /@lobehub\/icons@5\.23\.1.*Claude\/components\/Mono\.mjs/,
  pi: /pi\.dev\/press-kit/,
  antigravity: /@lobehub\/icons@5\.23\.1.*Antigravity\/components\/Mono\.mjs/,
  dsh: /@lobehub\/icons@5\.23\.1.*DeepSeek\/components\/Mono\.mjs/,
  mastra: /@lobehub\/icons@5\.23\.1.*Mastra\/components\/Mono\.mjs/,
};

function mountIcon(driver: string, attrs: Record<string, unknown> = {}) {
  return mount(AgentDriverIcon, { props: { driver }, attrs });
}

describe('AgentDriverIcon', () => {
  it('renders a verified brand glyph for every agent driver kind', () => {
    const driverKinds = AgentDriverKindSchema.options;
    expect(Object.keys(agentBrandGlyphs).sort()).toEqual([...driverKinds].sort());

    for (const driver of driverKinds) {
      const glyph = agentBrandGlyphs[driver];
      const wrapper = mountIcon(driver);
      const svg = wrapper.find('svg');

      expect(svg.exists()).toBe(true);
      expect(svg.attributes('viewBox')).toBe(glyph.viewBox);
      expect(svg.attributes('fill')).toBe('currentColor');
      expect(svg.attributes('aria-hidden')).toBe('true');
      expect(svg.attributes('stroke')).toBeUndefined();
      expect(svg.classes()).toContain('size-4');
      expect(svg.classes()).toContain('shrink-0');
      expect(svg.find('g').attributes('transform')).toMatch(/^translate\(/);

      const paths = wrapper.findAll('path');
      expect(paths).toHaveLength(glyph.paths.length);
      expect(paths[0].attributes('d').startsWith(verifiedPathPrefixes[driver])).toBe(true);
    }
  });

  it('falls back to the generic Lucide placeholder for unknown driver strings', () => {
    const wrapper = mountIcon('not-a-real-driver');
    const svg = wrapper.find('svg');

    expect(svg.exists()).toBe(true);
    expect(svg.attributes('stroke')).toBe('currentColor');
    expect(svg.attributes('fill')).toBe('none');
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
});

describe('brand glyph normalization', () => {
  const glyphs = Object.entries(agentBrandGlyphs) as [string, AgentBrandGlyph][];

  it('keeps provenance and license evidence for every landed glyph', () => {
    expect(glyphs.length).toBe(AgentDriverKindSchema.options.length);
    for (const [driver, glyph] of glyphs) {
      const verifiedPrefix = verifiedPathPrefixes[driver];
      expect(verifiedPrefix).toBeDefined();
      expect(glyph.paths.length).toBeGreaterThan(0);
      expect(glyph.paths[0].startsWith(verifiedPrefix)).toBe(true);
      expect(glyph.provenance.source).toMatch(verifiedSources[driver]);
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

      // brandGlyphTransform rounds transform components to 6 decimals, so the
      // mapped box may drift by well under 0.005 viewBox units from target.
      expect(mappedCenterX).toBeCloseTo(half, 2);
      expect(mappedCenterY).toBeCloseTo(half, 2);
      expect(mappedLongEdge).toBeCloseTo(glyph.viewBoxSize * AGENT_BRAND_GLYPH_BOX_RATIO, 2);
    }
  });

  it('normalizes to the Lucide optical weight (20/24 of the viewBox edge)', () => {
    expect(AGENT_BRAND_GLYPH_BOX_RATIO).toBeCloseTo(20 / 24, 10);
  });
});
