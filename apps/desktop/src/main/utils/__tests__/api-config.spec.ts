import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let isPackaged = false;
let userDataPath = '';

vi.mock('../../runtime-init', () => ({
  getSharedPathResolver: () => ({ runtimeConfigPath: path.join(userDataPath, 'config', 'desktop-runtime.json') }),
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataPath),
    get isPackaged() {
      return isPackaged;
    },
  },
}));

import { getApiBaseUrl, getWebAppUrl } from '../api-config';

describe('getApiBaseUrl', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-api-config-'));
    isPackaged = false;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(userDataPath, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('prefers explicit desktop API env injection', () => {
    process.env.MEMOFLOW_API_URL = 'https://desktop-api.example.com/api/v1';
    delete process.env.PROXY_TARGET_URL;

    expect(getApiBaseUrl()).toBe('https://desktop-api.example.com/api/v1');
  });

  it('derives desktop API URL from proxy target when explicit env is absent', () => {
    delete process.env.MEMOFLOW_API_URL;
    delete process.env.API_BASE_URL;
    delete process.env.VITE_API_URL;
    process.env.VITE_API_BASE_URL = '/api/v1';
    process.env.PROXY_TARGET_URL = 'http://localhost:3000';

    expect(getApiBaseUrl()).toBe('http://localhost:3000/api/v1');
  });

  it('uses runtime config from user data in packaged mode', () => {
    delete process.env.MEMOFLOW_API_URL;
    delete process.env.API_BASE_URL;
    delete process.env.VITE_API_URL;
    delete process.env.VITE_API_BASE_URL;
    delete process.env.PROXY_TARGET_URL;
    delete process.env.API_DOMAIN;
    isPackaged = true;

    const configDir = path.join(userDataPath, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'desktop-runtime.json'),
      JSON.stringify({ apiBaseUrl: 'https://desktop-config.example.com/api/v1' }),
      'utf8',
    );

    expect(getApiBaseUrl()).toBe('https://desktop-config.example.com/api/v1');
  });

  it('falls back to the production site API in packaged mode when no config is provided', () => {
    delete process.env.MEMOFLOW_API_URL;
    delete process.env.API_BASE_URL;
    delete process.env.VITE_API_URL;
    delete process.env.VITE_API_BASE_URL;
    delete process.env.PROXY_TARGET_URL;
    delete process.env.API_DOMAIN;
    isPackaged = true;

    expect(getApiBaseUrl()).toBe('https://memoflow.bakersean.top/api/v1');
  });

  it('throws when no usable API env is provided in development', () => {
    delete process.env.MEMOFLOW_API_URL;
    delete process.env.API_BASE_URL;
    delete process.env.VITE_API_URL;
    delete process.env.VITE_API_BASE_URL;
    delete process.env.PROXY_TARGET_URL;
    delete process.env.API_DOMAIN;
    isPackaged = false;

    expect(() => getApiBaseUrl()).toThrow(/Desktop API base URL is not configured/);
  });

  it('uses an explicit Web origin for browser-completed auth journeys', () => {
    process.env.MEMOFLOW_WEB_URL = 'https://app.example.com/';
    process.env.MEMOFLOW_API_URL = 'https://api.example.com/api/v1';

    expect(getWebAppUrl()).toBe('https://app.example.com');
  });

  it('falls back to the configured API origin when Web and CORS origins are absent', () => {
    delete process.env.MEMOFLOW_WEB_URL;
    delete process.env.WEB_APP_URL;
    delete process.env.VITE_WEB_URL;
    delete process.env.CORS_ORIGIN;
    process.env.MEMOFLOW_API_URL = 'https://api.example.com/api/v1';

    expect(getWebAppUrl()).toBe('https://api.example.com');
  });
});
