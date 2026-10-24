import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { APIRequestContext } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
// Sync E2E uses a checked-in local credential contract so Web/API/Desktop can
// share the same account without hardcoding test secrets in each helper.
const credentialsPath = path.join(workspaceRoot, '.e2e-test-credentials.json');

interface RawCredentialsFile {
  api_config?: {
    base_url?: string;
    api_prefix?: string;
    full_api_url?: string;
  };
  web_config?: {
    base_url?: string;
  };
  credentials?: {
    username?: string;
    email?: string;
    password?: string;
  };
}

export interface SyncCredentials {
  username: string;
  email: string;
  password: string;
  apiBaseUrl: string;
  webBaseUrl: string;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required e2e credential field: ${field}`);
  }

  return value.trim();
}

function parseCredentialsFile(): RawCredentialsFile {
  return JSON.parse(readFileSync(credentialsPath, 'utf8')) as RawCredentialsFile;
}

function buildApiBaseUrl(raw: RawCredentialsFile): string {
  // Prefer env overrides so CI and local proxy-based debugging can redirect the
  // suite without rewriting the credential file.
  const envFullApiUrl =
    process.env.MEMOFLOW_API_URL?.trim() || process.env.E2E_API_FULL_URL?.trim();
  if (envFullApiUrl) {
    return envFullApiUrl.replace(/\/+$/, '').match(/\/api\/v\d+$/i)
      ? envFullApiUrl.replace(/\/+$/, '')
      : `${envFullApiUrl.replace(/\/+$/, '')}/api/v1`;
  }

  const envApiOrigin = process.env.E2E_API_BASE_URL?.trim() || process.env.PROXY_TARGET_URL?.trim();
  if (envApiOrigin) {
    const apiPrefix = (raw.api_config?.api_prefix?.trim() || '/api/v1').replace(/^\/?/, '/');
    return `${envApiOrigin.replace(/\/+$/, '')}${apiPrefix}`;
  }

  const explicitFullUrl = raw.api_config?.full_api_url?.trim();
  if (explicitFullUrl) {
    return explicitFullUrl.replace(/\/+$/, '');
  }

  const baseUrl = readRequiredString(raw.api_config?.base_url, 'api_config.base_url').replace(
    /\/+$/,
    '',
  );
  const apiPrefix = readRequiredString(raw.api_config?.api_prefix, 'api_config.api_prefix').replace(
    /^\/?/,
    '/',
  );

  return `${baseUrl}${apiPrefix}`;
}

export function loadSyncCredentials(): SyncCredentials {
  const raw = parseCredentialsFile();

  return {
    username: readRequiredString(raw.credentials?.username, 'credentials.username'),
    email: readRequiredString(raw.credentials?.email, 'credentials.email'),
    password: readRequiredString(raw.credentials?.password, 'credentials.password'),
    apiBaseUrl: buildApiBaseUrl(raw),
    webBaseUrl: (
      process.env.E2E_WEB_BASE_URL?.trim() ||
      raw.web_config?.base_url?.trim() ||
      'http://127.0.0.1:5173'
    ).replace(/\/+$/, ''),
  };
}

function authBaseUrl(credentials: SyncCredentials): string {
  const url = new URL(credentials.apiBaseUrl);
  return `${url.origin}/api/auth`;
}

async function waitForCapturedEmailLink(
  request: APIRequestContext,
  credentials: SyncCredentials,
  kind: 'email-verification' | 'password-reset' = 'email-verification',
  timeoutMs = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const url = new URL(`${authBaseUrl(credentials)}/test/last-email-link`);
  url.searchParams.set('email', credentials.email);
  url.searchParams.set('kind', kind);

  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await request.get(url.toString());
      if (response.ok()) {
        const body = (await response.json()) as { data?: { url?: string } };
        if (typeof body.data?.url === 'string') return body.data.url;
      } else if (response.status() !== 404) {
        lastError = new Error(`HTTP ${response.status()}`);
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Timed out waiting for ${kind} link for ${credentials.email}: ${
      lastError instanceof Error ? lastError.message : String(lastError ?? 'no link')
    }`,
  );
}

async function verifyLatestEmailLink(
  request: APIRequestContext,
  credentials: SyncCredentials,
): Promise<void> {
  const capturedUrl = new URL(
    await waitForCapturedEmailLink(request, credentials, 'email-verification'),
  );
  capturedUrl.searchParams.delete('callbackURL');
  const response = await request.get(capturedUrl.toString());
  if (!response.ok()) {
    throw new Error(
      `Email verification failed with HTTP ${response.status()}: ${await response.text()}`,
    );
  }
}

export async function ensureE2EAccount(
  request: APIRequestContext,
  credentials: SyncCredentials,
): Promise<void> {
  const baseUrl = authBaseUrl(credentials);
  const loginPayload = {
    email: credentials.email,
    password: credentials.password,
  };
  const signIn = () => request.post(`${baseUrl}/sign-in/email`, { data: loginPayload });

  const firstLogin = await signIn();
  if (firstLogin.ok()) return;

  const firstLoginBody = await firstLogin.text();
  const register = await request.post(`${baseUrl}/sign-up/email`, {
    data: {
      ...loginPayload,
      name: credentials.username,
      callbackURL: `${credentials.webBaseUrl}/auth`,
    },
  });

  if (register.ok()) {
    await verifyLatestEmailLink(request, credentials);
  } else {
    const resend = await request.post(`${baseUrl}/send-verification-email`, {
      data: { email: credentials.email, callbackURL: `${credentials.webBaseUrl}/auth` },
    });
    if (!resend.ok()) {
      throw new Error(
        `Unable to prepare ${credentials.email}. Sign-in: ${firstLoginBody}; sign-up: ${await register.text()}; verification resend: ${await resend.text()}`,
      );
    }
    await verifyLatestEmailLink(request, credentials);
  }

  const verifiedLogin = await signIn();
  if (!verifiedLogin.ok()) {
    throw new Error(
      `Verified ${credentials.email}, but Better Auth sign-in failed: ${await verifiedLogin.text()}`,
    );
  }
}
