'use strict';

const { app } = require('electron');

if (process.platform === 'linux' && process.env.MEMOFLOW_E2E_USE_GNOME_KEYRING === '1') {
  // Playwright's Electron loader installs Chromium's test defaults before app ready:
  // password-store=basic and use-mock-keychain. HARD-7101 must exercise the real
  // Linux Secret Service path, so restore only those test-only switches here.
  // MemoFlow production startup and safeStorage fail-closed behavior stay untouched.
  app.commandLine.removeSwitch('password-store');
  app.commandLine.removeSwitch('use-mock-keychain');
  app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
}
