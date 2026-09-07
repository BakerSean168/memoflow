import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ResponseMetrics remains a transient analytics value object.
 * The persisted/suggested FrequencyAdjustment state was retired by CLEAN-6302C.
 */
describe('reminder analytics metrics surface', () => {
  const voDir = __dirname;
  const metrics = readFileSync(resolve(voDir, 'response-metrics.ts'), 'utf8');
  const index = readFileSync(resolve(voDir, 'index.ts'), 'utf8');

  it('owns ResponseMetricsDTO as type alias of ResponseMetrics', () => {
    expect(metrics).toContain('Residual 857');
    expect(metrics).toMatch(/export interface ResponseMetrics\b/);
    expect(metrics).toContain('export type ResponseMetricsDTO = ResponseMetrics');
    expect(metrics).not.toMatch(/export interface ResponseMetricsDTO\b/);
  });

  it('does not expose retired FrequencyAdjustment suggestion state', () => {
    expect(existsSync(resolve(voDir, 'frequency-adjustment.ts'))).toBe(false);
    expect(index).not.toContain('FrequencyAdjustment');
    expect(index).not.toContain("from './frequency-adjustment'");
  });

  it('keeps ResponseMetrics as the only analytics metric VO export', () => {
    expect(index).toContain('ResponseMetrics');
    expect(index).toContain('ResponseMetricsDTO');
    expect(index).toContain("from './response-metrics'");
  });
});
