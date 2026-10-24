import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { test } from './fixtures/desktop-screenshot-fixture';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..');
const outputDir = path.join(workspaceRoot, 'docs', 'thesis', 'assets', 'desktop-e2e');

async function openDesktopNav(page: Page, label: RegExp): Promise<void> {
  await page.getByRole('button', { name: label }).click();
  await page.waitForTimeout(500);
}

async function saveDesktopScreenshot(page: Page, filename: string): Promise<void> {
  mkdirSync(outputDir, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(outputDir, filename),
    fullPage: false,
  });
}

test('captures desktop goal list for thesis', async ({ desktop }) => {
  await openDesktopNav(desktop.page, /目标|Goals/i);
  await expect(desktop.page.getByTestId('goal-list-view')).toBeVisible();
  await expect(desktop.page.getByRole('heading', { name: /所有目标|All Goals/i })).toBeVisible();

  await saveDesktopScreenshot(desktop.page, 'desktop-goal-list.png');
});

test('captures desktop appearance settings for thesis', async ({ desktop }) => {
  await openDesktopNav(desktop.page, /^设置$/);
  await expect(desktop.page.getByRole('heading', { name: /应用设置|App Settings/i })).toBeVisible();
  await desktop.page.getByRole('tab', { name: /外观|Appearance/i }).click();
  await expect(desktop.page.getByRole('combobox', { name: /主题|Theme/i })).toBeVisible();

  await saveDesktopScreenshot(desktop.page, 'desktop-settings-appearance.png');
});

test('captures desktop language settings for thesis', async ({ desktop }) => {
  await openDesktopNav(desktop.page, /^设置$/);
  await expect(desktop.page.getByRole('heading', { name: /应用设置|App Settings/i })).toBeVisible();
  await desktop.page.getByRole('tab', { name: /区域|Locale/i }).click();
  await expect(desktop.page.getByText(/语言|Language/i).first()).toBeVisible();

  await saveDesktopScreenshot(desktop.page, 'desktop-settings-language.png');
});

test('captures desktop AI provider settings for thesis', async ({ desktop }) => {
  await openDesktopNav(desktop.page, /^设置$/);
  await expect(desktop.page.getByRole('heading', { name: /应用设置|App Settings/i })).toBeVisible();
  await desktop.page.getByRole('tab', { name: /^AI$/i }).click();
  await expect(desktop.page.getByText(/AI 助手|AI Assistant/i)).toBeVisible();

  await saveDesktopScreenshot(desktop.page, 'desktop-settings-ai-provider.png');
});

test('captures desktop AI chat page for thesis', async ({ desktop }) => {
  await openDesktopNav(desktop.page, /AI 对话|AI Chat/i);
  await expect(desktop.page.getByText(/AI 对话|AI Chat/i).first()).toBeVisible();

  await saveDesktopScreenshot(desktop.page, 'desktop-ai-chat.png');
});
