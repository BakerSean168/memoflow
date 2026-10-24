import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * First-party HTTP Result envelope surface (stage-6 residual 78/80/83):
 * ResultHttpClient requires HttpResponse data envelopes — no raw dual-track.
 * Throw-style AxiosHttpClient dual client is gone; package exports Result path only.
 */
describe('first-party HTTP Result envelope surface', () => {
  const resultClient = readFileSync(resolve(__dirname, '../result-http-client.ts'), 'utf8');
  const index = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');
  const types = readFileSync(resolve(__dirname, '../types.ts'), 'utf8');
  const appSession = readFileSync(
    resolve(__dirname, '../../../app-react/src/providers/app-session-provider.tsx'),
    'utf8',
  );

  it('ResultHttpClient fails closed on non-envelope success bodies', () => {
    expect(resultClient).toContain('isHttpResponseEnvelope');
    expect(resultClient).toContain('fromHttpResponse');
    expect(resultClient).toContain('raw dual-track payloads are not accepted');
    expect(resultClient).not.toContain('return ok(data as T)');
    expect(resultClient).not.toContain('非标准信封 → 直接包装为 Result.ok');
  });

  it('ResultHttpClient requires data key for ok:true envelopes', () => {
    expect(resultClient).toContain('envelope.ok === true');
    expect(resultClient).toContain("return 'data' in envelope");
  });

  it('package public surface exports only Result path (throw dual-track removed)', () => {
    expect(index).toContain('ResultHttpClient');
    expect(index).toContain('createResultHttpClient');
    expect(index).not.toMatch(/export \{ AxiosHttpClient \}/);
    expect(index).not.toMatch(/AxiosHttpClientConfig/);
    expect(index).toContain('HttpClientConfig');
    expect(index).not.toMatch(/function createHttpClient\b/);
    expect(index).not.toMatch(/export \{ HttpClientError \}/);
    expect(index).not.toMatch(/export type \{[\s\S]*\bIHttpClient\b/);
    expect(index).not.toMatch(/export \{[^}]*\bIHttpClient\b/);
    expect(types).not.toMatch(/export interface HttpClient\s*[{]/);
    expect(types).not.toMatch(/export type IHttpClient\s*=/);
    expect(existsSync(resolve(__dirname, '../axios-http-client.ts'))).toBe(false);
  });

  it('app-react delegates cloud session handling to the Cloud Auth client', () => {
    expect(appSession).toContain('MOBILE_API_BASE_URL');
    expect(appSession).toContain('createCloudAuthHttpClient');
    expect(appSession).toContain('CloudAuthClientPort');
    expect(appSession).toContain('auth.current!.getSession()');
    expect(appSession).toContain('auth.current!.signIn(req)');
    expect(appSession).not.toContain('/auth/refresh');
    expect(appSession).not.toContain('AuthResponseDTO');
  });
});
