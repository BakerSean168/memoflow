import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:58080';
const OUT = path.resolve('reports/pm-journey');
const SHOTS = path.join(OUT, 'shots2');
fs.mkdirSync(SHOTS, { recursive: true });

const email = process.env.PM_EMAIL;
const password = 'Test123456!';
const log = [];
const apiErrors = [];

function record(step, status, detail = '') {
  log.push({ step, status, detail });
  console.log(`[${status}] ${step}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
const page = await ctx.newPage();
page.on('response', (r) => {
  if (r.status() >= 400 && r.url().includes('/api/')) {
    apiErrors.push(r.status() + ' ' + r.url().slice(0, 150));
  }
});

async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}
async function step(name, fn) {
  try {
    await fn();
    record(name, 'OK');
  } catch (e) {
    record(name, 'FAIL', String(e).split('\n')[0]);
    await shot(`ERR-${name.replace(/[^\w-]/g, '_')}`);
  }
}

await step('login', async () => {
  await page.goto(BASE + '/auth', { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);
});

await step('goal-plus-dialog', async () => {
  await page.goto(BASE + '/goals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const plus = page
    .locator('button')
    .filter({ has: page.locator('svg.lucide-plus') })
    .first();
  await plus.click({ timeout: 8000 });
  await page.waitForTimeout(1500);
  await shot('20-goal-create-dialog');
  const body = await page.evaluate(() => document.body.innerText);
  record('goal-dialog-text', 'INFO', body.slice(0, 600).replace(/\n+/g, ' | '));
});

await step('goal-fill-and-save', async () => {
  const nameInput = page
    .locator('[role="dialog"] input:visible, .v-overlay input:visible, form input:visible')
    .first();
  await nameInput.fill('Q3 上线知识库检索', { timeout: 8000 });
  await shot('21-goal-filled');
  const save = page
    .locator('[role="dialog"] button, form button, button')
    .filter({ hasText: /保存|创建|确定|提交|Save|Create/i })
    .last();
  await save.click({ timeout: 8000 });
  await page.waitForTimeout(3000);
  await shot('22-goal-after-save');
  const body = await page.evaluate(() => document.body.innerText);
  const times = [
    ...new Set(
      body.match(/(\d{4}[-/年.]\d{1,2}[-/月.]\d{1,2}日?|\d{1,2}:\d{2}|Invalid Date|NaN)/g) ?? [],
    ),
  ];
  record('goal-times', 'INFO', JSON.stringify(times.slice(0, 30)));
});

await step('task-plus-dialog', async () => {
  await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const plus = page
    .locator('button')
    .filter({ has: page.locator('svg.lucide-plus') })
    .first();
  await plus.click({ timeout: 8000 });
  await page.waitForTimeout(1500);
  await shot('23-task-create-dialog');
  const body = await page.evaluate(() => document.body.innerText);
  record('task-dialog-text', 'INFO', body.slice(0, 600).replace(/\n+/g, ' | '));
});

await step('reminder-panel', async () => {
  await page.goto(BASE + '/reminders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const body = await page.evaluate(() => document.body.innerText);
  record('reminder-text', 'INFO', body.slice(0, 400).replace(/\n+/g, ' | '));
  await shot('24-reminders');
});

await step('lang-switch-en', async () => {
  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot('25-settings-zh');
  const langSelect = page
    .locator('select, [role="combobox"]')
    .filter({ hasText: /简体中文/ })
    .first();
  await langSelect.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  await shot('26-settings-lang-open');
});

fs.writeFileSync(
  path.join(OUT, 'journey2-log.json'),
  JSON.stringify({ log, apiErrors: [...new Set(apiErrors)].slice(0, 30) }, null, 2),
);
console.log('=== api errors:', [...new Set(apiErrors)].slice(0, 10).join(' ; '));
await browser.close();
