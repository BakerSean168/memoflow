import { describe, expect, it } from 'vitest';
import {
  resolveGovernanceSurfacePolicy,
  shouldRenderGovernanceSegment,
} from './governance-surface-policy';

describe('Governance development/diagnostic surface policy (GOV-1902)', () => {
  it('keeps the route registered in every environment', () => {
    expect(
      resolveGovernanceSurfacePolicy({ isDevelopment: false, diagnosticSurfaceEnabled: false }),
    ).toEqual({ routeRegistered: true, navigationVisible: false });
  });

  it('hides the normal Note navigation entry in production but keeps a direct Governance route self-describing', () => {
    const productionPolicy = resolveGovernanceSurfacePolicy({
      isDevelopment: false,
      diagnosticSurfaceEnabled: false,
    });
    expect(shouldRenderGovernanceSegment('notes', productionPolicy)).toBe(false);
    expect(shouldRenderGovernanceSegment('governance', productionPolicy)).toBe(true);
  });

  it('advertises Governance in development', () => {
    expect(
      resolveGovernanceSurfacePolicy({ isDevelopment: true, diagnosticSurfaceEnabled: false }),
    ).toEqual({ routeRegistered: true, navigationVisible: true });
  });

  it('allows an explicit diagnostic surface in a production build', () => {
    expect(
      resolveGovernanceSurfacePolicy({ isDevelopment: false, diagnosticSurfaceEnabled: true }),
    ).toEqual({ routeRegistered: true, navigationVisible: true });
  });
});
