import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { AIChannels } from '@memoflow/desktop-contracts';
import { createIsolatedNativeAgentEnvironment } from './packaged-runtime/isolated-native-env';
import { verifyInstalledNativeBinary } from './support/installed-native-provenance';

type Rpc = {
  ok: boolean;
  data?: { status?: string; models?: unknown[]; account?: unknown } | unknown[];
  error?: { code: string };
};
type Bridge = {
  electronAPI: { invoke(channel: string, ...args: unknown[]): Promise<Rpc> };
};

test('installed Windows defaults never expose an unconfigured Codex account or create ghost Native Connections', async () => {
  test.skip(process.platform !== 'win32', 'Installed Windows Electron acceptance only');
  test.setTimeout(100_000);
  const executable = process.env.MEMOFLOW_PACKAGED_EXECUTABLE;
  expect(executable, 'Verified NSIS installed executable must be supplied').toBeTruthy();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-installed-empty-codex-'));
  const isolated = createIsolatedNativeAgentEnvironment(root);
  // Explicitly use a new empty account Home, never the runner's/employee's
  // real Codex Home even when it appears in the Windows user environment.
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    expect(fs.existsSync(executable!)).toBe(true);
    app = await electron.launch({
      executablePath: executable!,
      args: ['--disable-gpu', '--disable-dev-shm-usage'],
      cwd: process.cwd(),
      env: {
        ...isolated,
        MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: path.join(root, 'profile'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });
    const provenance = await verifyInstalledNativeBinary(
      app,
      executable!,
      process.env.MEMOFLOW_QA_EXPECTED_EXE_SHA256!,
      process.env.MEMOFLOW_QA_EXPECTED_VERSION!,
    );
    await test.info().attach('empty-codex-installed-provenance', {
      body: Buffer.from(
        JSON.stringify({
          packaged: provenance.packaged,
          version: provenance.version,
          sha256: provenance.executableSha256,
          nativeInferenceCount: 0,
        }),
      ),
      contentType: 'application/json',
    });
    const window = await app.firstWindow({ timeout: 45_000 });
    await expect(window.getByTestId('app-shell')).toBeVisible({ timeout: 45_000 });
    const before = await window.evaluate(
      (channel) =>
        (window as unknown as Bridge).electronAPI.invoke(channel, { action: 'list_connections' }),
      AIChannels.LOCAL_AGENT,
    );
    expect(before).toMatchObject({ ok: true, data: [] });
    const probe = await window.evaluate(
      (channel) =>
        (window as unknown as Bridge).electronAPI.invoke(channel, {
          action: 'probe_default',
          driver: 'codex',
        }),
      AIChannels.LOCAL_AGENT,
    );
    // Keep the fail-closed assertion, but expose the bounded IPC error code
    // so installed Windows QA distinguishes a test setup failure from a
    // local-Agent runtime/probe regression without logging account details.
    expect(probe.ok, `Codex default probe failed: ${probe.error?.code ?? 'UNKNOWN'}`).toBe(true);
    const status = probe.data as Exclude<Rpc['data'], unknown[]>;
    expect(['not_installed', 'login_required', 'unavailable']).toContain(status.status);
    expect(status.account).toBeUndefined();
    expect(status.models).toBeUndefined();
    const after = await window.evaluate(
      (channel) =>
        (window as unknown as Bridge).electronAPI.invoke(channel, { action: 'list_connections' }),
      AIChannels.LOCAL_AGENT,
    );
    expect(after).toMatchObject({ ok: true, data: [] });
    await window.evaluate(() => {
      window.location.hash = '#/settings?tab=ai';
    });
    const settings = window.getByTestId('ai-settings-panel');
    await expect(settings).toBeVisible({ timeout: 20_000 });
    await settings.getByTestId('ai-provider-select-agent:codex').click();
    await expect(settings.getByTestId('ai-native-auth-summary')).toHaveCount(0);
    // This is explicitly an offline/unauthenticated fixture and never attempts a Send.
  } finally {
    if (app) await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
